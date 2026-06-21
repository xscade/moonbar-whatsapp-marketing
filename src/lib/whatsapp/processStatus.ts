import { getDb } from "@/lib/mongodb";

type MessageStatus = {
  id: string;
  status: "sent" | "delivered" | "read" | "failed" | string;
  timestamp?: string;
  recipient_id?: string;
  errors?: Array<{ code?: number; title?: string; message?: string; error_data?: unknown }>;
  conversation?: unknown;
  pricing?: unknown;
};

export async function processStatuses(
  statuses: MessageStatus[],
  context: Record<string, unknown> = {}
) {
  if (!statuses.length) return { updated: 0 };

  const db = await getDb();
  const now = new Date();
  let updated = 0;

  for (const status of statuses) {
    const statusAt = status.timestamp
      ? new Date(Number(status.timestamp) * 1000)
      : now;

    await db.collection("whatsapp_message_statuses").updateOne(
      { messageId: status.id, status: status.status },
      {
        $setOnInsert: {
          messageId: status.id,
          status: status.status,
          recipientId: status.recipient_id,
          errors: status.errors,
          conversation: status.conversation,
          pricing: status.pricing,
          context,
          createdAt: statusAt
        },
        $set: { updatedAt: now }
      },
      { upsert: true }
    );

    await db.collection("whatsapp_messages").updateOne(
      { messageId: status.id },
      {
        $set: {
          lastStatus: status.status,
          lastStatusAt: statusAt,
          errors: status.errors,
          updatedAt: now
        },
        $setOnInsert: {
          messageId: status.id,
          direction: "outbound",
          to: status.recipient_id,
          type: "template",
          createdAt: statusAt
        }
      },
      { upsert: true }
    );
    updated += 1;
  }

  return { updated };
}
