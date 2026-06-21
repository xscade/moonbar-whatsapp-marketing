import { z } from "zod";
import { error, handleRouteError, json, requireUser } from "@/lib/api";
import { getDb } from "@/lib/mongodb";
import { toObjectId } from "@/lib/serializers";

const listPatchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  color: z.string().optional()
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();
    const { id } = await params;
    const parsed = listPatchSchema.safeParse(await request.json());
    if (!parsed.success) return error("Invalid list update", 422);

    const db = await getDb();
    await db.collection("contact_lists").updateOne(
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
    const db = await getDb();
    const { id } = await params;
    await db.collection("contact_lists").deleteOne({ _id: toObjectId(id) });
    await db
      .collection("contacts")
      .updateMany({}, { $pull: { listIds: id } } as never);
    return json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
