import { env, graphUrl } from "@/lib/whatsapp/config";

export async function graphGet(path: string, params?: Record<string, string>) {
  const url = new URL(graphUrl(path));

  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env("WHATSAPP_ACCESS_TOKEN")}`
    },
    cache: "no-store"
  });

  const body = await response.json();
  return { ok: response.ok, status: response.status, body };
}
