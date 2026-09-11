import { error, handleRouteError, json, requireUser } from "@/lib/api";
import { resumePolicy } from "@/lib/retries/policy";
import { getCampaignRetryState, serializeState } from "@/lib/retries/service";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const state = await getCampaignRetryState(id);
    if (!state?.policy) return error("No retry policy to resume", 404);
    if (state.policy.relevantUntil.getTime() <= Date.now()) {
      return error("Campaign relevance date has already passed", 422);
    }

    await resumePolicy(id, user._id);
    const next = await getCampaignRetryState(id);
    return json(serializeState(next!));
  } catch (err) {
    return handleRouteError(err);
  }
}
