/** Shared client-side fetch wrapper (mirrors the inline helper in DashboardClient). */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error?.message || body.error || "Request failed");
  }
  return body as T;
}
