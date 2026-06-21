import { z } from "zod";
import { error, handleRouteError, json, requireUser } from "@/lib/api";
import { getDb } from "@/lib/mongodb";
import { toObjectId } from "@/lib/serializers";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  language: z.string().optional(),
  category: z.string().optional(),
  status: z.string().optional(),
  body: z.string().optional(),
  parameterFormat: z.enum(["NAMED", "POSITIONAL"]).optional(),
  parameters: z
    .array(z.object({ name: z.string().min(1), example: z.string().optional() }))
    .optional()
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();
    const { id } = await params;
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) return error("Invalid template update", 422);

    const db = await getDb();
    await db.collection("message_templates").updateOne(
      { _id: toObjectId(id) },
      { $set: { ...parsed.data, updatedAt: new Date() } }
    );
    return json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();
    const { id } = await params;
    const db = await getDb();
    await db.collection("message_templates").deleteOne({ _id: toObjectId(id) });
    return json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
