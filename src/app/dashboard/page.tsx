import { redirect } from "next/navigation";
import { getSessionUser, hasAdminUsers } from "@/lib/auth";
import { DashboardClient } from "@/components/DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const hasAdmins = await hasAdminUsers();
  if (!hasAdmins) redirect("/setup");

  const user = await getSessionUser();
  if (!user) redirect("/login");

  return <DashboardClient user={user} />;
}
