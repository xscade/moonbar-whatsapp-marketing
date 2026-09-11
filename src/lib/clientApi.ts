/** Shared client-side fetch wrapper (mirrors the inline helper in DashboardClient). */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const text = await response.text();
  let body: { error?: { message?: string } | string } = {};
  if (text) {
    try {
      body = JSON.parse(text) as { error?: { message?: string } | string };
    } catch {
      if (!response.ok) {
        throw new Error(text || "Request failed");
      }
      throw new Error("Request failed");
    }
  }
  if (!response.ok) {
    const message =
      typeof body.error === "string"
        ? body.error
        : body.error?.message || text || "Request failed";
    throw new Error(message);
  }
  return body as T;
}
