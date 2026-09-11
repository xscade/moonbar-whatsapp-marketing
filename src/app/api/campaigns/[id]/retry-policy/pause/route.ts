import { error, handleRouteError, json, requireUser } from "@/lib/api";
import { pausePolicy } from "@/lib/retries/policy";
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
    if (!state?.policy) return error("No retry policy to pause", 404);

    await pausePolicy(id, user._id);
    const next = await getCampaignRetryState(id);
    return json(serializeState(next!));
  } catch (err) {
    return handleRouteError(err);
  }
}
