import { hasAdminUsers } from "@/lib/auth";
import { json } from "@/lib/api";

export async function GET() {
  try {
    return json({ hasAdminUsers: await hasAdminUsers(), ready: true });
  } catch (err) {
    return json(
      {
        ready: false,
        hasAdminUsers: false,
        error: err instanceof Error ? err.message : "Unknown error"
      },
      { status: 503 }
    );
  }
}
