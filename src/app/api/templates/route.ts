import { error, handleRouteError, json, requireUser } from "@/lib/api";
import { getDb } from "@/lib/mongodb";
import { serializeDocs } from "@/lib/serializers";
import { graphPost } from "@/lib/whatsapp";
import {
  buildTemplateComponents,
  detectParameterFormat,
  templateDocFromPayload
} from "@/lib/whatsapp/templates";
import { builderSchema, metaErrorMessage } from "@/lib/whatsapp/templateSchema";

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
    const parsed = builderSchema.safeParse(await request.json());
    if (!parsed.success) {
      return error("Invalid template details", 422, parsed.error.flatten());
    }

    const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    if (!wabaId) return error("WHATSAPP_BUSINESS_ACCOUNT_ID is required", 500);

    const payload = parsed.data;
    const format = detectParameterFormat(payload);
    const response = await graphPost(`${wabaId}/message_templates`, {
      name: payload.name,
      language: payload.language,
      category: payload.category,
      parameter_format: format,
      components: buildTemplateComponents(payload, format)
    });

    if (!response.ok) {
      return error(
        metaErrorMessage(response.body, "Meta rejected the template"),
        response.status >= 400 ? response.status : 400
      );
    }

    const db = await getDb();
    const now = new Date();
    const status = response.body.status || "PENDING";
    const doc = templateDocFromPayload(payload, {
      metaId: response.body.id,
      status
    });

    await db.collection("message_templates").updateOne(
      { name: doc.name, language: doc.language },
      { $set: { ...doc, updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true }
    );

    return json({ ok: true, metaId: response.body.id, status }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
