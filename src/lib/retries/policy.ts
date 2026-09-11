/**
 * Retry-policy lifecycle: schedule, edit, pause, resume, cancel. One policy per
 * campaign (unique index). Cancellation never deletes history — it flips status
 * and cancels only still-scheduled future attempts. Every mutation appends to an
 * `audit[]` trail for the campaign details view.
 */
import type { WithId } from "mongodb";
import {
  RETRY_INTERVAL_HOURS,
  RETRYABLE_ERROR_CODES,
  getMaxRetriesCap
} from "./constants";
import {
  getRetryCollections,
  type RetryAttemptDoc,
  type RetryPolicyDoc
} from "./db";

export async function getPolicyDoc(
  campaignId: string
): Promise<WithId<RetryPolicyDoc> | null> {
  const { policies } = await getRetryCollections();
  return policies.findOne({ campaignId });
}

export async function getAttemptDocs(
  campaignId: string
): Promise<WithId<RetryAttemptDoc>[]> {
  const { attempts } = await getRetryCollections();
  return attempts.find({ campaignId }).sort({ attemptNumber: 1 }).toArray();
}

/**
 * Schedules (or re-schedules) retries. `requestedMax` is the number of NEW
 * attempts to allow from now, so scheduling always adds attempts on top of any
 * already completed — the absolute `maxRetries` cap = attemptsMade + requestedMax.
 * This keeps attempt numbers monotonic and makes "Retry once" always add exactly
 * one attempt regardless of history.
 */
export async function upsertPolicy(params: {
  campaignId: string;
  mode: "once" | "automatic" | "until_delivered";
  relevantUntil: Date;
  requestedMax: number;
  firstEligibleAt: Date | null;
  createdBy?: string;
}): Promise<WithId<RetryPolicyDoc>> {
  const { policies } = await getRetryCollections();
  const now = new Date();
  const existing = await policies.findOne({ campaignId: params.campaignId });
  const attemptsMade = existing?.attemptsMade ?? 0;
  const cap = getMaxRetriesCap();
  const requestedMax = Math.max(
    1,
    params.mode === "once"
      ? 1
      : params.mode === "until_delivered"
        ? params.requestedMax
        : Math.min(params.requestedMax, cap)
  );
  const maxRetries = attemptsMade + requestedMax;

  const auditEntry = {
    action: existing ? "rescheduled" : "scheduled",
    by: params.createdBy,
    at: now.toISOString(),
    details: `${params.mode}, up to ${requestedMax} attempt(s), relevant until ${params.relevantUntil.toISOString()}`
  };

  const set: Partial<RetryPolicyDoc> = {
    enabled: true,
    status: "active",
    mode: params.mode,
    retryIntervalHours: RETRY_INTERVAL_HOURS,
    maxRetries,
    relevantUntil: params.relevantUntil,
    retryableErrorCodes: [...RETRYABLE_ERROR_CODES],
    cachedNextRetryAt: params.firstEligibleAt,
    retryLockedAt: null,
    updatedAt: now
  };

  if (existing) {
    await policies.updateOne(
      { campaignId: params.campaignId },
      { $set: set, $unset: { pausedAt: "", cancelledAt: "" }, $push: { audit: auditEntry } }
    );
  } else {
    await policies.insertOne({
      campaignId: params.campaignId,
      attemptsMade: 0,
      createdBy: params.createdBy,
      createdAt: now,
      audit: [auditEntry],
      ...set
    } as RetryPolicyDoc);
  }

  const doc = await policies.findOne({ campaignId: params.campaignId });
  if (!doc) throw new Error("Failed to persist retry policy");
  return doc;
}

export async function updatePolicy(params: {
  campaignId: string;
  relevantUntil?: Date;
  maxRetries?: number;
  by?: string;
}): Promise<WithId<RetryPolicyDoc>> {
  const { policies } = await getRetryCollections();
  const existing = await policies.findOne({ campaignId: params.campaignId });
  if (!existing) throw new Error("No retry policy to update");

  const now = new Date();
  const set: Partial<RetryPolicyDoc> = { updatedAt: now };
  const details: string[] = [];

  if (params.relevantUntil) {
    if (params.relevantUntil.getTime() <= now.getTime()) {
      throw new Error("Campaign relevance date must be in the future");
    }
    set.relevantUntil = params.relevantUntil;
    details.push(`relevant until ${params.relevantUntil.toISOString()}`);
  }

  if (typeof params.maxRetries === "number") {
    // Never below attempts already completed; never above attemptsMade + cap.
    const floor = existing.attemptsMade;
    const ceil = existing.attemptsMade + getMaxRetriesCap();
    const nextMax = Math.min(Math.max(params.maxRetries, floor), ceil);
    set.maxRetries = nextMax;
    // Re-open a completed policy if the user granted more attempts.
    if (existing.status === "completed" && nextMax > existing.attemptsMade) {
      set.status = "active";
      set.enabled = true;
    }
    details.push(`max attempts ${nextMax}`);
  }

  await policies.updateOne(
    { campaignId: params.campaignId },
    {
      $set: set,
      $push: {
        audit: {
          action: "edited",
          by: params.by,
          at: now.toISOString(),
          details: details.join(", ") || undefined
        }
      }
    }
  );

  const doc = await policies.findOne({ campaignId: params.campaignId });
  if (!doc) throw new Error("Retry policy vanished during update");
  return doc;
}

async function setPolicyStatus(
  campaignId: string,
  status: RetryPolicyDoc["status"],
  by: string | undefined,
  extra: Partial<RetryPolicyDoc> = {}
): Promise<WithId<RetryPolicyDoc> | null> {
  const { policies } = await getRetryCollections();
  const now = new Date();
  await policies.updateOne(
    { campaignId },
    {
      $set: { status, enabled: status === "active", updatedAt: now, ...extra },
      $push: { audit: { action: status, by, at: now.toISOString() } }
    }
  );
  return policies.findOne({ campaignId });
}

export function pausePolicy(campaignId: string, by?: string) {
  return setPolicyStatus(campaignId, "paused", by, { pausedAt: new Date() });
}

export function resumePolicy(campaignId: string, by?: string) {
  return setPolicyStatus(campaignId, "active", by, { retryLockedAt: null });
}

/** Cancels future retries; keeps the policy + attempt history for reporting. */
export async function cancelPolicy(campaignId: string, by?: string) {
  const { attempts } = await getRetryCollections();
  await attempts.updateMany(
    { campaignId, status: "scheduled" },
    { $set: { status: "cancelled", updatedAt: new Date() } }
  );
  return setPolicyStatus(campaignId, "cancelled", by, { cancelledAt: new Date() });
}
