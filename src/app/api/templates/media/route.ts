import { error, handleRouteError, json, requireUser } from "@/lib/api";
import { uploadTemplateHeaderHandle } from "@/lib/whatsapp";

export const maxDuration = 60;

// Uploads a sample media file for a template header and returns the reusable
// Meta upload handle used as example.header_handle when creating the template.
export async function POST(request: Request) {
  try {
    await requireUser();

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return error("Choose a file to upload", 422);
    }

    const handle = await uploadTemplateHeaderHandle(file);
    return json({ handle, filename: file.name, mimeType: file.type });
  } catch (err) {
    return handleRouteError(err);
  }
}
