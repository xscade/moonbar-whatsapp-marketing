import { error, handleRouteError, json, requireUser } from "@/lib/api";
import { env, graphUrl } from "@/lib/whatsapp/config";

export async function POST(request: Request) {
  try {
    await requireUser();

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return error("Choose an image to upload", 422);
    }

    if (!file.type.startsWith("image/")) {
      return error("Only image uploads are supported for this template header", 422);
    }

    const phoneNumberId = env("WHATSAPP_PHONE_NUMBER_ID");
    const uploadBody = new FormData();
    uploadBody.set("messaging_product", "whatsapp");
    uploadBody.set("type", file.type || "image/jpeg");
    uploadBody.set("file", file, file.name || "header-image");

    const response = await fetch(graphUrl(`${phoneNumberId}/media`), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env("WHATSAPP_ACCESS_TOKEN")}`
      },
      body: uploadBody
    });

    const body = await response.json();
    if (!response.ok) {
      return json({ error: body }, { status: response.status });
    }

    return json({
      id: body.id,
      filename: file.name,
      mimeType: file.type,
      size: file.size
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
