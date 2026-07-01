import { z } from "zod";
import { error, handleRouteError, json, requireUser } from "@/lib/api";
import { getDb } from "@/lib/mongodb";
import { toObjectId } from "@/lib/serializers";

const listPatchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  color: z.string().optional()
});

function normalizeListName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

function listNameKey(name: string) {
  return normalizeListName(name).toLowerCase();
}

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
    const update: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };

    if (parsed.data.name) {
      const name = normalizeListName(parsed.data.name);
      const normalizedName = listNameKey(name);
      const existingLists = await db
        .collection("contact_lists")
        .find({ _id: { $ne: toObjectId(id) } }, { projection: { name: 1, normalizedName: 1 } })
        .toArray();
      const duplicate = existingLists.find((list) => {
        const existingKey =
          typeof list.normalizedName === "string"
            ? list.normalizedName
            : listNameKey(String(list.name || ""));
        return existingKey === normalizedName;
      });

      if (duplicate) {
        return error("A list with this name already exists", 409);
      }

      update.name = name;
      update.normalizedName = normalizedName;
    }

    await db.collection("contact_lists").updateOne(
      { _id: toObjectId(id) },
      { $set: update }
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
