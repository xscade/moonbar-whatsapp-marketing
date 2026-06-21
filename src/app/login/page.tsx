import { redirect } from "next/navigation";
import Image from "next/image";
import { getSessionUser, hasAdminUsers } from "@/lib/auth";
import { AuthForm } from "@/components/AuthForm";
import { ConfigError } from "@/components/ConfigError";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  let hasAdmins = false;
  try {
    hasAdmins = await hasAdminUsers();
  } catch (err) {
    return <ConfigError message={err instanceof Error ? err.message : "Unknown error"} />;
  }
  if (!hasAdmins) redirect("/setup");

  const user = await getSessionUser();
  if (user) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="grid w-full max-w-5xl overflow-hidden rounded-lg border border-moon-green/15 bg-white/84 shadow-soft backdrop-blur lg:grid-cols-[0.95fr_1.05fr]">
        <div className="bg-moon-green p-8 text-moon-paper lg:p-10">
          <Image
            src="https://moon-bar-kitchen-new.vercel.app/images/moon%20logo%20(2).png"
            alt="Moon Bar and Kitchen"
            width={124}
            height={124}
            className="h-20 w-20 rounded-lg object-contain"
            priority
          />
          <h1 className="mt-8 text-4xl font-semibold leading-tight">
            Moonbar WhatsApp command center.
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-6 text-moon-cream">
            Manage audience lists, approved templates, and guest campaign sends
            from one focused admin surface.
          </p>
        </div>
        <AuthForm mode="login" />
      </section>
    </main>
  );
}
