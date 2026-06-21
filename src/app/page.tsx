import { redirect } from "next/navigation";
import { getSessionUser, hasAdminUsers } from "@/lib/auth";
import { ConfigError } from "@/components/ConfigError";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let hasAdmins = false;
  try {
    hasAdmins = await hasAdminUsers();
  } catch (err) {
    return <ConfigError message={err instanceof Error ? err.message : "Unknown error"} />;
  }
  if (!hasAdmins) redirect("/setup");

  const user = await getSessionUser();
  redirect(user ? "/dashboard" : "/login");
}
