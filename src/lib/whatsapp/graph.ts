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

export async function graphPost(path: string, payload: Record<string, unknown>) {
  const response = await fetch(graphUrl(path), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env("WHATSAPP_ACCESS_TOKEN")}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
    cache: "no-store"
  });

  const body = await response.json();
  return { ok: response.ok, status: response.status, body };
}

export async function graphDelete(path: string, params?: Record<string, string>) {
  const url = new URL(graphUrl(path));

  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${env("WHATSAPP_ACCESS_TOKEN")}`
    },
    cache: "no-store"
  });

  const body = await response.json();
  return { ok: response.ok, status: response.status, body };
}
