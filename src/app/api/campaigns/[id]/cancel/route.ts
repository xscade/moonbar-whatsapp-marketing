import { ObjectId } from "mongodb";
import { error, handleRouteError, json, requireUser } from "@/lib/api";
import { getDb } from "@/lib/mongodb";

type Recipient = {
  status?: string;
  error?: string;
};

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();
    const { id } = await params;
    if (!ObjectId.isValid(id)) return error("Invalid campaign id", 422);

    const db = await getDb();
    const campaignId = new ObjectId(id);
    const campaign = await db.collection("campaigns").findOne({ _id: campaignId });
    if (!campaign) return error("Campaign not found", 404);

    const recipients = Array.isArray(campaign.recipients)
      ? ([...campaign.recipients] as Recipient[])
      : [];
    const canceledRecipients = recipients.map((recipient) =>
      recipient.status === "queued"
        ? {
            ...recipient,
            status: "canceled",
            error: "Campaign canceled before this recipient was sent"
          }
        : recipient
    );
    const acceptedCount = canceledRecipients.filter(
      (recipient) => recipient.status === "accepted"
    ).length;
    const failedCount = canceledRecipients.filter(
      (recipient) => recipient.status === "failed"
    ).length;
    const canceledCount = canceledRecipients.filter(
      (recipient) => recipient.status === "canceled"
    ).length;
    const now = new Date();

    await db.collection("campaigns").updateOne(
      { _id: campaignId },
      {
        $set: {
          cancelRequested: true,
          recipients: canceledRecipients,
          acceptedCount,
          failedCount,
          status: "canceled",
          canceledAt: campaign.canceledAt || now,
          updatedAt: now
        }
      }
    );

    return json({
      ok: true,
      campaignId: id,
      acceptedCount,
      failedCount,
      canceledCount
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
