import { handleRouteError, json, requireUser } from "@/lib/api";
import { getDb } from "@/lib/mongodb";
import { serializeDocs } from "@/lib/serializers";

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

    return json({ data: serializeDocs(campaigns) });
  } catch (err) {
    return handleRouteError(err);
  }
}
