import { getDb } from "@/lib/mongodb";

export async function processTemplateUpdate(
  field: string,
  value: Record<string, unknown>,
  context: Record<string, unknown> = {}
) {
  const db = await getDb();
  const now = new Date();

  await db.collection("whatsapp_template_events").insertOne({
    field,
    value,
    context,
    createdAt: now
  });

  const templateName = value.message_template_name || value.name;
  const language = value.message_template_language || value.language;

  if (templateName && language) {
    await db.collection("message_templates").updateOne(
      { name: templateName, language },
      {
        $set: {
          status: value.event || value.status,
          qualityScore: value.new_quality_score,
          lastWebhookEvent: field,
          updatedAt: now
        },
        $setOnInsert: {
          name: templateName,
          language,
          parameterFormat: "NAMED",
          parameters: [],
          createdAt: now
        }
      },
      { upsert: true }
    );
  }

  return { stored: true };
}
