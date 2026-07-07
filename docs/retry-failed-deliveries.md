# Retry Failed Deliveries

Automatically re-attempt WhatsApp marketing messages that Meta rejected with
error **131049** ("This message was not delivered to maintain healthy ecosystem
engagement"), 24 hours apart, while the campaign is still relevant — and report
how many deliveries were recovered.

> Retrying **may** recover additional deliveries, but delivery is never
> guaranteed and does not give the business priority over other brands. Only
> error 131049 is retried; all other failures are ignored.

---

## How it works

```
cron-job.org ──POST every minute──▶ /api/cron/campaigns
                                        ├─ runDueCampaigns()   (existing sender)
                                        └─ runDueRetries()     (retry dispatcher)  ← new
                                              │
                                              ├─ find due retry policies
                                              ├─ pick recipients failed w/ 131049 whose 24h has elapsed
                                              ├─ send via the SAME path as a normal campaign
                                              └─ record outcomes later from the Meta webhook
```

There is **one global dispatcher**, not one cron job per campaign. The retry
dispatcher is folded into the existing every-minute campaign cron, so **no new
cron-job.org job and no new secret are required**. The cron only *identifies and
sends due work in bounded batches*; the 24-hour spacing is enforced
per-recipient in the database, independent of how often the cron fires.

- The cron cadence (every minute) and the retry interval (24 hours) are
  deliberately different. A recipient is only ever retried once its own
  `nextRetryAt` (failure time + 24h) has passed.
- Meta only *accepts* the resend during the cron request; the true
  delivered/read/failed outcome arrives later via the webhook
  (`processStatuses`) and is what drives all metrics.

## Data model (MongoDB)

| Collection | Purpose |
| --- | --- |
| `campaign_retry_policies` | One per campaign (unique `campaignId`). Holds mode, `relevantUntil`, `maxRetries`, `attemptsMade`, `cachedNextRetryAt`, status, and an `audit[]` trail. |
| `campaign_retry_attempts` | One per 24h wave. Unique `{campaignId, attemptNumber}` → cron idempotency. Holds per-attempt eligible/submitted/delivered/read/failed/pending/recovered counters. |
| `campaigns.recipients[]` | Extended in place with `errorCode`, `failedAt`, `nextRetryAt`, `retryCount`, `attemptNumber`, `recovered`. All optional — existing campaigns keep working. |
| `campaigns.recoveredCount` | Unique recipients delivered after a retry. |

Indexes are created lazily by `ensureRetryIndexes()` (this codebase has no
migrations); nothing to run by hand.

## Metrics (important)

Retrying the same person creates another **message attempt** but must not
distort the campaign's delivery rate.

- **Campaign delivery rate** (the row's % and bar) stays based on **unique
  recipients** — a retried recipient reuses its existing recipient entry, so the
  denominator never inflates.
- **`+N via retries`** on the delivery cell = unique recipients recovered by a
  retry.
- **Retry recovery rate** (in the metrics accordion, per attempt) =
  `delivered ÷ submitted` for that attempt only.

All counters are derived from persisted recipient/attempt records and are
idempotent against duplicate webhooks (gated on the first time a
`(messageId, status)` pair is seen).

## Environment

| Variable | Required | Notes |
| --- | --- | --- |
| `CRON_SECRET` | yes | Already used by the campaign cron. Also authorizes retries — no separate secret. |
| `RETRY_MAX_ATTEMPTS` | no | Server-side cap on retry attempts per policy. Defaults to **3**. |

## cron-job.org setup

The retry dispatcher runs inside the **existing** WhatsApp campaign cron job. If
that job is already configured, **you are done** — retries are dispatched on the
same schedule.

If you have not set up the cron yet, create one job:

- **Title:** WhatsApp Dispatcher
- **URL:** `https://YOUR-DOMAIN.com/api/cron/campaigns`
- **Method:** `POST`
- **Schedule:** every minute (or every 15 min — retries still respect 24h)
- **Header:** `Authorization: Bearer YOUR_CRON_SECRET`
- Optional headers used for idempotency/observability:
  `X-Cron-Run-Id: %cjo:uuid4%`
- Disable saving response bodies; enable failure notifications.

The endpoint is public over HTTPS but rejects any request without the bearer
secret (`401`). It never returns phone numbers or message contents — only
aggregate counts (`policiesScanned`, `attemptsCreated`, `recipientsEnqueued`,
`expiredPolicies`, `skippedRecipients`).

> Want retries on a *separate* cadence from campaign sending? Add a second
> cron-job.org job pointing at the same URL — the dispatcher is idempotent and
> safe to call concurrently (per-policy lock + unique attempt index).

## API endpoints (all require an authenticated admin session)

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/campaigns/[id]/retry-eligibility` | Eligibility summary + (with `?relevantUntil&maxRetries&mode`) a schedule preview. |
| `POST` | `/api/campaigns/[id]/retry-policy` | Schedule / re-schedule retries. |
| `PATCH` | `/api/campaigns/[id]/retry-policy` | Change relevance date / max attempts. |
| `DELETE` | `/api/campaigns/[id]/retry-policy` | Cancel future retries (history kept). |
| `POST` | `/api/campaigns/[id]/retry-policy/pause` | Pause. |
| `POST` | `/api/campaigns/[id]/retry-policy/resume` | Resume. |
| `GET` | `/api/campaigns/[id]/retry-attempts` | Full policy + attempts + eligibility (powers the accordion). |

## Using it

1. On the Campaigns dashboard, a partial/failed campaign with eligible 131049
   failures shows an **↻ Retry N failed** chip under Resume/Cancel.
2. Click it to open the drawer: pick **Retry once** (default) or **Automatic**,
   set the date the campaign stops being relevant, review the schedule preview,
   and **Schedule**.
3. The chip becomes **↻ Retry on · N scheduled** with the next run time. The
   chevron opens the **Retry performance** panel (recovered, still-eligible,
   attempts, per-attempt table). Scheduled, processing and completed attempts are
   all shown; a live attempt shows "Awaiting delivery updates" until webhooks land.
4. Reopen the drawer any time to pause, resume, edit or cancel.

## Edge cases handled

Campaign expires before first retry · recipients failing at different times ·
campaign cancelled/interrupted mid-schedule · policy paused during processing ·
broken/removed template (wave deferred) · recipient opts out after scheduling
(dropped) · recipient delivered before a scheduled retry (skipped) · duplicate
webhooks (no double counting) · duplicate/overlapping cron calls (unique index +
per-policy lock) · attempts too large for one tick (bounded batches drain across
ticks) · max-retry cap and relevance date both stop future retries.

## Not included

Per the delivery agreement, this feature ships without automated tests or a
recorded live-preview run. The quality gate is `npm run typecheck` +
`npx next build`, both green. Suggested manual QA: schedule a one-time retry on a
campaign with known 131049 failures, confirm the chip + accordion render, force a
cron tick (`POST /api/cron/campaigns` with the bearer secret), and confirm the
attempt row fills in as delivery webhooks arrive.
