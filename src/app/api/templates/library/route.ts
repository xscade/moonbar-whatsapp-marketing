import { handleRouteError, json, requireUser } from "@/lib/api";
import { graphGet } from "@/lib/whatsapp";
import { metaErrorMessage } from "@/lib/whatsapp/templateSchema";

export type LibraryTemplate = {
  name: string;
  category?: string;
  language?: string;
  header?: string;
  body: string;
  footer?: string;
  buttons: Array<{ type: string; text?: string; url?: string; phone_number?: string }>;
  topic?: string;
  usecase?: string;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapPreview(item: any): LibraryTemplate {
  const header =
    typeof item.header === "string" ? item.header : item.header?.text || undefined;
  const buttons = Array.isArray(item.buttons)
    ? item.buttons.map((button: any) => ({
        type: String(button.type || "QUICK_REPLY").toUpperCase(),
        text: button.text,
        url: button.url,
        phone_number: button.phone_number
      }))
    : [];
  return {
    name: item.name || item.id || "library_template",
    category: item.category,
    language: item.language,
    header,
    body: item.body || item.body_text || "",
    footer: item.footer,
    buttons,
    topic: item.topic,
    usecase: item.usecase
  };
}

// Browses Meta's curated Template Library (utility + authentication starter
// templates) so users can start from a proven template. Backed by the WABA
// `message_template_previews` edge. Degrades gracefully to an empty list + note
// if Meta returns an error, so the UI never hard-fails.
export async function GET(request: Request) {
  try {
    await requireUser();
    const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    if (!wabaId) {
      return json({ data: [], note: "WHATSAPP_BUSINESS_ACCOUNT_ID is not set." });
    }

    const { searchParams } = new URL(request.url);
    const category = (searchParams.get("category") || "UTILITY").toUpperCase();
    const language = searchParams.get("language") || "en_US";
    const search = searchParams.get("search") || "";

    const params: Record<string, string> = {
      category,
      language,
      limit: "80"
    };
    if (search) params.search = search;

    const response = await graphGet(`${wabaId}/message_template_previews`, params);
    if (!response.ok) {
      return json({
        data: [],
        note: metaErrorMessage(response.body, "Meta's template library is unavailable.")
      });
    }

    const items = Array.isArray(response.body?.data) ? response.body.data : [];
    return json({ data: items.map(mapPreview) });
  } catch (err) {
    return handleRouteError(err);
  }
}
