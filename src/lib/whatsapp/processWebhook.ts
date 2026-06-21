import { getDb } from "@/lib/mongodb";
import { processIncomingMessages } from "@/lib/whatsapp/processIncoming";
import { processStatuses } from "@/lib/whatsapp/processStatus";
import { processTemplateUpdate } from "@/lib/whatsapp/processTemplateUpdate";

type WebhookChange = {
  field: string;
  value: Record<string, unknown> & {
    messaging_product?: string;
    metadata?: unknown;
    contacts?: unknown[];
    messages?: unknown[];
    statuses?: unknown[];
  };
};

type WebhookEntry = {
  id: string;
  changes?: WebhookChange[];
};

type WebhookPayload = {
  object?: string;
  entry?: WebhookEntry[];
};

export async function processWebhookPayload(payload: WebhookPayload) {
  const db = await getDb();
  const now = new Date();

  await db.collection("whatsapp_webhook_events").insertOne({
    object: payload.object,
    payload,
    createdAt: now
  });

  const results = {
    inboundMessages: 0,
    statuses: 0,
    templateEvents: 0,
    ignored: 0
  };

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const context = {
        wabaId: entry.id,
        field: change.field,
        metadata: change.value.metadata
      };

      if (change.field === "messages") {
        const incoming = await processIncomingMessages(
          (change.value.messages ?? []) as never[],
          (change.value.contacts ?? []) as never[],
          context
        );
        const statuses = await processStatuses(
          (change.value.statuses ?? []) as never[],
          context
        );
        results.inboundMessages += incoming.inserted;
        results.statuses += statuses.updated;
      } else if (
        change.field === "message_template_status_update" ||
        change.field === "message_template_quality_update" ||
        change.field === "phone_number_name_update" ||
        change.field === "phone_number_quality_update"
      ) {
        await processTemplateUpdate(change.field, change.value, context);
        results.templateEvents += 1;
      } else {
        results.ignored += 1;
      }
    }
  }

  return results;
}
