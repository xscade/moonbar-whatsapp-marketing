import { z } from "zod";
import { ObjectId, type Db, type Document } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { graphGet, sendTemplate } from "@/lib/whatsapp";
import { extractTemplate, type MetaTemplate } from "@/lib/whatsapp/templates";
import { RETRY_INTERVAL_MS, getMaxRetriesCap } from "@/lib/retries/constants";
import { upsertPolicy } from "@/lib/retries/policy";

export const sendSchema = z.object({
  name: z.string().min(1).optional(),
  templateName: z.string().min(1).optional(),
  language: z.string().min(2).optional(),
  parameters: z.record(z.string()),
  parameterOrder: z.array(z.string()).default([]),
  contactFieldMappings: z.record(z.enum(["name"])).default({}),
  headerImageId: z.string().optional(),
  listIds: z.array(z.string()).default([]),
  contactIds: z.array(z.string()).default([]),
  campaignId: z.string().optional(),
  scheduledAt: z.string().datetime().optional(),
  retryPolicy: z
    .object({
      enabled: z.boolean().default(true),
      mode: z.enum(["once", "automatic"]).default("automatic"),
      relevantUntil: z.string().datetime(),
      maxRetries: z.number().int().min(1).optional(),
      timezone: z.string().optional()
    })
    .optional(),
  batchSize: z.number().int().min(1).max(100).default(25)
});

export type CampaignSendData = z.infer<typeof sendSchema>;

type Recipient = {
  contactId?: string;
  name: string;
  phone: string;
  status: "queued" | "accepted" | "failed" | "canceled";
  messageId?: string;
  error?: string;
  lastStatus?: string;
  lastStatusAt?: Date;
  errors?: unknown;
};

type ContactField = "name";

function isTemplateConfigurationError(message?: string) {
  if (!message) return false;
  return (
    message.includes("#132000") ||
    message.includes("#132012") ||
    message.includes("Number of parameters") ||
    message.includes("Parameter format") ||
    message.includes("Media upload error")
  );
}

function getRecipientFieldValue(recipient: Recipient, field: ContactField) {
  if (field === "name") return recipient.name || "";
  return "";
}

function resolveParametersForRecipient({
  parameters,
  contactFieldMappings,
  recipient
}: {
  parameters: Record<string, string>;
  contactFieldMappings: Record<string, ContactField>;
  recipient: Recipient;
}) {
  const resolved = { ...parameters };
  for (const [parameterName, field] of Object.entries(contactFieldMappings)) {
    resolved[parameterName] = getRecipientFieldValue(recipient, field);
  }
  return resolved;
}

function templateNeedsRefresh(template: Record<string, unknown> | null) {
  if (!template) return true;
  const parameters = Array.isArray(template.parameters) ? template.parameters : [];
  return !template.body && !template.headerFormat && !parameters.length;
}

function addDefaultContactFieldMappings({
  parameterOrder,
  parameters,
  contactFieldMappings
}: {
  parameterOrder: string[];
  parameters: Record<string, string>;
  contactFieldMappings: Record<string, ContactField>;
}) {
  const nextMappings = { ...contactFieldMappings };
  if (
    parameterOrder.includes("name") &&
    !nextMappings.name &&
    !parameters.name?.trim()
  ) {
    nextMappings.name = "name";
  }
  return nextMappings;
}

function getInitialRetryPolicy({
  data,
  startsAt
}: {
  data: CampaignSendData;
  startsAt: Date;
}) {
  if (!data.retryPolicy?.enabled) return null;

  const relevantUntil = new Date(data.retryPolicy.relevantUntil);
  if (Number.isNaN(relevantUntil.getTime())) {
    throw new Error("Pick a valid retry relevancy date");
  }

  const firstEligibleAt = new Date(startsAt.getTime() + RETRY_INTERVAL_MS);
  if (relevantUntil.getTime() < firstEligibleAt.getTime()) {
    throw new Error(
      `Retries need at least 24 hours. Pick a relevancy date after ${firstEligibleAt.toLocaleString()}.`
    );
  }

  const mode = data.retryPolicy.mode;
  const requestedMax =
    mode === "once" ? 1 : data.retryPolicy.maxRetries ?? getMaxRetriesCap();

  return {
    mode,
    relevantUntil,
    requestedMax,
    firstEligibleAt
  };
}

