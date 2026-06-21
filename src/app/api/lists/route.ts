import { z } from "zod";
import { error, handleRouteError, json, requireUser } from "@/lib/api";
import { getDb } from "@/lib/mongodb";
import { serializeDocs } from "@/lib/serializers";

const listSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  color: z.string().default("#414C2F")
});

export async function GET() {
  try {
    await requireUser();
    const db = await getDb();
    const lists = await db
      .collection("contact_lists")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    const serialized = serializeDocs(lists);
    const withCounts = await Promise.all(
      serialized.map(async (list) => ({
        ...list,
        memberCount: await db.collection("contacts").countDocuments({
          listIds: list._id
        })
      }))
    );

    return json({ data: withCounts });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(request: Request) {
  try {
    await requireUser();
    const parsed = listSchema.safeParse(await request.json());
    if (!parsed.success) return error("Invalid list details", 422);

    const db = await getDb();
    const now = new Date();
    const result = await db.collection("contact_lists").insertOne({
      ...parsed.data,
      createdAt: now,
      updatedAt: now
    });

    return json({ _id: result.insertedId.toString() }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
