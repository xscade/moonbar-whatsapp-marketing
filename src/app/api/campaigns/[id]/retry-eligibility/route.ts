import { error, handleRouteError, json, requireUser } from "@/lib/api";
import { buildEligibilityResponse, getCampaignRetryState } from "@/lib/retries/service";

export const dynamic = "force-dynamic";

function parseDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Eligibility summary for the retry drawer. Optional query params
 * (?relevantUntil, ?maxRetries, ?mode) return a backend-authoritative schedule
 * preview so the drawer never has to guess attempt timings client-side.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();
    const { id } = await params;

    const state = await getCampaignRetryState(id);
    if (!state) return error("Campaign not found", 404);

    const url = new URL(request.url);
    const relevantUntil = parseDate(url.searchParams.get("relevantUntil"));
    const maxRetriesRaw = url.searchParams.get("maxRetries");
    const modeRaw = url.searchParams.get("mode");
    const mode =
      modeRaw === "automatic" || modeRaw === "once" || modeRaw === "until_delivered"
        ? modeRaw
        : undefined;

    return json(
      buildEligibilityResponse(state, {
        relevantUntil,
        maxRetries: maxRetriesRaw ? Number(maxRetriesRaw) : undefined,
        mode
      })
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
