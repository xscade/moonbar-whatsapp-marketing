import { z } from "zod";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { graphGet, sendTemplate } from "@/lib/whatsapp";
import { extractTemplate, type MetaTemplate } from "@/lib/whatsapp/templates";

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

  return result.insertedId;
}

export async function processCampaignBatch({
  campaignId,
  data
}: {
  campaignId: ObjectId;
  data: CampaignSendData;
}) {
  const db = await getDb();
  const campaign = await db.collection("campaigns").findOne({ _id: campaignId });
  if (!campaign) throw new Error("Campaign not found");

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

  const templateName = data.templateName || campaign.templateName;
  const language = data.language || campaign.language;
  const parameters = Object.keys(data.parameters || {}).length
    ? data.parameters
    : campaign.parameters;
  let contactFieldMappings = Object.keys(data.contactFieldMappings || {}).length
    ? data.contactFieldMappings
    : campaign.contactFieldMappings || {};
  let parameterOrder = data.parameterOrder?.length
    ? data.parameterOrder
    : campaign.parameterOrder || [];
  let headerImageId = data.headerImageId || campaign.headerImageId;

  if (!headerImageId) {
    const priorMessage = await db.collection("whatsapp_messages").findOne(
      {
        campaignId: campaignId.toString(),
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
  let current: Record<string, unknown> | undefined;

  for (const { recipient, index } of batchIndexes) {
    const resolvedParameters = resolveParametersForRecipient({
      parameters,
      contactFieldMappings,
      recipient
    });

    const response = await sendTemplate({
      to: recipient.phone,
      templateName,
      language,
      parameters: resolvedParameters,
      parameterOrder,
      parameterFormat:
        (template?.parameterFormat as "NAMED" | "POSITIONAL") || "NAMED",
      headerImageId
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
            templateName,
            text: templateName,
            payload: {
              templateName,
              language,
              parameters: resolvedParameters,
              contactFieldMappings,
              headerImageId
            },
            campaignId: campaignId.toString(),
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

    if (!response.ok && isTemplateConfigurationError(errorMessage)) {
      throw new Error(
        `Campaign resume stopped before sending more recipients: ${errorMessage}`
      );
    }

    recipients[index] = {
      ...recipient,
      status: response.ok ? "accepted" : "failed",
      messageId: message?.id,
      error: errorMessage
    };

    current = {
      name: recipient.name,
      phone: recipient.phone,
      status: recipients[index].status,
      error: errorMessage
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
