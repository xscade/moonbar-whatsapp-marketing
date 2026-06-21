import { env, graphUrl } from "@/lib/whatsapp/config";
import { normalizePhone } from "@/lib/whatsapp/phone";

export async function sendText(to: string, text: string) {
  const phoneNumberId = env("WHATSAPP_PHONE_NUMBER_ID");
  const body = {
    messaging_product: "whatsapp",
    to: normalizePhone(to),
    type: "text",
    text: {
      preview_url: false,
      body: text
    }
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