async function refreshTemplateFromMeta({
  templateName,
  language
}: {
  templateName: string;
  language: string;
}) {
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  if (!wabaId) return null;

  const response = await graphGet(`${wabaId}/message_templates`, {
    fields: "id,name,language,category,status,parameter_format,components",
    name: templateName
  });

  if (!response.ok) return null;

  const metaTemplate = ((response.body.data as MetaTemplate[]) ?? []).find(
    (template) => template.name === templateName && template.language === language
  );
  return metaTemplate ? extractTemplate(metaTemplate) : null;
}

async function getTemplateDetails({
  db,
  templateName,
  language
}: {
  db: Awaited<ReturnType<typeof getDb>>;
  templateName: string;
  language: string;
}) {
  const template = await db.collection("message_templates").findOne({
    name: templateName,
    language
  });

  if (!templateNeedsRefresh(template)) return template;

  const latestTemplate = await refreshTemplateFromMeta({ templateName, language });
  if (!latestTemplate) return template;

  const now = new Date();
  await db.collection("message_templates").updateOne(
    { name: latestTemplate.name, language: latestTemplate.language },
    {
      $set: { ...latestTemplate, updatedAt: now },
      $setOnInsert: { createdAt: now }
    },
    { upsert: true }
  );

  return latestTemplate;
}

/**
 * Everything needed to render one recipient's template send. Resolved once per
 * batch (or retry attempt) from the campaign's stored config plus any overrides,
 * so the actual send loop stays cheap.
 */
export type CampaignSendContext = {
  templateName: string;
  language: string;
  parameters: Record<string, string>;
  contactFieldMappings: Record<string, ContactField>;
  parameterOrder: string[];
  parameterFormat: "NAMED" | "POSITIONAL";
  headerImageId?: string;
};

/**
 * Resolves the template + parameters + header image for a campaign, refreshing
 * the template from Meta if the local copy is stale and recovering the header
 * image id from a prior message when needed. Shared by the live send loop and
 * the retry dispatcher so both send through identical logic. Throws if an image
 * header template is missing its media id.
 */
export async function resolveCampaignSendContext({
  db,
  campaign,
  data
}: {
  db: Db;
  campaign: Document;
  data?: Partial<CampaignSendData>;
}): Promise<CampaignSendContext> {
  const templateName = data?.templateName || campaign.templateName;
  const language = data?.language || campaign.language;
  const parameters = Object.keys(data?.parameters || {}).length
    ? (data!.parameters as Record<string, string>)
    : campaign.parameters;
  let contactFieldMappings: Record<string, ContactField> = Object.keys(
    data?.contactFieldMappings || {}
  ).length
    ? (data!.contactFieldMappings as Record<string, ContactField>)
    : campaign.contactFieldMappings || {};
  let parameterOrder: string[] = data?.parameterOrder?.length
    ? data.parameterOrder
    : campaign.parameterOrder || [];
  let headerImageId: string | undefined = data?.headerImageId || campaign.headerImageId;

  if (!headerImageId) {
    const priorMessage = await db.collection("whatsapp_messages").findOne(
      {
        campaignId: campaign._id.toString(),
        "payload.headerImageId": { $exists: true, $ne: "" }
      },
      { projection: { "payload.headerImageId": 1 } }
    );
    headerImageId = priorMessage?.payload?.headerImageId;
  }

  const template = await getTemplateDetails({ db, templateName, language });

  if (!parameterOrder.length && Array.isArray(template?.parameters)) {
    parameterOrder = template.parameters
      .map((parameter: { name?: string }) => parameter.name)
      .filter((name): name is string => Boolean(name));
  }

  contactFieldMappings = addDefaultContactFieldMappings({
    parameterOrder,
    parameters,
    contactFieldMappings
  });

  if (template?.headerFormat === "IMAGE" && !headerImageId) {
    throw new Error(
      "This campaign needs its original header image. Upload and resend as a new campaign, or contact support to recover the media id."
    );
  }

  return {
    templateName,
    language,
    parameters,
    contactFieldMappings,
    parameterOrder,
    parameterFormat:
      (template?.parameterFormat as "NAMED" | "POSITIONAL") || "NAMED",
    headerImageId
  };
}

