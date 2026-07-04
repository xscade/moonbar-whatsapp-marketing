import { ObjectId } from "mongodb";
import { error, handleRouteError, json, requireUser } from "@/lib/api";
import {
  createCampaign,
  processCampaignBatch,
  sendSchema
} from "@/lib/campaigns";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const parsed = sendSchema.safeParse(await request.json());
    if (!parsed.success) return error("Invalid campaign payload", 422, parsed.error.flatten());

    // Scheduling: on the initial create only, a future scheduledAt stores the
    // campaign in "scheduled" state and defers sending to the cron runner.
    if (!parsed.data.campaignId && parsed.data.scheduledAt) {
      const when = new Date(parsed.data.scheduledAt);
      if (Number.isNaN(when.getTime())) return error("Invalid schedule time", 422);
      if (when.getTime() <= Date.now()) {
        return error("Schedule time must be in the future", 422);
      }
      const scheduledId = await createCampaign({
        userId: user._id,
        data: parsed.data,
        status: "scheduled",
        scheduledAt: when
      });
      return json({
        campaignId: scheduledId.toString(),
        status: "scheduled",
        scheduledAt: when.toISOString(),
        scheduled: true,
        done: true
      });
    }

    let campaignId: ObjectId;
    if (parsed.data.campaignId) {
      if (!ObjectId.isValid(parsed.data.campaignId)) return error("Invalid campaign id", 422);
      campaignId = new ObjectId(parsed.data.campaignId);
    } else {
      campaignId = await createCampaign({ userId: user._id, data: parsed.data });
    }

    const result = await processCampaignBatch({ campaignId, data: parsed.data });
    return json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
