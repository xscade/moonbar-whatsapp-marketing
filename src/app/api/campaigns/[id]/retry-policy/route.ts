import { z } from "zod";
import { error, handleRouteError, json, requireUser } from "@/lib/api";
import { countRetryWindows, getMaxRetriesCap } from "@/lib/retries/constants";
import {
  cancelPolicy,
  updatePolicy,
  upsertPolicy
} from "@/lib/retries/policy";
import { getCampaignRetryState, serializeState } from "@/lib/retries/service";

export const dynamic = "force-dynamic";

const scheduleSchema = z.object({
  mode: z.enum(["once", "automatic", "until_delivered"]),
  relevantUntil: z.string().datetime(),
  maxRetries: z.number().int().min(1).optional(),
  timezone: z.string().optional()
});

const editSchema = z.object({
  relevantUntil: z.string().datetime().optional(),
  maxRetries: z.number().int().min(0).optional()
});

/** Schedule (or re-schedule) retries for a campaign. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const parsed = scheduleSchema.safeParse(await request.json());
    if (!parsed.success) return error("Invalid retry policy", 422, parsed.error.flatten());

    const state = await getCampaignRetryState(id);
    if (!state) return error("Campaign not found", 404);

    const relevantUntil = new Date(parsed.data.relevantUntil);
    if (relevantUntil.getTime() <= Date.now()) {
      return error("Campaign relevance date must be in the future", 422);
    }

    const { firstEligibleAt, eligibleCount } = state.eligibility;
    if (!eligibleCount || !firstEligibleAt) {
      return error("No eligible Meta-rejected messages to retry", 422);
    }
    if (firstEligibleAt.getTime() > relevantUntil.getTime()) {
      return error(
        "This campaign ends before the 24-hour retry window. No retry can be scheduled.",
        422
      );
    }

    const requestedMax =
      parsed.data.mode === "once"
        ? 1
        : parsed.data.mode === "until_delivered"
          ? countRetryWindows(
              firstEligibleAt.getTime() < Date.now()
                ? new Date()
                : firstEligibleAt,
              relevantUntil
            )
          : Math.min(
              parsed.data.maxRetries ?? state.eligibility.recommendedMaxRetries,
              getMaxRetriesCap()
            );

    await upsertPolicy({
      campaignId: id,
      mode: parsed.data.mode,
      relevantUntil,
      requestedMax: Math.max(1, requestedMax),
      firstEligibleAt,
      createdBy: user._id
    });

    const next = await getCampaignRetryState(id);
    return json(serializeState(next!));
  } catch (err) {
    return handleRouteError(err);
  }
}

/** Edit an existing policy's relevance date and/or max attempts. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const parsed = editSchema.safeParse(await request.json());
    if (!parsed.success) return error("Invalid retry policy update", 422, parsed.error.flatten());

    const state = await getCampaignRetryState(id);
    if (!state) return error("Campaign not found", 404);
    if (!state.policy) return error("No retry policy to update", 404);

    await updatePolicy({
      campaignId: id,
      relevantUntil: parsed.data.relevantUntil
        ? new Date(parsed.data.relevantUntil)
        : undefined,
      maxRetries: parsed.data.maxRetries,
      by: user._id
    });

    const next = await getCampaignRetryState(id);
    return json(serializeState(next!));
  } catch (err) {
    return handleRouteError(err);
  }
}

/** Cancel future retries — history is retained. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const state = await getCampaignRetryState(id);
    if (!state) return error("Campaign not found", 404);
    if (!state.policy) return error("No retry policy to cancel", 404);

    await cancelPolicy(id, user._id);
    const next = await getCampaignRetryState(id);
    return json(serializeState(next!));
  } catch (err) {
    return handleRouteError(err);
  }
}