export type CampaignSendResult = {
  ok: boolean;
  messageId?: string;
  errorMessage?: string;
  messageStatus?: string;
};

/**
 * Sends one template message to a recipient and records the outbound
 * `whatsapp_messages` doc (tagged with retry metadata when this is a retry).
 * Returns the Meta message id + any error so the caller can update recipient
 * state. Used by both the campaign batch loop and the retry dispatcher.
 */
export async function sendCampaignMessage({
  db,
  campaignId,
  context,
  recipient,
  retry
}: {
  db: Db;
  campaignId: string;
  context: CampaignSendContext;
  recipient: { name: string; phone: string };
  retry?: { attemptId: string; attemptNumber: number };
}): Promise<CampaignSendResult> {
  const resolvedParameters = resolveParametersForRecipient({
    parameters: context.parameters,
    contactFieldMappings: context.contactFieldMappings,
    recipient: recipient as Recipient
  });

  const response = await sendTemplate({
    to: recipient.phone,
    templateName: context.templateName,
    language: context.language,
    parameters: resolvedParameters,
    parameterOrder: context.parameterOrder,
    parameterFormat: context.parameterFormat,
    headerImageId: context.headerImageId
  });

  const message = response.result?.messages?.[0];
  if (message?.id) {
    await db.collection("whatsapp_messages").updateOne(
      { messageId: message.id },
      {
        $setOnInsert: {
          messageId: message.id,
          direction: "outbound",
          from: process.env.WHATSAPP_PHONE_NUMBER_ID,
          to: recipient.phone,
          contactName: recipient.name,
          type: "template",
          templateName: context.templateName,
          text: context.templateName,
          payload: {
            templateName: context.templateName,
            language: context.language,
            parameters: resolvedParameters,
            contactFieldMappings: context.contactFieldMappings,
            headerImageId: context.headerImageId
          },
          campaignId,
          ...(retry
            ? { retryAttemptId: retry.attemptId, attemptNumber: retry.attemptNumber }
            : {}),
          createdAt: new Date()
        },
        $set: {
          lastStatus: message.message_status || "accepted",
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );
  }

  const errorMessage = response.ok
    ? undefined
    : response.result?.error?.message || JSON.stringify(response.result);

  return {
    ok: response.ok,
    messageId: message?.id,
    errorMessage,
    messageStatus: message?.message_status
  };
}

/**
 * Creates a campaign document with a snapshot of its recipients. Pass
 * `status: "scheduled"` with a `scheduledAt` to defer sending — the cron
 * runner picks it up once the time is due. Otherwise it is created in
 * "sending" state ready for the batch loop.
 */
export async function createCampaign({
  userId,
  data,
  status = "sending",
  scheduledAt
}: {
  userId: string;
  data: CampaignSendData;
  status?: "sending" | "scheduled";
  scheduledAt?: Date;
}) {
  if (!data.name || !data.templateName || !data.language) {
    throw new Error("Campaign name, template, and language are required");
  }

  const db = await getDb();
  const recipientFilter: Record<string, unknown> = {
    consentStatus: "subscribed"
  };

  if (data.contactIds.length || data.listIds.length) {
    recipientFilter.$or = [];
    if (data.contactIds.length) {
      (recipientFilter.$or as unknown[]).push({
        _id: {
          $in: data.contactIds.filter(ObjectId.isValid).map((id) => new ObjectId(id))
        }
      });
    }
    if (data.listIds.length) {
      (recipientFilter.$or as unknown[]).push({ listIds: { $in: data.listIds } });
    }
  }

  const contacts = await db
    .collection("contacts")
    .find(recipientFilter)
    .limit(5000)
    .toArray();

  if (!contacts.length) throw new Error("No subscribed recipients selected");

  const template = await getTemplateDetails({
    db,
    templateName: data.templateName,
    language: data.language
  });

  if (template?.headerFormat === "IMAGE" && !data.headerImageId) {
    throw new Error("Upload a header image before sending this template");
  }

  const parameterOrder = data.parameterOrder.length
    ? data.parameterOrder
    : Array.isArray(template?.parameters)
      ? template.parameters
          .map((parameter: { name?: string }) => parameter.name)
          .filter((name): name is string => Boolean(name))
      : [];
  const contactFieldMappings = addDefaultContactFieldMappings({
    parameterOrder,
    parameters: data.parameters,
    contactFieldMappings: data.contactFieldMappings
  });

  const now = new Date();
  const initialRetryPolicy = getInitialRetryPolicy({
    data,
    startsAt: scheduledAt ?? now
  });
  const result = await db.collection("campaigns").insertOne({
    name: data.name,
    templateName: data.templateName,
    language: data.language,
    parameters: data.parameters,
    parameterOrder,
    contactFieldMappings,
    headerImageId: data.headerImageId,
    listIds: data.listIds,
    recipients: contacts.map((contact) => ({
      contactId: contact._id.toString(),
      name: contact.name,
      phone: contact.phone,
      status: "queued"
    })),
    status,
    ...(scheduledAt ? { scheduledAt } : {}),
    acceptedCount: 0,
    failedCount: 0,
    createdBy: userId,
    createdAt: now,
    updatedAt: now
  });

  if (initialRetryPolicy) {
    await upsertPolicy({
      campaignId: result.insertedId.toString(),
      mode: initialRetryPolicy.mode,
      relevantUntil: initialRetryPolicy.relevantUntil,
      requestedMax: initialRetryPolicy.requestedMax,
      firstEligibleAt: initialRetryPolicy.firstEligibleAt,
      createdBy: userId
    });
  }

  return result.insertedId;
}

export async function processCampaignBatch({
  campaignId,
  data,
  runner = "manual"
}: {
  campaignId: ObjectId;
  data: CampaignSendData;
  runner?: "manual" | "cron";
}) {
  const db = await getDb();
  const campaign = await db.collection("campaigns").findOne({ _id: campaignId });
  if (!campaign) throw new Error("Campaign not found");

  const scheduledAt = campaign.scheduledAt
    ? new Date(campaign.scheduledAt)
    : null;
  const scheduledAtText =
    scheduledAt && !Number.isNaN(scheduledAt.getTime())
      ? scheduledAt.toLocaleString()
      : "its scheduled time";

  if (runner === "manual") {
    if (campaign.status === "scheduled") {
      throw new Error(
        `This campaign is scheduled for ${scheduledAtText}. Cancel it or wait for the scheduler instead of sending it manually.`
      );
    }
    if (campaign.lockedAt) {
      throw new Error("This campaign is already being processed by the scheduler.");
    }
  } else if (
    campaign.status === "scheduled" &&
    scheduledAt &&
    scheduledAt.getTime() > Date.now()
  ) {
    throw new Error(`Campaign is not due until ${scheduledAtText}`);
  }

  const recipients = Array.isArray(campaign.recipients)
    ? ([...campaign.recipients] as Recipient[])
    : [];
  const total = recipients.length;

  if (campaign.cancelRequested) {
    const now = new Date();
    const canceledRecipients = recipients.map((recipient) =>
      recipient.status === "queued"
        ? {
            ...recipient,
            status: "canceled" as const,
            error: "Campaign canceled before this recipient was sent"
          }
        : recipient
    );
    const acceptedCount = canceledRecipients.filter(
      (recipient) => recipient.status === "accepted"
    ).length;
    const failedCount = canceledRecipients.filter(
      (recipient) => recipient.status === "failed"
    ).length;
    const canceledCount = canceledRecipients.filter(
      (recipient) => recipient.status === "canceled"
    ).length;

    await db.collection("campaigns").updateOne(
      { _id: campaignId },
      {
        $set: {
          recipients: canceledRecipients,
          acceptedCount,
          failedCount,
          status: "canceled",
          canceledAt: campaign.canceledAt || now,
          updatedAt: now
        }
      }
    );

    return {
      campaignId: campaignId.toString(),
      total,
      sent: acceptedCount + failedCount,
      acceptedCount,
      failedCount,
      canceledCount,
      queuedCount: 0,
      done: true,
      canceled: true,
      status: "canceled"
    };
  }

  const batchIndexes = recipients
    .map((recipient, index) => ({ recipient, index }))
    .filter(({ recipient }) => recipient.status === "queued")
    .slice(0, data.batchSize);

  if (!batchIndexes.length) {
    const acceptedCount = recipients.filter((recipient) => recipient.status === "accepted").length;
    const failedCount = recipients.filter((recipient) => recipient.status === "failed").length;
    const finalStatus = failedCount === 0 ? "sent" : acceptedCount > 0 ? "partial" : "failed";
    await db.collection("campaigns").updateOne(
      { _id: campaignId },
      {
        $set: {
          acceptedCount,
          failedCount,
          status: finalStatus,
          sentAt: campaign.sentAt || new Date(),
          updatedAt: new Date()
        }
      }
    );
    return {
      campaignId: campaignId.toString(),
      total,
      sent: total,
      acceptedCount,
      failedCount,
      queuedCount: 0,
      done: true,
      status: finalStatus
    };
  }

  const context = await resolveCampaignSendContext({ db, campaign, data });
  let current: Record<string, unknown> | undefined;

  for (const { recipient, index } of batchIndexes) {
    const sent = await sendCampaignMessage({
      db,
      campaignId: campaignId.toString(),
      context,
      recipient
    });

    if (!sent.ok && isTemplateConfigurationError(sent.errorMessage)) {
      throw new Error(
        `Campaign resume stopped before sending more recipients: ${sent.errorMessage}`
      );
    }

    recipients[index] = {
      ...recipient,
      status: sent.ok ? "accepted" : "failed",
      messageId: sent.messageId,
      error: sent.errorMessage
    };

    current = {
      name: recipient.name,
      phone: recipient.phone,
      status: recipients[index].status,
      error: sent.errorMessage
    };
  }

  const acceptedCount = recipients.filter((recipient) => recipient.status === "accepted").length;
  const failedCount = recipients.filter((recipient) => recipient.status === "failed").length;
  let queuedCount = recipients.filter((recipient) => recipient.status === "queued").length;
  let status = queuedCount > 0
    ? "sending"
    : failedCount === 0
      ? "sent"
      : acceptedCount > 0
        ? "partial"
        : "failed";
  let canceledCount = recipients.filter((recipient) => recipient.status === "canceled").length;

  const latestCampaign = await db.collection("campaigns").findOne(
    { _id: campaignId },
    { projection: { cancelRequested: 1, canceledAt: 1 } }
  );

  if (latestCampaign?.cancelRequested) {
    const now = new Date();
    for (let index = 0; index < recipients.length; index += 1) {
      if (recipients[index].status === "queued") {
        recipients[index] = {
          ...recipients[index],
          status: "canceled",
          error: "Campaign canceled before this recipient was sent"
        };
      }
    }
    queuedCount = 0;
    canceledCount = recipients.filter((recipient) => recipient.status === "canceled").length;
    status = "canceled";
    await db.collection("campaigns").updateOne(
      { _id: campaignId },
      {
        $set: {
          recipients,
          acceptedCount,
          failedCount,
          status,
          canceledAt: latestCampaign.canceledAt || now,
          updatedAt: now
        }
      }
    );

    return {
      campaignId: campaignId.toString(),
      total,
      sent: acceptedCount + failedCount,
      acceptedCount,
      failedCount,
      canceledCount,
      queuedCount,
      done: true,
      canceled: true,
      status,
      current
    };
  }

  await db.collection("campaigns").updateOne(
    { _id: campaignId },
    {
      $set: {
        recipients,
        acceptedCount,
        failedCount,
        status,
        ...(queuedCount === 0 ? { sentAt: new Date() } : {}),
        updatedAt: new Date()
      }
    }
  );

  return {
    campaignId: campaignId.toString(),
    total,
    sent: total - queuedCount,
    acceptedCount,
    failedCount,
    queuedCount,
    done: queuedCount === 0,
    status,
    current
  };
}
