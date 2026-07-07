/**
 * Global retry dispatcher. Invoked from the existing every-minute cron. It finds
 * due retry policies and sends their eligible 131049-failed recipients in bounded
 * batches through the exact same send path as a normal campaign
 * (`sendCampaignMessage`). It never blindly resends: every recipient is
 * re-validated against the per-recipient 24h clock immediately before sending,
 * and the actual delivery outcome is only recorded later via the Meta webhook.
 *
 * A logical "attempt" is one 24h wave and may span several cron ticks while its
 * due recipients drain; `policy.activeAttemptNumber` tracks the in-flight wave so
 * a multi-tick drain does not inflate the attempt count.
 */
import { ObjectId, type Collection, type Db, type WithId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import {
  resolveCampaignSendContext,
  sendCampaignMessage,
  type CampaignSendContext
} from "@/lib/campaigns";
import { RETRY_INTERVAL_MS, RETRY_STALE_LOCK_MS } from "./constants";
import {
  getRetryCollections,
  type RetryAttemptDoc,
  type RetryPolicyDoc
} from "./db";
import { getDueRetryRecipients, getRetryableFailures, toDate } from "./eligibility";

const RETRY_BATCH_SIZE = 25;

export type RetryDispatchSummary = {
  policiesScanned: number;
  attemptsCreated: number;
  recipientsEnqueued: number;
  expiredPolicies: number;
  skippedRecipients: number;
};

/** Array filter that targets a single embedded recipient (contactId, else phone). */
function recipientFilter(recipient: {
  contactId?: string;
  phone?: string;
}): Record<string, unknown> {
  return recipient.contactId
    ? { "r.contactId": recipient.contactId }
    : { "r.phone": recipient.phone };
}

async function completePolicy(
  policies: Collection<RetryPolicyDoc>,
  id: ObjectId
): Promise<void> {
  await policies.updateOne(
    { _id: id },
    {
      $set: {
        status: "completed",
        enabled: false,
        cachedNextRetryAt: null,
        activeAttemptNumber: null,
        retryLockedAt: null,
        updatedAt: new Date()
      }
    }
  );
}

export async function runDueRetries({
  deadline,
  cronRunId
}: {
  deadline: number;
  cronRunId?: string;
}): Promise<RetryDispatchSummary> {
  const db = await getDb();
  const { policies, attempts } = await getRetryCollections();
  const campaigns = db.collection("campaigns");

  // 1. Expire policies past their relevance window before doing any work.
  const expired = await policies.updateMany(
    { status: { $in: ["active", "paused"] }, relevantUntil: { $lte: new Date() } },
    {
      $set: {
        status: "expired",
        enabled: false,
        cachedNextRetryAt: null,
        activeAttemptNumber: null,
        updatedAt: new Date()
      }
    }
  );

  const summary: RetryDispatchSummary = {
    policiesScanned: 0,
    attemptsCreated: 0,
    recipientsEnqueued: 0,
    expiredPolicies: expired.modifiedCount,
    skippedRecipients: 0
  };

  // 2. Claim due policies one at a time (atomic, stale-lock reclaim) and drain
  //    each fully within the remaining time budget.
  while (Date.now() < deadline) {
    const staleBefore = new Date(Date.now() - RETRY_STALE_LOCK_MS);
    const claim = await policies.findOneAndUpdate(
      {
        enabled: true,
        status: "active",
        relevantUntil: { $gt: new Date() },
        cachedNextRetryAt: { $lte: new Date() },
        $or: [
          { retryLockedAt: null },
          { retryLockedAt: { $exists: false } },
          { retryLockedAt: { $lte: staleBefore } }
        ]
      },
      { $set: { retryLockedAt: new Date(), updatedAt: new Date() } },
      { sort: { cachedNextRetryAt: 1 }, returnDocument: "after" }
    );

    const policy = claim as WithId<RetryPolicyDoc> | null;
    if (!policy?._id) break; // nothing else due

    summary.policiesScanned += 1;
    try {
      const result = await processPolicy({
        db,
        policies,
        attempts,
        campaigns,
        policy,
        deadline,
        cronRunId
      });
      if (result.attemptCreated) summary.attemptsCreated += 1;
      summary.recipientsEnqueued += result.submitted;
      summary.skippedRecipients += result.skipped;
    } catch {
      // Release the lock so a later tick can retry; leave cachedNextRetryAt so it
      // stays due. Never rethrow — one bad policy must not stall the whole run.
      await policies.updateOne(
        { _id: policy._id },
        { $set: { retryLockedAt: null, updatedAt: new Date() } }
      );
    }
  }

  return summary;
}

async function processPolicy({
  db,
  policies,
  attempts,
  campaigns,
  policy,
  deadline,
  cronRunId
}: {
  db: Db;
  policies: Collection<RetryPolicyDoc>;
  attempts: Collection<RetryAttemptDoc>;
  campaigns: Collection;
  policy: WithId<RetryPolicyDoc>;
  deadline: number;
  cronRunId?: string;
}): Promise<{ attemptCreated: boolean; submitted: number; skipped: number }> {
  const outcome = { attemptCreated: false, submitted: 0, skipped: 0 };
  const release = { retryLockedAt: null as Date | null, updatedAt: new Date() };

  if (!ObjectId.isValid(policy.campaignId)) {
    await completePolicy(policies, policy._id);
    return outcome;
  }
  const campaignObjectId = new ObjectId(policy.campaignId);
  const campaign = await campaigns.findOne({ _id: campaignObjectId });

  // Orphaned or cancelled campaign → stop retrying, keep history.
  if (!campaign || campaign.status === "canceled" || campaign.cancelRequested) {
    await policies.updateOne(
      { _id: policy._id },
      {
        $set: {
          status: "cancelled",
          enabled: false,
          cachedNextRetryAt: null,
          activeAttemptNumber: null,
          ...release
        }
      }
    );
    return outcome;
  }

  if (policy.attemptsMade >= policy.maxRetries) {
    await completePolicy(policies, policy._id);
    return outcome;
  }

  // Resolve the send context once; a broken template/header defers the wave.
  let context: CampaignSendContext;
  try {
    context = await resolveCampaignSendContext({ db, campaign });
  } catch (err) {
    await policies.updateOne(
      { _id: policy._id },
      {
        $set: {
          cachedNextRetryAt: new Date(Date.now() + RETRY_INTERVAL_MS),
          ...release
        },
        $push: {
          audit: {
            action: "skipped",
            at: new Date().toISOString(),
            details: err instanceof Error ? err.message : "send context error"
          }
        }
      }
    );
    return outcome;
  }

  const attemptNumber = policy.activeAttemptNumber ?? policy.attemptsMade + 1;
  const now = new Date();

  // Idempotently create/adopt the attempt for this wave. The unique
  // {campaignId, attemptNumber} index makes overlapping cron ticks safe.
  await attempts.updateOne(
    { campaignId: policy.campaignId, attemptNumber },
    {
      $setOnInsert: {
        campaignId: policy.campaignId,
        retryPolicyId: policy._id.toString(),
        attemptNumber,
        scheduledFor: now,
        eligibleCount: 0,
        submittedCount: 0,
        deliveredCount: 0,
        readCount: 0,
        failedCount: 0,
        pendingCount: 0,
        skippedCount: 0,
        recoveredCount: 0,
        cronRunId,
        idempotencyKey: `${policy.campaignId}:${attemptNumber}`,
        createdAt: now
      },
      $set: { status: "processing", startedAt: now, updatedAt: now }
    },
    { upsert: true }
  );
  const attemptDoc = await attempts.findOne({
    campaignId: policy.campaignId,
    attemptNumber
  });
  if (!attemptDoc) {
    await policies.updateOne({ _id: policy._id }, { $set: release });
    return outcome;
  }
  outcome.attemptCreated = true;

  if (policy.activeAttemptNumber !== attemptNumber) {
    await policies.updateOne(
      { _id: policy._id },
      { $set: { activeAttemptNumber: attemptNumber, updatedAt: now } }
    );
  }

  // Drain due recipients in bounded batches until the wave is empty or we run
  // out of time budget.
  let sawInitialEligible = false;
  const processedKeys = new Set<string>();
  while (Date.now() < deadline) {
    const fresh = await campaigns.findOne(
      { _id: campaignObjectId },
      { projection: { recipients: 1, cancelRequested: 1 } }
    );
    if (!fresh || fresh.cancelRequested) break;

    const recipients: Array<Record<string, unknown>> = Array.isArray(fresh.recipients)
      ? fresh.recipients
      : [];
    const due = getDueRetryRecipients(
      { recipients },
      policy.maxRetries,
      new Date(),
      policy.retryIntervalHours
    );
    if (!due.length) break;

    if (!sawInitialEligible) {
      sawInitialEligible = true;
      await attempts.updateOne(
        { _id: attemptDoc._id },
        { $max: { eligibleCount: due.length }, $set: { updatedAt: new Date() } }
      );
    }

    // Only send to recipients not already handled this run. This guarantees each
    // recipient is attempted at most once per invocation even if a recipient
    // update ever fails to match — no duplicate-send spin.
    const actionable = due.filter((r) => {
      const key = (r as { contactId?: string; phone?: string }).contactId
        ?? (r as { phone?: string }).phone;
      return typeof key === "string" && !processedKeys.has(key);
    });
    if (!actionable.length) break;

    const batch = actionable.slice(0, RETRY_BATCH_SIZE);

    // Respect opt-outs discovered after scheduling: drop them from the campaign
    // so they are never retried again, and count them as skipped.
    const contactIds = batch
      .map((r) => (r as { contactId?: string }).contactId)
      .filter((id): id is string => typeof id === "string" && ObjectId.isValid(id));
    const unsubscribed = contactIds.length
      ? new Set(
          (
            await db
              .collection("contacts")
              .find(
                {
                  _id: { $in: contactIds.map((id) => new ObjectId(id)) },
                  consentStatus: "unsubscribed"
                },
                { projection: { _id: 1 } }
              )
              .toArray()
          ).map((c) => c._id.toString())
        )
      : new Set<string>();

    for (const recipient of batch) {
      if (Date.now() >= deadline) break;
      const typed = recipient as {
        contactId?: string;
        name: string;
        phone: string;
        retryCount?: number;
      };
      processedKeys.add(typed.contactId ?? typed.phone);

      if (typed.contactId && unsubscribed.has(typed.contactId)) {
        await campaigns.updateOne(
          { _id: campaignObjectId },
          {
            $set: {
              "recipients.$[r].status": "canceled",
              "recipients.$[r].nextRetryAt": null,
              "recipients.$[r].error": "Recipient opted out before retry",
              updatedAt: new Date()
            }
          },
          { arrayFilters: [recipientFilter(typed)] }
        );
        outcome.skipped += 1;
        await attempts.updateOne(
          { _id: attemptDoc._id },
          { $inc: { skippedCount: 1 }, $set: { updatedAt: new Date() } }
        );
        continue;
      }

      const sent = await sendCampaignMessage({
        db,
        campaignId: policy.campaignId,
        context,
        recipient: { name: typed.name, phone: typed.phone },
        retry: { attemptId: attemptDoc._id.toString(), attemptNumber }
      });

      // On success the recipient becomes "accepted" and leaves the eligible set;
      // its true delivery outcome arrives later via webhook. On an immediate API
      // failure it is marked failed WITHOUT a retryable error code, so it is not
      // retried again (only webhook 131049 failures re-arm nextRetryAt).
      const recipientSet: Record<string, unknown> = sent.ok
        ? {
            "recipients.$[r].status": "accepted",
            "recipients.$[r].lastStatus": "accepted",
            "recipients.$[r].messageId": sent.messageId,
            "recipients.$[r].attemptNumber": attemptNumber,
            "recipients.$[r].nextRetryAt": null,
            "recipients.$[r].errorCode": null,
            "recipients.$[r].errors": null,
            "recipients.$[r].error": null
          }
        : {
            "recipients.$[r].status": "failed",
            "recipients.$[r].lastStatus": "failed",
            "recipients.$[r].attemptNumber": attemptNumber,
            "recipients.$[r].nextRetryAt": null,
            "recipients.$[r].errorCode": null,
            "recipients.$[r].error": sent.errorMessage
          };

      await campaigns.updateOne(
        { _id: campaignObjectId },
        {
          $set: { ...recipientSet, updatedAt: new Date() },
          $inc: { "recipients.$[r].retryCount": 1 }
        },
        { arrayFilters: [recipientFilter(typed)] }
      );

      outcome.submitted += 1;
      await attempts.updateOne(
        { _id: attemptDoc._id },
        {
          $inc: { submittedCount: 1, pendingCount: sent.ok ? 1 : 0, failedCount: sent.ok ? 0 : 1 },
          $set: { updatedAt: new Date() }
        }
      );
    }
  }

  // Is the wave fully drained?
  const after = await campaigns.findOne(
    { _id: campaignObjectId },
    { projection: { recipients: 1 } }
  );
  const remainingDue = after
    ? getDueRetryRecipients(
        { recipients: Array.isArray(after.recipients) ? after.recipients : [] },
        policy.maxRetries,
        new Date(),
        policy.retryIntervalHours
      )
    : [];

  if (remainingDue.length > 0) {
    // Deadline hit mid-wave — keep draining next tick, same attempt number.
    await policies.updateOne(
      { _id: policy._id },
      { $set: { cachedNextRetryAt: new Date(), ...release } }
    );
    return outcome;
  }

  // Wave complete → consume one attempt slot and schedule the next window.
  const attemptsMade = attemptNumber;
  const stillRetryable = after
    ? getRetryableFailures(
        { recipients: Array.isArray(after.recipients) ? after.recipients : [] },
        policy.maxRetries
      )
    : [];

  await attempts.updateOne(
    { _id: attemptDoc._id },
    { $set: { status: "queued", completedAt: new Date(), updatedAt: new Date() } }
  );

  if (attemptsMade >= policy.maxRetries || stillRetryable.length === 0) {
    await completePolicy(policies, policy._id);
    await policies.updateOne(
      { _id: policy._id },
      { $set: { attemptsMade } }
    );
    return outcome;
  }

  // Next wave is due when the soonest still-eligible recipient clears 24h; those
  // that just re-failed get nextRetryAt from the webhook (failedAt + 24h).
  const nextTimes = stillRetryable
    .map((r) => toDate((r as { nextRetryAt?: Date | string }).nextRetryAt))
    .filter((d): d is Date => Boolean(d));
  const nextRetryAt = nextTimes.length
    ? new Date(Math.min(...nextTimes.map((d) => d.getTime())))
    : new Date(Date.now() + RETRY_INTERVAL_MS);

  await policies.updateOne(
    { _id: policy._id },
    {
      $set: {
        attemptsMade,
        activeAttemptNumber: null,
        cachedNextRetryAt: nextRetryAt,
        ...release
      }
    }
  );
  return outcome;
}
