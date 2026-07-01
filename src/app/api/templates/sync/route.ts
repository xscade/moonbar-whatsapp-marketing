import { handleRouteError, json, requireUser } from "@/lib/api";
import { getDb } from "@/lib/mongodb";
import { graphGet } from "@/lib/whatsapp";
import { extractTemplate, type MetaTemplate } from "@/lib/whatsapp/templates";

export async function POST() {
  try {
    await requireUser();
    const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    if (!wabaId) throw new Error("WHATSAPP_BUSINESS_ACCOUNT_ID is required");

    const response = await graphGet(`${wabaId}/message_templates`, {
      fields: "id,name,language,category,status,parameter_format,components"
    });

    if (!response.ok) {
      return json({ error: response.body }, { status: response.status });
    }

    const db = await getDb();
    const now = new Date();
    const templates = ((response.body.data as MetaTemplate[]) ?? []).map(extractTemplate);

    for (const template of templates) {
      await db.collection("message_templates").updateOne(
        { name: template.name, language: template.language },
        {
          $set: { ...template, updatedAt: now },
          $setOnInsert: { createdAt: now }
        },
        { upsert: true }
      );
    }

    return json({ synced: templates.length, data: templates });
  } catch (err) {
    return handleRouteError(err);
  }
}
