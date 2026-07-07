/**
 * Read-side helpers that assemble the retry view models for the API: per-campaign
 * eligibility + policy + attempts, and the batched enrichment used by the
 * campaigns list so the row chip renders without N+1 queries.
 */
import { ObjectId, type WithId } from "mongodb";
import type { Document } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type { RetryPolicy, RetrySummary } from "@/types/entities";
import { getRetryCollections, type RetryAttemptDoc, type RetryPolicyDoc } from "./db";
import {
  computeRetrySchedule,
  getRetryEligibility,
  type RetryEligibility,
  type ScheduledRetryPreview
} from "./eligibility";
import {
  buildRetrySummary,
  serializeRetryAttempt,
  serializeRetryPolicy
} from "./serialize";

function countRecovered(campaign: Document): number {
  const recipients: Array<{ recovered?: boolean }> = Array.isArray(campaign.recipients)
    ? campaign.recipients
    : [];
  return recipients.filter((r) => r.recovered === true).length;
}

export type CampaignRetryState = {
  campaign: WithId<Document>;
  policy: WithId<RetryPolicyDoc> | null;
  attempts: WithId<RetryAttemptDoc>[];
  eligibility: RetryEligibility;
  recoveredCount: number;
};

export async function getCampaignRetryState(
  campaignId: string
): Promise<CampaignRetryState | null> {
  if (!ObjectId.isValid(campaignId)) return null;
  const db = await getDb();
  const campaign = await db
    .collection("campaigns")
    .findOne({ _id: new ObjectId(campaignId) });
  if (!campaign) return null;

  const { policies, attempts } = await getRetryCollections();
  const policy = await policies.findOne({ campaignId });
  const attemptDocs = await attempts
    .find({ campaignId })
    .sort({ attemptNumber: 1 })
    .toArray();

  const eligibility = getRetryEligibility(
    { recipients: campaign.recipients },
    {
      relevantUntil: policy?.relevantUntil ?? null,
      maxRetries: policy?.maxRetries
    }
  );

  return {
    campaign,
    policy,
    attempts: attemptDocs,
    eligibility,
    recoveredCount: countRecovered(campaign)
  };
}

/**
 * Backend-authoritative preview for the drawer: eligibility plus, when a
 * relevance date is supplied, the approximate schedule of each attempt.
 */
export function buildEligibilityResponse(
  state: CampaignRetryState,
  options: { relevantUntil?: Date | null; maxRetries?: number; mode?: "once" | "automatic" }
): {
  eligibleCount: number;
  ineligibleCount: number;
  deliveredCount: number;
  firstEligibleAt: string | null;
  recommendedMaxRetries: number;
  errorCode: number;
  canSchedule: boolean;
  schedule: Array<{ attemptNumber: number; approxAt: string }>;
} {
  const eligibility = getRetryEligibility(
    { recipients: state.campaign.recipients },
    {
      relevantUntil: options.relevantUntil ?? null,
      maxRetries: state.policy?.maxRetries
    }
  );

  let schedule: ScheduledRetryPreview[] = [];
  if (options.relevantUntil && eligibility.firstEligibleAt) {
    const requested =
      options.mode === "once"
        ? 1
        : options.maxRetries ?? eligibility.recommendedMaxRetries;
    schedule = computeRetrySchedule({
      firstEligibleAt: eligibility.firstEligibleAt,
      relevantUntil: options.relevantUntil,
      maxRetries: Math.max(1, requested)
    });
  }

  return {
    eligibleCount: eligibility.eligibleCount,
    ineligibleCount: eligibility.ineligibleFailedCount,
    deliveredCount: eligibility.deliveredCount,
    firstEligibleAt: eligibility.firstEligibleAt
      ? eligibility.firstEligibleAt.toISOString()
      : null,
    recommendedMaxRetries: eligibility.recommendedMaxRetries,
    errorCode: eligibility.errorCode,
    canSchedule: schedule.length > 0,
    schedule: schedule.map((s) => ({
      attemptNumber: s.attemptNumber,
      approxAt: s.approxAt.toISOString()
    }))
  };
}

export function serializeState(state: CampaignRetryState): {
  policy: RetryPolicy | null;
  attempts: ReturnType<typeof serializeRetryAttempt>[];
  summary: RetrySummary;
  recoveredCount: number;
} {
  return {
    policy: state.policy ? serializeRetryPolicy(state.policy) : null,
    attempts: state.attempts.map(serializeRetryAttempt),
    summary: buildRetrySummary({
      policy: state.policy,
      attempts: state.attempts,
      eligibleCount: state.eligibility.eligibleCount,
      recoveredCount: state.recoveredCount
    }),
    recoveredCount: state.recoveredCount
  };
}

/** Batched retry enrichment for a page of campaigns (no N+1). */
export async function buildRetryEnrichment(
  campaigns: WithId<Document>[]
): Promise<
  Record<
    string,
    { retryPolicy: RetryPolicy | null; retrySummary: RetrySummary; eligibleRetryCount: number }
  >
> {
  const ids = campaigns.map((c) => c._id.toString());
  if (!ids.length) return {};

  const { policies, attempts } = await getRetryCollections();
  const [policyDocs, attemptDocs] = await Promise.all([
    policies.find({ campaignId: { $in: ids } }).toArray(),
    attempts.find({ campaignId: { $in: ids } }).toArray()
  ]);

  const policyByCampaign = new Map(policyDocs.map((p) => [p.campaignId, p]));
  const attemptsByCampaign = new Map<string, WithId<RetryAttemptDoc>[]>();
  for (const attempt of attemptDocs) {
    const list = attemptsByCampaign.get(attempt.campaignId) ?? [];
    list.push(attempt);
    attemptsByCampaign.set(attempt.campaignId, list);
  }

  const result: Record<
    string,
    { retryPolicy: RetryPolicy | null; retrySummary: RetrySummary; eligibleRetryCount: number }
  > = {};

  for (const campaign of campaigns) {
    const id = campaign._id.toString();
    const policy = policyByCampaign.get(id) ?? null;
    const campaignAttempts = (attemptsByCampaign.get(id) ?? []).sort(
      (a, b) => a.attemptNumber - b.attemptNumber
    );
    const eligibility = getRetryEligibility(
      { recipients: campaign.recipients },
      {
        relevantUntil: policy?.relevantUntil ?? null,
        maxRetries: policy?.maxRetries
      }
    );
    const recoveredCount = countRecovered(campaign);

    result[id] = {
      retryPolicy: policy ? serializeRetryPolicy(policy) : null,
      retrySummary: buildRetrySummary({
        policy,
        attempts: campaignAttempts,
        eligibleCount: eligibility.eligibleCount,
        recoveredCount
      }),
      eligibleRetryCount: eligibility.eligibleCount
    };
  }

  return result;
}
