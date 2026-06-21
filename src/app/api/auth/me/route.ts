import { getSessionUser } from "@/lib/auth";
import { json, error } from "@/lib/api";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return error("Unauthorized", 401);
  return json({ user });
}
