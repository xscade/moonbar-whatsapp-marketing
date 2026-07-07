import { handleRouteError, json, requireUser } from "@/lib/api";
import { getDb } from "@/lib/mongodb";
import { serializeDocs } from "@/lib/serializers";
import { buildRetryEnrichment } from "@/lib/retries/service";

export async function GET() {
  try {
    await requireUser();
    const db = await getDb();
    const campaigns = await db
      .collection("campaigns")
      .find({})
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    // Attach per-campaign retry policy/summary in two batched queries so the
    // campaign-row retry chip renders without N+1 lookups.
    const enrichment = await buildRetryEnrichment(campaigns);
    const data = serializeDocs(campaigns).map((campaign) => ({
      ...campaign,
      ...(enrichment[campaign._id] ?? {})
    }));

    return json({ data });
  } catch (err) {
    return handleRouteError(err);
  }
}
