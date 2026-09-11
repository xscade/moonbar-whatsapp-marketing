import { error, handleRouteError, json, requireUser } from "@/lib/api";
import { getDb } from "@/lib/mongodb";
import { toObjectId } from "@/lib/serializers";
import { graphDelete, graphPost } from "@/lib/whatsapp";
import { buildTemplateComponents, templateDocFromPayload } from "@/lib/whatsapp/templates";
import { builderSchema, metaErrorMessage } from "@/lib/whatsapp/templateSchema";

const EDITABLE_STATUSES = ["APPROVED", "REJECTED", "PAUSED"];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();
    const { id } = await params;
    const parsed = builderSchema.safeParse(await request.json());
    if (!parsed.success) {
      return error("Invalid template update", 422, parsed.error.flatten());
    }

    const db = await getDb();
    const existing = await db
      .collection("message_templates")
      .findOne({ _id: toObjectId(id) });
    if (!existing) return error("Template not found", 404);

    const payload = parsed.data;
    const now = new Date();
    let status = existing.status as string | undefined;

    // Push the edit to Meta when this is a real (synced/created) template.
    if (existing.metaId) {
      const current = String(existing.status ?? "").toUpperCase();
      if (current && !EDITABLE_STATUSES.includes(current)) {
        return error(
          `Templates can only be edited while Approved, Rejected or Paused (current: ${existing.status}).`,
          409
        );
      }

      const response = await graphPost(String(existing.metaId), {
        category: payload.category,
        components: buildTemplateComponents(payload)
      });

      if (!response.ok) {
        return error(
          metaErrorMessage(response.body, "Meta rejected the edit"),
          response.status >= 400 ? response.status : 400
        );
      }
      status = "PENDING";
    }

    const doc = templateDocFromPayload(payload, {
      metaId: existing.metaId,
      status
    });
    // Name and language are immutable on Meta — keep the stored identity.
    doc.name = existing.name;
    doc.language = existing.language;

    await db
      .collection("message_templates")
      .updateOne({ _id: toObjectId(id) }, { $set: { ...doc, updatedAt: now } });

    return json({ ok: true, status });
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
    const existing = await db
      .collection("message_templates")
      .findOne({ _id: toObjectId(id) });

    if (!existing) return json({ ok: true });

    const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    const isRemote = existing.metaId || existing.status !== "LOCAL";

    if (wabaId && isRemote && existing.name) {
      const deleteParams: Record<string, string> = { name: String(existing.name) };
      // With hsm_id, only this language is removed; without it, all languages.
      if (existing.metaId) deleteParams.hsm_id = String(existing.metaId);

      const response = await graphDelete(`${wabaId}/message_templates`, deleteParams);
      const code = (response.body?.error as { code?: number })?.code;
      // Ignore "not found" (already gone on Meta); surface other failures.
      if (!response.ok && code !== 100) {
        return error(
          metaErrorMessage(response.body, "Could not delete the template from Meta"),
          response.status >= 400 ? response.status : 400
        );
      }
    }

    await db.collection("message_templates").deleteOne({ _id: toObjectId(id) });
    return json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
