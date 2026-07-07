/**
 * Retry-feature configuration. Single source of truth so the 24-hour rule and
 * safety caps are not duplicated across the dispatcher, API and UI.
 *
 * The 24-hour interval is fixed by Meta's guidance for error 131049 ("This
 * message was not delivered to maintain healthy ecosystem engagement") and must
 * never be editable below 24 hours.
 */

/** Fixed minimum spacing between retries of the same recipient, in hours. */
export const RETRY_INTERVAL_HOURS = 24;

/**
 * Default cap on how many retry attempts a single policy may schedule. Override
 * per-deployment with RETRY_MAX_ATTEMPTS. Kept as a getter so it reads the env
 * at call time (tests / server settings) rather than being frozen at import.
 */
export const MAX_RETRIES_DEFAULT = 3;

export function getMaxRetriesCap(): number {
  const raw = Number(process.env.RETRY_MAX_ATTEMPTS);
  if (Number.isFinite(raw) && raw >= 1) return Math.floor(raw);
  return MAX_RETRIES_DEFAULT;
}

/**
 * Meta error codes we currently allow retrying. 131049 is the only supported
 * reason: the recipient may become eligible again later. Never retry all failed
 * messages indiscriminately.
 */
export const RETRYABLE_ERROR_CODES = [131049] as const;

export const RETRY_INTERVAL_MS = RETRY_INTERVAL_HOURS * 60 * 60 * 1000;

export function countRetryWindows(
  firstRetryAt: Date,
  relevantUntil: Date
): number {
  if (relevantUntil.getTime() < firstRetryAt.getTime()) return 0;
  return (
    Math.floor(
      (relevantUntil.getTime() - firstRetryAt.getTime()) / RETRY_INTERVAL_MS
    ) + 1
  );
}

/** How long a per-campaign retry lock may be held before a later tick reclaims it. */
export const RETRY_STALE_LOCK_MS = 3 * 60_000;

export function isRetryableErrorCode(code: unknown): boolean {
  return (
    typeof code === "number" &&
    (RETRYABLE_ERROR_CODES as readonly number[]).includes(code)
  );
}
