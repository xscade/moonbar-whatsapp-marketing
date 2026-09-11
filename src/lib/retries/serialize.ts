import type { WithId } from "mongodb";
import type {
  RetryAttempt,
  RetryPolicy,
  RetrySummary
} from "@/types/entities";
import type { RetryAttemptDoc, RetryPolicyDoc } from "./db";

function iso(value: Date | null | undefined): string | undefined {
  return value ? new Date(value).toISOString() : undefined;
}

export function serializeRetryPolicy(
  doc: WithId<RetryPolicyDoc>
): RetryPolicy {
  return {
    _id: doc._id.toString(),
    campaignId: doc.campaignId,
    enabled: doc.enabled,
    status: doc.status,
    mode: doc.mode,
    retryIntervalHours: doc.retryIntervalHours,
    maxRetries: doc.maxRetries,
    relevantUntil: new Date(doc.relevantUntil).toISOString(),
    retryableErrorCodes: doc.retryableErrorCodes,
    attemptsMade: doc.attemptsMade,
    cachedNextRetryAt: iso(doc.cachedNextRetryAt) ?? null,
    createdBy: doc.createdBy,
    createdAt: new Date(doc.createdAt).toISOString(),
    updatedAt: new Date(doc.updatedAt).toISOString(),
    pausedAt: iso(doc.pausedAt),
    cancelledAt: iso(doc.cancelledAt),
    audit: doc.audit
  };
}

export function serializeRetryAttempt(
  doc: WithId<RetryAttemptDoc>
): RetryAttempt {
  return {
    _id: doc._id.toString(),
    campaignId: doc.campaignId,
    retryPolicyId: doc.retryPolicyId,
    attemptNumber: doc.attemptNumber,
    scheduledFor: new Date(doc.scheduledFor).toISOString(),
    startedAt: iso(doc.startedAt),
    completedAt: iso(doc.completedAt),
    status: doc.status,
    eligibleCount: doc.eligibleCount,
    submittedCount: doc.submittedCount,
    deliveredCount: doc.deliveredCount,
    readCount: doc.readCount,
    failedCount: doc.failedCount,
    pendingCount: doc.pendingCount,
    skippedCount: doc.skippedCount,
    recoveredCount: doc.recoveredCount,
    cronRunId: doc.cronRunId,
    createdAt: new Date(doc.createdAt).toISOString(),
    updatedAt: new Date(doc.updatedAt).toISOString()
  };
}

/** Compact rollup used to render the campaign-row retry chip without N+1 queries. */
export function buildRetrySummary(params: {
  policy: WithId<RetryPolicyDoc> | null;
  attempts: WithId<RetryAttemptDoc>[];
  eligibleCount: number;
  recoveredCount: number;
}): RetrySummary {
  const { policy, attempts, eligibleCount, recoveredCount } = params;
  const scheduledCount = attempts.filter((a) => a.status === "scheduled").length;
  const processingCount = attempts.filter(
    (a) => a.status === "processing" || a.status === "queued"
  ).length;
  const last = attempts[attempts.length - 1];

  return {
    status: policy?.status ?? "none",
    mode: policy?.mode,
    attemptsMade: policy?.attemptsMade ?? 0,
    maxRetries: policy?.maxRetries ?? 0,
    scheduledCount,
    processingCount,
    recoveredCount,
    eligibleCount,
    nextRetryAt: policy?.cachedNextRetryAt
      ? new Date(policy.cachedNextRetryAt).toISOString()
      : null,
    relevantUntil: policy?.relevantUntil
      ? new Date(policy.relevantUntil).toISOString()
      : null,
    lastAttemptStatus: last?.status
  };
}
