import { env, graphUrl } from "@/lib/whatsapp/config";
import { normalizePhone } from "@/lib/whatsapp/phone";

type SendTemplateInput = {
  to: string;
  templateName: string;
  language: string;
  parameters: Record<string, string>;
  parameterOrder: string[];
  headerImageId?: string;
  headerImageUrl?: string;
};

export async function sendTemplate(input: SendTemplateInput) {
  const phoneNumberId = env("WHATSAPP_PHONE_NUMBER_ID");

  const template: Record<string, unknown> = {
    name: input.templateName,
    language: { code: input.language }
  };

  const components: Array<Record<string, unknown>> = [];

  if (input.headerImageId || input.headerImageUrl) {
    components.push({
      type: "header",
      parameters: [
        {
          type: "image",
          image: input.headerImageId
            ? { id: input.headerImageId }
            : { link: input.headerImageUrl }
        }
      ]
    });
  }

  if (input.parameterOrder.length) {
    components.push({
      type: "body",
      parameters: input.parameterOrder.map((name) => ({
        type: "text",
        parameter_name: name,
        text: input.parameters[name] || ""
      }))
    });
  }

  if (components.length) {
    template.components = components;
  }

  const body = {
    messaging_product: "whatsapp",
    to: normalizePhone(input.to),
    type: "template",
    template
  };

  const response = await fetch(graphUrl(`${phoneNumberId}/messages`), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env("WHATSAPP_ACCESS_TOKEN")}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const result = await response.json();
  return { ok: response.ok, status: response.status, result };
}
