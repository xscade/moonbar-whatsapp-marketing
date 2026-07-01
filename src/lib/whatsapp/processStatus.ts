import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

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

    const message = await db.collection("whatsapp_messages").findOne(
      { messageId: status.id },
      { projection: { campaignId: 1, to: 1 } }
    );

    if (message?.campaignId && ObjectId.isValid(String(message.campaignId))) {
      const campaignId = new ObjectId(String(message.campaignId));
      const recipientStatus = status.status === "failed" ? "failed" : "accepted";

      const campaignUpdate = await db.collection("campaigns").updateOne(
        { _id: campaignId },
        {
          $set: {
            "recipients.$[recipient].status": recipientStatus,
            "recipients.$[recipient].lastStatus": status.status,
            "recipients.$[recipient].lastStatusAt": statusAt,
            "recipients.$[recipient].errors": status.errors,
            updatedAt: now
          }
        },
        {
          arrayFilters: [
            {
              "recipient.messageId": status.id
            }
          ]
        }
      );

      if (campaignUpdate.modifiedCount === 0 && (status.recipient_id || message.to)) {
        await db.collection("campaigns").updateOne(
          { _id: campaignId },
          {
            $set: {
              "recipients.$[recipient].status": recipientStatus,
              "recipients.$[recipient].lastStatus": status.status,
              "recipients.$[recipient].lastStatusAt": statusAt,
              "recipients.$[recipient].errors": status.errors,
              updatedAt: now
            }
          },
          {
            arrayFilters: [
              {
                "recipient.phone": status.recipient_id || message.to
              }
            ]
          }
        );
      }

      const campaign = await db.collection("campaigns").findOne(
        { _id: campaignId },
        { projection: { recipients: 1 } }
      );
      const recipients = Array.isArray(campaign?.recipients)
        ? campaign.recipients
        : [];
      const failedCount = recipients.filter(
        (recipient: { status?: string }) => recipient.status === "failed"
      ).length;
      const acceptedCount = recipients.filter(
        (recipient: { status?: string }) =>
          recipient.status !== "queued" && recipient.status !== "failed"
      ).length;

      await db.collection("campaigns").updateOne(
        { _id: campaignId },
        {
          $set: {
            acceptedCount,
            failedCount,
            status:
              failedCount === 0
                ? "sent"
                : acceptedCount > 0
                  ? "partial"
                  : "failed",
            updatedAt: now
          }
        }
      );
    }
    updated += 1;
  }

  return { updated };
}
