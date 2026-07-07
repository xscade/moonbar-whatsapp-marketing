import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { RETRY_INTERVAL_MS, isRetryableErrorCode } from "@/lib/retries/constants";

type MetaError = {
  code?: number;
  title?: string;
  message?: string;
  error_data?: unknown;
};

type MessageStatus = {
  id: string;
  status: "sent" | "delivered" | "read" | "failed" | string;
  timestamp?: string;
  recipient_id?: string;
  errors?: MetaError[];
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

    // The (messageId, status) upsert is our idempotency guard: a duplicate
    // webhook re-runs this loop but does not insert, so counter increments that
    // are gated on `firstTimeForStatus` never double-count.
    const statusInsert = await db.collection("whatsapp_message_statuses").updateOne(
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
    const firstTimeForStatus = statusInsert.upsertedCount > 0;

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
      const campaignIdStr = String(message.campaignId);
      const isFailed = status.status === "failed";
      const errorCode = status.errors?.[0]?.code;
      const errorTitle = status.errors?.[0]?.title;

      const recipientStatus = isFailed ? "failed" : "accepted";
      const recipientSet: Record<string, unknown> = {
        "recipients.$[recipient].status": recipientStatus,
        "recipients.$[recipient].lastStatus": status.status,
        "recipients.$[recipient].lastStatusAt": statusAt,
        "recipients.$[recipient].errors": status.errors ?? null,
        updatedAt: now
      };

      if (isFailed) {
        // Capture the structured failure so eligibility can gate on 131049 and
        // arm the per-recipient 24h clock for the next retry wave.
        recipientSet["recipients.$[recipient].errorCode"] =
          typeof errorCode === "number" ? errorCode : null;
        recipientSet["recipients.$[recipient].errorTitle"] = errorTitle ?? null;
        recipientSet["recipients.$[recipient].failedAt"] = statusAt;
        recipientSet["recipients.$[recipient].nextRetryAt"] = isRetryableErrorCode(
          errorCode
        )
          ? new Date(statusAt.getTime() + RETRY_INTERVAL_MS)
          : null;
      }

      const byMessageId = await db.collection("campaigns").updateOne(
        { _id: campaignId },
        { $set: recipientSet },
        { arrayFilters: [{ "recipient.messageId": status.id }] }
      );

      if (byMessageId.modifiedCount === 0 && (status.recipient_id || message.to)) {
        await db.collection("campaigns").updateOne(
          { _id: campaignId },
          { $set: recipientSet },
          {
            arrayFilters: [
              { "recipient.phone": status.recipient_id || message.to }
            ]
          }
        );
      }

      // Recovery + per-attempt metrics — only on the first time we see this
      // (messageId, status) pair, so duplicate webhooks can't inflate counters.
      if (firstTimeForStatus) {
        const campaignDoc = await db
          .collection("campaigns")
          .findOne({ _id: campaignId }, { projection: { recipients: 1 } });
        const recipients: Array<Record<string, unknown>> = Array.isArray(
          campaignDoc?.recipients
        )
          ? (campaignDoc!.recipients as Array<Record<string, unknown>>)
          : [];
        const recipient =
          recipients.find((r) => r.messageId === status.id) ??
          recipients.find(
            (r) => r.phone === (status.recipient_id || message.to)
          );

        const attemptNumber =
          typeof recipient?.attemptNumber === "number"
            ? (recipient.attemptNumber as number)
            : 0;
        const wasRetried =
          ((recipient?.retryCount as number) ?? 0) > 0 || attemptNumber > 0;
        const isDelivery = status.status === "delivered" || status.status === "read";

        if (isDelivery && wasRetried && recipient?.recovered !== true) {
          await db.collection("campaigns").updateOne(
            { _id: campaignId },
            {
              $set: {
                "recipients.$[recipient].recovered": true,
                "recipients.$[recipient].nextRetryAt": null
              }
            },
            { arrayFilters: [{ "recipient.messageId": status.id }] }
          );
        }

        if (attemptNumber > 0) {
          const inc: Record<string, number> = {};
          if (status.status === "delivered") {
            inc.deliveredCount = 1;
            inc.pendingCount = -1;
            inc.recoveredCount = 1;
          } else if (status.status === "read") {
            inc.readCount = 1;
          } else if (isFailed) {
            inc.failedCount = 1;
            inc.pendingCount = -1;
          }
          if (Object.keys(inc).length) {
            await db.collection("campaign_retry_attempts").updateOne(
              { campaignId: campaignIdStr, attemptNumber },
              { $inc: inc, $set: { updatedAt: now } }
            );

            // Finalize the attempt once every submitted message has resolved so
            // the row chip / accordion move off "in progress".
            const attemptDoc = await db
              .collection("campaign_retry_attempts")
              .findOne({ campaignId: campaignIdStr, attemptNumber });
            if (
              attemptDoc &&
              attemptDoc.submittedCount > 0 &&
              (attemptDoc.pendingCount ?? 0) <= 0 &&
              (attemptDoc.status === "queued" || attemptDoc.status === "processing")
            ) {
              const finalStatus =
                attemptDoc.deliveredCount > 0
                  ? attemptDoc.failedCount > 0
                    ? "partial"
                    : "completed"
                  : "failed";
              await db.collection("campaign_retry_attempts").updateOne(
                { _id: attemptDoc._id },
                { $set: { status: finalStatus, completedAt: now, updatedAt: now } }
              );
            }
          }
        }
      }

      // Recompute campaign aggregates from the recipient snapshot.
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
      const recoveredCount = recipients.filter(
        (recipient: { recovered?: boolean }) => recipient.recovered === true
      ).length;

      await db.collection("campaigns").updateOne(
        { _id: campaignId },
        {
          $set: {
            acceptedCount,
            failedCount,
            recoveredCount,
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
