import { env, graphUrl } from "@/lib/whatsapp/config";

// Uploads a media file through Meta's Resumable Upload API and returns the file
// handle (`h`). This handle is required as `example.header_handle` when creating
// a media-header (IMAGE/VIDEO/DOCUMENT) message template — it is different from
// the phone-number `/media` upload used when actually *sending* a template.
// Requires WHATSAPP_APP_ID.
export async function uploadTemplateHeaderHandle(file: File): Promise<string> {
  const appId = env("WHATSAPP_APP_ID");
  const token = env("WHATSAPP_ACCESS_TOKEN");

  // Step 1 — open an upload session.
  const sessionUrl = new URL(graphUrl(`${appId}/uploads`));
  sessionUrl.searchParams.set("file_length", String(file.size));
  sessionUrl.searchParams.set(
    "file_type",
    file.type || "application/octet-stream"
  );
  sessionUrl.searchParams.set("access_token", token);

  const sessionResponse = await fetch(sessionUrl, { method: "POST" });
  const sessionBody = await sessionResponse.json();
  if (!sessionResponse.ok || !sessionBody?.id) {
    throw new Error(
      sessionBody?.error?.message || "Could not start the media upload session"
    );
  }

  // Step 2 — upload the bytes; the response carries the reusable handle `h`.
  const uploadResponse = await fetch(graphUrl(String(sessionBody.id)), {
    method: "POST",
    headers: {
      Authorization: `OAuth ${token}`,
      file_offset: "0",
      "Content-Type": file.type || "application/octet-stream"
    },
    body: await file.arrayBuffer()
  });

  const uploadBody = await uploadResponse.json();
  if (!uploadResponse.ok || !uploadBody?.h) {
    throw new Error(
      uploadBody?.error?.message || "Media upload for the template header failed"
    );
  }

  return String(uploadBody.h);
}
