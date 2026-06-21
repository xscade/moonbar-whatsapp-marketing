import { handleRouteError, json, requireUser } from "@/lib/api";
import { graphGet } from "@/lib/whatsapp";

export async function GET() {
  try {
    await requireUser();
    const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const appId = process.env.WHATSAPP_APP_ID;
    if (!wabaId || !phoneId || !appId) {
      throw new Error("WhatsApp environment variables are incomplete");
    }

    const [waba, phoneNumbers, subscribedApps, app] = await Promise.all([
      graphGet(`${wabaId}`, {
        fields: "id,name,currency,timezone_id,message_template_namespace"
      }),
      graphGet(`${wabaId}/phone_numbers`),
      graphGet(`${wabaId}/subscribed_apps`),
      graphGet(`${appId}`, { fields: "id,name" })
    ]);

    return json({
      waba,
      phoneNumbers,
      subscribedApps,
      app,
      phoneNumberId: phoneId
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
