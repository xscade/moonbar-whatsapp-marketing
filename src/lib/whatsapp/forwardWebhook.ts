import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";

const FORWARD_TIMEOUT_MS = 10_000;

const TEMPLATE_FIELDS = new Set([
  "message_template_status_update",
  "message_template_quality_update",
  "message_template_components_update",
  "template_category_update"
]);

type ForwardChange = {
  field?: string;
  value?: {
    metadata?: { phone_number_id?: string };
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

// The valet app shares our Meta app, so Meta only calls us. It gets every
// "messages" event for the Moon Bar number (guest messages and delivery
// statuses) and template updates for our WABA. It verifies Meta's signature
// over the body, so a payload can't be trimmed: if any change in it is
// outside that, nothing is forwarded.
export function shouldForwardWebhook(payload: ForwardPayload) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  if (payload?.object !== "whatsapp_business_account") return false;
  if (!Array.isArray(payload.entry)) return false;

  const changes = payload.entry.flatMap((entry) =>
    Array.isArray(entry?.changes)
      ? entry.changes.map((change) => ({ entryId: entry.id, change }))
      : []
  );

  return (
    changes.length > 0 &&
    changes.every(({ entryId, change }) =>
      change?.field === "messages"
        ? Boolean(phoneNumberId) &&
          change.value?.metadata?.phone_number_id === phoneNumberId
        : TEMPLATE_FIELDS.has(change?.field ?? "") &&
          Boolean(wabaId) &&
          entryId === wabaId
    )
  );
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
