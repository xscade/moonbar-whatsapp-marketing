import { error, handleRouteError, json, requireUser } from "@/lib/api";
import { getCampaignRetryState, serializeState } from "@/lib/retries/service";

export const dynamic = "force-dynamic";

/** Full retry state for a campaign — powers the metrics accordion + details view. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();
    const { id } = await params;
    const state = await getCampaignRetryState(id);
    if (!state) return error("Campaign not found", 404);

    return json({
      ...serializeState(state),
      eligibility: {
        eligibleCount: state.eligibility.eligibleCount,
        ineligibleCount: state.eligibility.ineligibleFailedCount,
        firstEligibleAt: state.eligibility.firstEligibleAt
          ? state.eligibility.firstEligibleAt.toISOString()
          : null,
        errorCode: state.eligibility.errorCode
      }
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
