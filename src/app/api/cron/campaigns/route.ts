import { handleRouteError, json } from "@/lib/api";
import { getDb } from "@/lib/mongodb";
import { processCampaignBatch, sendSchema } from "@/lib/campaigns";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// How long to keep working within a single invocation before returning so the
// serverless function doesn't get killed mid-batch. The next cron tick resumes.
const TIME_BUDGET_MS = 50_000;
// A campaign lock older than this is treated as a dead run (crashed/timed-out)
// and may be reclaimed by a later tick.
const STALE_LOCK_MS = 3 * 60_000;

// Continuation payload: empty values make processCampaignBatch fall back to the
// campaign's own stored template/parameters.
const CONTINUATION = sendSchema.parse({ parameters: {} });

function authorize(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  if (request.headers.get("x-cron-secret") === secret) return true;
  const url = new URL(request.url);
  return url.searchParams.get("secret") === secret;
}

async function runDueCampaigns() {
  const db = await getDb();
  const campaigns = db.collection("campaigns");
  const deadline = Date.now() + TIME_BUDGET_MS;
  const processed: Array<Record<string, unknown>> = [];

  while (Date.now() < deadline) {
    const now = new Date();
    const staleBefore = new Date(Date.now() - STALE_LOCK_MS);

    // Atomically claim the next due campaign so overlapping ticks can't grab
    // the same one. Client-driven sends never carry `scheduledAt`, so they are
    // never claimed here.
    const claim = await campaigns.findOneAndUpdate(
      {
        scheduledAt: { $lte: now },
        status: { $in: ["scheduled", "sending"] },
        cancelRequested: { $ne: true },
        $or: [{ lockedAt: { $exists: false } }, { lockedAt: { $lte: staleBefore } }]
      },
      { $set: { status: "sending", lockedAt: now, updatedAt: now } },
      { sort: { scheduledAt: 1 }, returnDocument: "after" }
    );

    const campaign = claim as { _id?: import("mongodb").ObjectId } | null;
    if (!campaign?._id) break; // nothing else due

    const campaignId = campaign._id;
    let done = false;
    let last: Awaited<ReturnType<typeof processCampaignBatch>> | undefined;
    try {
      while (Date.now() < deadline && !done) {
        last = await processCampaignBatch({ campaignId, data: CONTINUATION });
        done = last.done;
      }
    } catch (err) {
      // Surface the failure but keep the campaign unlocked so a later tick can
      // retry the remaining recipients.
      await campaigns.updateOne(
        { _id: campaignId },
        { $unset: { lockedAt: "" }, $set: { updatedAt: new Date() } }
      );
      processed.push({
        campaignId: campaignId.toString(),
        error: err instanceof Error ? err.message : "batch failed"
      });
      continue;
    }

    await campaigns.updateOne(
      { _id: campaignId },
      { $unset: { lockedAt: "" }, $set: { updatedAt: new Date() } }
    );
    processed.push({
      campaignId: campaignId.toString(),
      done,
      status: last?.status,
      sent: last?.sent,
      total: last?.total
    });

    // Ran out of time part-way through this campaign; the next tick continues.
    if (!done) break;
  }

  return { ran: processed.length, campaigns: processed };
}

async function handle(request: Request) {
  try {
    if (!process.env.CRON_SECRET) {
      return json(
        { error: { message: "Cron is not configured — set CRON_SECRET" } },
        { status: 503 }
      );
    }
    if (!authorize(request)) {
      return json({ error: { message: "Unauthorized" } }, { status: 401 });
    }
    const result = await runDueCampaigns();
    return json({ ok: true, ...result });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
