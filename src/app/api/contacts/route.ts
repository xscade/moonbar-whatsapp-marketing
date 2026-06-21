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

export async function GET(request: Request) {
  try {
    await requireUser();
    const db = await getDb();
    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.trim();
    const listId = url.searchParams.get("listId")?.trim();
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
      .sort({ createdAt: -1 })
      .limit(500)
      .toArray();

    return json({ data: serializeDocs(contacts) });
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

    const result = await db.collection("contacts").insertOne({
      ...parsed.data,
      phone,
      listIds,
      createdAt: now,
      updatedAt: now
    });

    return json({ _id: result.insertedId.toString() }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
