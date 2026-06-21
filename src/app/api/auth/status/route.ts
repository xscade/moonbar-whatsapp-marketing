import { hasAdminUsers } from "@/lib/auth";
import { json } from "@/lib/api";

export async function GET() {
  return json({ hasAdminUsers: await hasAdminUsers() });
}
