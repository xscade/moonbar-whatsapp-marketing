import { redirect } from "next/navigation";
import { getSessionUser, hasAdminUsers } from "@/lib/auth";
import { DashboardClient } from "@/components/DashboardClient";
import { ConfigError } from "@/components/ConfigError";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let hasAdmins = false;
  try {
    hasAdmins = await hasAdminUsers();
  } catch (err) {
    return <ConfigError message={err instanceof Error ? err.message : "Unknown error"} />;
  }
  if (!hasAdmins) redirect("/setup");

  const user = await getSessionUser();
  if (!user) redirect("/login");

  return <DashboardClient user={user} />;
}
