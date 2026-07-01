import { z } from "zod";
import { ObjectId } from "mongodb";
import { error, handleRouteError, json, requireUser } from "@/lib/api";
import { getDb } from "@/lib/mongodb";
import { normalizePhone } from "@/lib/whatsapp";
import { serializeDocs } from "@/lib/serializers";

const contactSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(8),
  tags: z.array(z.string()).default([]),
  listIds: z.array(z.string()).default([]),
  source: z.string().optional(),
  notes: z.string().optional(),
  consentStatus: z.enum(["subscribed", "unsubscribed"]).default("subscribed")
});

function normalizeTags(tags: string[]) {
  const seen = new Set<string>();
  return tags
    .map((tag) => tag.trim())
    .filter((tag) => {
      if (!tag) return false;
      const key = tag.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export async function GET(request: Request) {
  try {
    await requireUser();
    const db = await getDb();
    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.trim();
    const listId = url.searchParams.get("listId")?.trim();
    const requestedLimit = Number(url.searchParams.get("limit") || 20000);
    const limit = Math.min(
      Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 20000, 1),
      50000
    );
    const filter: Record<string, unknown> = {};

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { phone: { $regex: search.replace(/[^\d]/g, ""), $options: "i" } },
        { tags: { $regex: search, $options: "i" } }
      ];
    }

    if (listId) filter.listIds = listId;

    const contacts = await db
      .collection("contacts")
      .find(filter)
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(limit)
      .toArray();

    const total = await db.collection("contacts").countDocuments(filter);

    return json({ data: serializeDocs(contacts), total, limit });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(request: Request) {
  try {
    await requireUser();
    const parsed = contactSchema.safeParse(await request.json());
    if (!parsed.success) return error("Invalid contact details", 422, parsed.error.flatten());

    const db = await getDb();
    const now = new Date();
    const phone = normalizePhone(parsed.data.phone);
    const listIds = parsed.data.listIds.filter(ObjectId.isValid);

    const result = await db.collection("contacts").updateOne(
      { phone },
      {
        $set: {
          ...parsed.data,
          phone,
          tags: normalizeTags(parsed.data.tags),
          listIds,
          updatedAt: now
        },
        $setOnInsert: {
          createdAt: now
        }
      },
      { upsert: true }
    );

    return json(
      {
        _id: result.upsertedId?.toString(),
        updated: result.matchedCount > 0
      },
      { status: result.upsertedId ? 201 : 200 }
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
