import type { Collection, Db } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type {
  RetryAttemptStatus,
  RetryAuditEntry,
  RetryMode,
  RetryPolicyStatus
} from "@/types/entities";

export const RETRY_POLICIES = "campaign_retry_policies";
export const RETRY_ATTEMPTS = "campaign_retry_attempts";

/** DB-internal policy document (Dates, not serialized strings). */
export type RetryPolicyDoc = {
  campaignId: string;
  enabled: boolean;
  status: RetryPolicyStatus;
  mode: RetryMode;
  retryIntervalHours: number;
  maxRetries: number;
  relevantUntil: Date;
  retryableErrorCodes: number[];
  attemptsMade: number;
  /** Attempt number of the wave currently being drained across cron ticks. */
  activeAttemptNumber?: number | null;
  cachedNextRetryAt: Date | null;
  retryLockedAt?: Date | null;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
  pausedAt?: Date;
  cancelledAt?: Date;
  audit: RetryAuditEntry[];
};

/** DB-internal attempt document. */
export type RetryAttemptDoc = {
  campaignId: string;
  retryPolicyId: string;
  attemptNumber: number;
  scheduledFor: Date;
  startedAt?: Date;
  completedAt?: Date;
  status: RetryAttemptStatus;
  eligibleCount: number;
  submittedCount: number;
  deliveredCount: number;
  readCount: number;
  failedCount: number;
  pendingCount: number;
  skippedCount: number;
  recoveredCount: number;
  cronRunId?: string;
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
};

let indexesReady: Promise<void> | null = null;

/**
 * Creates the unique indexes that back cron idempotency and one-policy-per-campaign.
 * Memoized so it runs at most once per server process (same lazy style as the
 * rest of the app — there are no migrations in this MongoDB codebase).
 */
export async function ensureRetryIndexes(db: Db): Promise<void> {
  if (!indexesReady) {
    indexesReady = (async () => {
      await db
        .collection(RETRY_POLICIES)
        .createIndex({ campaignId: 1 }, { unique: true });
      await db
        .collection(RETRY_ATTEMPTS)
        .createIndex({ campaignId: 1, attemptNumber: 1 }, { unique: true });
      await db.collection(RETRY_ATTEMPTS).createIndex({ idempotencyKey: 1 });
    })().catch((err) => {
      // Reset so a later call can retry index creation instead of caching a failure.
      indexesReady = null;
      throw err;
    });
  }
  return indexesReady;
}

export async function getRetryCollections(): Promise<{
  db: Db;
  policies: Collection<RetryPolicyDoc>;
  attempts: Collection<RetryAttemptDoc>;
}> {
  const db = await getDb();
  await ensureRetryIndexes(db);
  return {
    db,
    policies: db.collection<RetryPolicyDoc>(RETRY_POLICIES),
    attempts: db.collection<RetryAttemptDoc>(RETRY_ATTEMPTS)
  };
}
