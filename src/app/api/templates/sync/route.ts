import { handleRouteError, json, requireUser } from "@/lib/api";
import { getDb } from "@/lib/mongodb";
import { graphGet } from "@/lib/whatsapp";

type MetaTemplate = {
  id: string;
  name: string;
  language: string;
  category?: string;
  status?: string;
  parameter_format?: "NAMED" | "POSITIONAL";
  components?: Array<{
    type: string;
    text?: string;
    example?: {
      body_text_named_params?: Array<{ param_name: string; example?: string }>;
      body_text?: string[][];
    };
  }>;
};

function extractTemplate(template: MetaTemplate) {
  const body = template.components?.find((component) => component.type === "BODY");
  const named = body?.example?.body_text_named_params ?? [];
  const positional = body?.example?.body_text?.[0] ?? [];

  return {
    metaId: template.id,
    name: template.name,
    language: template.language,
    category: template.category,
    status: template.status,
    body: body?.text,
    parameterFormat: template.parameter_format || (named.length ? "NAMED" : "POSITIONAL"),
    parameters: named.length
      ? named.map((param) => ({ name: param.param_name, example: param.example }))
      : positional.map((example, index) => ({ name: String(index + 1), example }))
  };
}

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
