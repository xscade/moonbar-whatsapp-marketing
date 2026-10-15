import { ObjectId, type Db } from "mongodb";
import { getDb } from "@/lib/mongodb";

const FORWARD_TIMEOUT_MS = 10_000;

const TEMPLATE_FIELDS = new Set([
  "message_template_status_update",
  "message_template_quality_update",
  "message_template_components_update",
  "template_category_update"
]);

// Valet messages, as the valet team defined them. Tag scans can appear
// anywhere in the text; car requests must be the whole message.
const TAG_SCAN = /\btag\s+(VQ-[A-Z]+\d{2}|[0-9A-F]{6})\b/i;
const CAR_REQUESTS = new Set(["car", "retrieve", "pickup", "get my car"]);

type IncomingMessage = {
  text?: { body?: string };
  button?: { text?: string; payload?: string };
  interactive?: {
    button_reply?: { title?: string };
    list_reply?: { title?: string };
  };
};

type ForwardChange = {
  field?: string;
  value?: {
    metadata?: { phone_number_id?: string };
    messages?: IncomingMessage[];
    statuses?: Array<{ id?: string }>;
    message_template_name?: string;
  };
};

type ForwardPayload = {
  object?: string;
  entry?: Array<{ id?: string; changes?: ForwardChange[] }>;
};

export type ForwardResult = {
  ok: boolean;
  status?: number;
  error?: string;
  durationMs: number;
};

function asArray<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

// Typed text, template quick-reply buttons ("Get My Car") and interactive
// replies are all checked the same way.
export function isValetMessage(message: IncomingMessage) {
  const texts = [
    message?.text?.body,
    message?.button?.text,
    message?.button?.payload,
    message?.interactive?.button_reply?.title,
    message?.interactive?.list_reply?.title
  ];

  return texts.some((text) => {
    if (typeof text !== "string") return false;
    const normalized = text.trim().toLowerCase();
    return (
      TAG_SCAN.test(text) ||
      normalized.startsWith("accept-") ||
      CAR_REQUESTS.has(normalized)
    );
  });
}

// Every send path here stores the message with `from` set; rows that
// processStatuses creates for messages it has never seen do not have it.
// So a status with no such row belongs to a message the valet app sent.
async function hasValetStatus(db: Db, statusIds: string[]) {
  if (!statusIds.length) return false;

  const ours = await db
    .collection("whatsapp_messages")
    .find(
      { messageId: { $in: statusIds }, direction: "outbound", from: { $exists: true } },
      { projection: { messageId: 1 } }
    )
    .toArray();
  const ourIds = new Set(ours.map((message) => message.messageId));

  return statusIds.some((id) => !ourIds.has(id));
}

// Templates created from the dashboard are marked createdVia "dashboard".
// Older ones count as ours if we have ever sent them.
async function isValetTemplate(db: Db, name: string | undefined) {
  if (!name) return true;

  const [created, sent] = await Promise.all([
    db
      .collection("message_templates")
      .findOne({ name, createdVia: "dashboard" }, { projection: { _id: 1 } }),
    db
      .collection("whatsapp_messages")
      .findOne(
        { templateName: name, direction: "outbound", from: { $exists: true } },
        { projection: { _id: 1 } }
      )
  ]);

  return !created && !sent;
}

// The valet app shares our Meta app, so Meta only calls us. It gets valet
// guest messages, delivery statuses for messages it sent, and updates for
// templates we didn't create. It verifies Meta's signature over the body, so
// a payload can't be trimmed: one valet item forwards the whole payload, and
// one change for another number or account blocks it.
export async function shouldForwardWebhook(payload: ForwardPayload) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  if (!process.env.VALET_WEBHOOK_FORWARD_URL) return false;
  if (payload?.object !== "whatsapp_business_account") return false;
  if (!Array.isArray(payload.entry)) return false;

  const changes = payload.entry.flatMap((entry) =>
    Array.isArray(entry?.changes)
      ? entry.changes.map((change) => ({ entryId: entry.id, change }))
      : []
  );

  const allForMoonBar =
    changes.length > 0 &&
    changes.every(({ entryId, change }) =>
      change?.field === "messages"
        ? Boolean(phoneNumberId) &&
          change.value?.metadata?.phone_number_id === phoneNumberId
        : TEMPLATE_FIELDS.has(change?.field ?? "") &&
          Boolean(wabaId) &&
          entryId === wabaId
    );
  if (!allForMoonBar) return false;

  const messageChanges = changes.filter(({ change }) => change.field === "messages");
  if (
    messageChanges.some(({ change }) =>
      asArray(change.value?.messages).some(isValetMessage)
    )
  ) {
    return true;
  }

  const statusIds = messageChanges.flatMap(({ change }) =>
    asArray(change.value?.statuses)
      .map((status) => status?.id)
      .filter((id): id is string => typeof id === "string")
  );
  const templateNames = changes
    .filter(({ change }) => change.field !== "messages")
    .map(({ change }) => change.value?.message_template_name);
  if (!statusIds.length && !templateNames.length) return false;

  try {
    const db = await getDb();
    if (await hasValetStatus(db, statusIds)) return true;

    for (const name of templateNames) {
      if (await isValetTemplate(db, name)) return true;
    }
    return false;
  } catch (err) {
    // We can't tell whose they are, so forward: the valet app must not miss its own.
    console.warn("Could not check WhatsApp webhook ownership", describeError(err));
    return true;
  }
}

function describeError(err: unknown) {
  if (!(err instanceof Error)) return String(err);
  if (err.name === "TimeoutError") return `Timed out after ${FORWARD_TIMEOUT_MS}ms`;

  const cause = err.cause instanceof Error ? `: ${err.cause.message}` : "";
  return `${err.message}${cause}`;
}

// Sends Meta's request on unchanged: the exact body bytes and its signature.
// Never throws; a failed forward must not stop us acknowledging Meta.
export async function forwardWebhook(
  body: ArrayBuffer,
  signature: string
): Promise<ForwardResult | null> {
  const url = process.env.VALET_WEBHOOK_FORWARD_URL;
  if (!url) return null;

  const startedAt = Date.now();
  let result: ForwardResult;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Signature-256": signature
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS)
    });
    const responseText = await response.text();

    result = {
      ok: response.ok,
      status: response.status,
      durationMs: Date.now() - startedAt,
      ...(response.ok ? {} : { error: responseText.slice(0, 300) })
    };
  } catch (err) {
    result = {
      ok: false,
      error: describeError(err),
      durationMs: Date.now() - startedAt
    };
  }

  if (result.ok) {
    console.info("WhatsApp webhook forwarded", result);
  } else {
    console.warn("WhatsApp webhook forward failed", result);
  }

  return result;
}

export async function recordWebhookForward(eventId: ObjectId, forward: ForwardResult) {
  try {
    const db = await getDb();
    await db
      .collection("whatsapp_webhook_events")
      .updateOne({ _id: eventId }, { $set: { forward } });
  } catch (err) {
    console.warn("Could not record WhatsApp webhook forward", describeError(err));
  }
}
