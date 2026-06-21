import { z } from "zod";
import { ObjectId } from "mongodb";
import { error, handleRouteError, json, requireUser } from "@/lib/api";
import { getDb } from "@/lib/mongodb";
import { normalizePhone } from "@/lib/whatsapp";
import { toObjectId } from "@/lib/serializers";

const contactPatchSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().min(8).optional(),
  tags: z.array(z.string()).optional(),
  listIds: z.array(z.string()).optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
  consentStatus: z.enum(["subscribed", "unsubscribed"]).optional()
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();
    const { id } = await params;
    const parsed = contactPatchSchema.safeParse(await request.json());
    if (!parsed.success) return error("Invalid contact update", 422);

    const update: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
    if (parsed.data.phone) update.phone = normalizePhone(parsed.data.phone);
    if (parsed.data.listIds) update.listIds = parsed.data.listIds.filter(ObjectId.isValid);

    const db = await getDb();
    await db.collection("contacts").updateOne(
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
    const { id } = await params;
    const db = await getDb();
    await db.collection("contacts").deleteOne({ _id: toObjectId(id) });
    return json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
