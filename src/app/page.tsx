import { redirect } from "next/navigation";
import { getSessionUser, hasAdminUsers } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const hasAdmins = await hasAdminUsers();
  if (!hasAdmins) redirect("/setup");

  const user = await getSessionUser();
  redirect(user ? "/dashboard" : "/login");
}
