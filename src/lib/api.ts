import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function error(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: { message, details } }, { status });
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) {
    throw new Response("Unauthorized", { status: 401 });
  }
  return user;
}

export function handleRouteError(err: unknown) {
  if (err instanceof Response) {
    return new NextResponse(err.body, { status: err.status });
  }

  const message = err instanceof Error ? err.message : "Unexpected error";
  return error(message, 500);
}
