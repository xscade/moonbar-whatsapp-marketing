import { z } from "zod";
import { error, handleRouteError, json, requireUser } from "@/lib/api";
import { getDb } from "@/lib/mongodb";
import { serializeDocs } from "@/lib/serializers";

const templateSchema = z.object({
  name: z.string().min(1),
  language: z.string().default("en_US"),
  category: z.string().optional(),
  status: z.string().optional(),
  body: z.string().optional(),
  parameterFormat: z.enum(["NAMED", "POSITIONAL"]).default("NAMED"),
  parameters: z.array(z.object({ name: z.string().min(1), example: z.string().optional() }))
});

export async function GET() {
  try {
    await requireUser();
    const db = await getDb();
    const templates = await db
      .collection("message_templates")
      .find({})
      .sort({ updatedAt: -1, createdAt: -1 })
      .toArray();
    return json({ data: serializeDocs(templates) });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(request: Request) {
  try {
    await requireUser();
    const parsed = templateSchema.safeParse(await request.json());
    if (!parsed.success) return error("Invalid template details", 422);

    const db = await getDb();
    const now = new Date();
    const result = await db.collection("message_templates").insertOne({
      ...parsed.data,
      createdAt: now,
      updatedAt: now
    });

    return json({ _id: result.insertedId.toString() }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
