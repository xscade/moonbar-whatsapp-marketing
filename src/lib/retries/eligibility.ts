/**
 * Pure retry-eligibility and scheduling helpers. No DB access — these operate on
 * a campaign's embedded recipients so they can be reused by the dispatcher, the
 * API and (indirectly) the UI, and unit-tested in isolation later.
 *
 * All rules here are advisory previews; the dispatcher re-validates every
 * recipient against the exact per-recipient 24h rule immediately before sending.
 */
import {
  RETRY_INTERVAL_HOURS,
  getMaxRetriesCap,
  isRetryableErrorCode
} from "./constants";

/** Minimal recipient shape these helpers read. Tolerates Date or ISO string. */
export type RetryRecipientLike = {
  status?: string;
  lastStatus?: string;
  lastStatusAt?: Date | string;
  errors?: unknown;
  errorCode?: number;
  failedAt?: Date | string;
  nextRetryAt?: Date | string;
  retryCount?: number;
  recovered?: boolean;
};

export type CampaignLike = {
  recipients?: RetryRecipientLike[];
};

export function toDate(value: Date | string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Reads the Meta error code, falling back to the raw webhook `errors[]` array. */
export function getRecipientErrorCode(
  recipient: RetryRecipientLike
): number | undefined {
  if (typeof recipient.errorCode === "number") return recipient.errorCode;
  const errors = recipient.errors;
  if (Array.isArray(errors)) {
    for (const entry of errors) {
      const code = (entry as { code?: unknown })?.code;
      if (typeof code === "number") return code;
    }
  }
  return undefined;
}

/** When the recipient's latest failure happened (fallback: last status timestamp). */
export function getRecipientFailedAt(
  recipient: RetryRecipientLike
): Date | undefined {
  return toDate(recipient.failedAt) ?? toDate(recipient.lastStatusAt);
}

/** True if the recipient has already been delivered or read (never retry these). */
export function isResolved(recipient: RetryRecipientLike): boolean {
  return recipient.lastStatus === "delivered" || recipient.lastStatus === "read";
}

/**
 * A recipient is retryable when its latest confirmed state is a FAILED with a
 * retryable Meta error code, it has not exhausted the retry cap, and it is not
 * already delivered/read/queued/canceled.
 */
export function isRecipientRetryable(
  recipient: RetryRecipientLike,
  maxRetries: number
): boolean {
  if (recipient.status === "queued" || recipient.status === "canceled") return false;
  if (isResolved(recipient)) return false;
  const failed = recipient.status === "failed" || recipient.lastStatus === "failed";
  if (!failed) return false;
  if (!isRetryableErrorCode(getRecipientErrorCode(recipient))) return false;
  if ((recipient.retryCount ?? 0) >= maxRetries) return false;
  return true;
}

/** All recipients currently eligible for a retry (ignores the 24h clock). */
export function getRetryableFailures<T extends RetryRecipientLike>(
  campaign: { recipients?: T[] },
  maxRetries = getMaxRetriesCap()
): T[] {
  return (campaign.recipients ?? []).filter((recipient) =>
    isRecipientRetryable(recipient, maxRetries)
  );
}

/** Recipients whose 24h window has elapsed and are due to send right now. */
export function getDueRetryRecipients<T extends RetryRecipientLike>(
  campaign: { recipients?: T[] },
  maxRetries: number,
  now: Date = new Date(),
  intervalHours = RETRY_INTERVAL_HOURS
): T[] {
  const intervalMs = intervalHours * 60 * 60 * 1000;
  return getRetryableFailures(campaign, maxRetries).filter((recipient) => {
    const explicitNext = toDate(recipient.nextRetryAt);
    if (explicitNext) return explicitNext.getTime() <= now.getTime();
    const failedAt = getRecipientFailedAt(recipient);
    if (!failedAt) return false;
    return failedAt.getTime() + intervalMs <= now.getTime();
  });
}

export type RetryEligibility = {
  eligibleCount: number;
  ineligibleFailedCount: number;
  deliveredCount: number;
  firstEligibleAt: Date | null;
  recommendedMaxRetries: number;
  errorCode: number;
};

/**
 * Summary shown in the drawer's eligibility card. `firstEligibleAt` is the
 * earliest moment any eligible recipient clears its 24h window.
 */
export function getRetryEligibility(
  campaign: CampaignLike,
  options: { relevantUntil?: Date | null; maxRetries?: number } = {}
): RetryEligibility {
  const cap = options.maxRetries ?? getMaxRetriesCap();
  const recipients = campaign.recipients ?? [];
  const eligible = getRetryableFailures({ recipients }, cap);

  let firstEligibleAt: Date | null = null;
  for (const recipient of eligible) {
    const failedAt = getRecipientFailedAt(recipient);
    if (!failedAt) continue;
    const eligibleAt = new Date(
      failedAt.getTime() + RETRY_INTERVAL_HOURS * 60 * 60 * 1000
    );
    if (!firstEligibleAt || eligibleAt < firstEligibleAt) firstEligibleAt = eligibleAt;
  }

  const deliveredCount = recipients.filter((r) => isResolved(r)).length;
  const failedTotal = recipients.filter(
    (r) => r.status === "failed" || r.lastStatus === "failed"
  ).length;

  const recommendedMaxRetries =
    firstEligibleAt && options.relevantUntil
      ? Math.max(
          1,
          computeRetrySchedule({
            firstEligibleAt,
            relevantUntil: options.relevantUntil,
            maxRetries: cap
          }).length
        )
      : firstEligibleAt
        ? 1
        : 0;

  return {
    eligibleCount: eligible.length,
    ineligibleFailedCount: Math.max(failedTotal - eligible.length, 0),
    deliveredCount,
    firstEligibleAt,
    recommendedMaxRetries,
    errorCode: 131049
  };
}

export type ScheduledRetryPreview = {
  attemptNumber: number;
  approxAt: Date;
};

/**
 * Backend-authoritative preview of when each retry attempt would run. Attempts
 * are spaced by the fixed interval starting at `firstEligibleAt`, capped so no
 * attempt is ever scheduled after the campaign relevance date or beyond the
 * requested/limit count.
 */
export function computeRetrySchedule(params: {
  firstEligibleAt: Date;
  relevantUntil: Date;
  maxRetries: number;
  intervalHours?: number;
}): ScheduledRetryPreview[] {
  const { firstEligibleAt, relevantUntil, maxRetries } = params;
  const intervalMs = (params.intervalHours ?? RETRY_INTERVAL_HOURS) * 60 * 60 * 1000;
  const cap = Math.min(maxRetries, getMaxRetriesCap());
  const attempts: ScheduledRetryPreview[] = [];

  for (let i = 0; i < cap; i += 1) {
    const approxAt = new Date(firstEligibleAt.getTime() + i * intervalMs);
    if (approxAt.getTime() > relevantUntil.getTime()) break;
    attempts.push({ attemptNumber: i + 1, approxAt });
  }
  return attempts;
}
