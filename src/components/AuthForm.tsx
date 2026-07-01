"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { AlertCircle, Loader2, LockKeyhole, Mail, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AuthFormProps = {
  mode: "setup" | "login";
};

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());

    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const body = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(body.error?.message || "Something went wrong");
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <motion.form
      onSubmit={handleSubmit}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="p-8 lg:p-10"
    >
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-moon-rust">
        {mode === "setup" ? "First run" : "Admin login"}
      </p>
      <h2 className="mt-3 text-3xl font-semibold text-moon-ink">
        {mode === "setup" ? "Set up access" : "Welcome back"}
      </h2>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {mode === "setup"
          ? "Create the owner account. You can add more operators later."
          : "Use the admin credentials created for this Moonbar portal."}
      </p>

      <div className="mt-8 grid gap-4">
        {mode === "setup" ? (
          <div className="grid gap-2">
            <Label htmlFor="auth-name">Name</Label>
            <div className="relative">
              <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-moon-green" />
              <Input id="auth-name" name="name" required placeholder="Ravi" className="pl-10" />
            </div>
          </div>
        ) : null}

        <div className="grid gap-2">
          <Label htmlFor="auth-email">Email</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-moon-green" />
            <Input
              id="auth-email"
              name="email"
              type="email"
              required
              placeholder="admin@moonbar.in"
              className="pl-10"
            />
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="auth-password">Password</Label>
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-moon-green" />
            <Input
              id="auth-password"
              name="password"
              type="password"
              required
              minLength={8}
              placeholder="Minimum 8 characters"
              className="pl-10"
            />
          </div>
        </div>
      </div>

      {error ? (
        <p className="mt-4 flex items-center gap-2 rounded-lg bg-moon-red/10 px-4 py-3 text-sm text-moon-red">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        disabled={loading}
        className="mt-8 w-full justify-center"
      >
        {loading ? <Loader2 className="animate-spin" /> : null}
        {mode === "setup" ? "Create admin" : "Sign in"}
      </Button>
    </motion.form>
  );
}
