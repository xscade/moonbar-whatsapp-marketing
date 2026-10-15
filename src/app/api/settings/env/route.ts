import { handleRouteError, json, requireUser } from "@/lib/api";
import { getRuntimeEnv } from "@/lib/runtimeEnv";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();

    return json(getRuntimeEnv(), {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
