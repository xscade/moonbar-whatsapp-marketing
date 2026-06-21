"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LockKeyhole, Mail, UserRound } from "lucide-react";

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
    <form onSubmit={handleSubmit} className="p-8 lg:p-10">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-moon-rust">
        {mode === "setup" ? "First run" : "Admin login"}
      </p>
      <h2 className="mt-3 text-3xl font-semibold text-moon-ink">
        {mode === "setup" ? "Set up access" : "Welcome back"}
      </h2>
      <p className="mt-3 text-sm leading-6 text-moon-ink/62">
        {mode === "setup"
          ? "Create the owner account. You can add more operators later."
          : "Use the admin credentials created for this Moonbar portal."}
      </p>

      <div className="mt-8 grid gap-4">
        {mode === "setup" ? (
          <label className="grid gap-2 text-sm font-medium text-moon-ink">
            Name
            <span className="flex items-center gap-3 rounded-lg border border-moon-green/18 bg-moon-paper px-4 py-3">
              <UserRound className="h-4 w-4 text-moon-green" />
              <input
                name="name"
                required
                placeholder="Ravi"
                className="w-full bg-transparent outline-none"
              />
            </span>
          </label>
        ) : null}

        <label className="grid gap-2 text-sm font-medium text-moon-ink">
          Email
          <span className="flex items-center gap-3 rounded-lg border border-moon-green/18 bg-moon-paper px-4 py-3">
            <Mail className="h-4 w-4 text-moon-green" />
            <input
              name="email"
              type="email"
              required
              placeholder="admin@moonbar.in"
              className="w-full bg-transparent outline-none"
            />
          </span>
        </label>

        <label className="grid gap-2 text-sm font-medium text-moon-ink">
          Password
          <span className="flex items-center gap-3 rounded-lg border border-moon-green/18 bg-moon-paper px-4 py-3">
            <LockKeyhole className="h-4 w-4 text-moon-green" />
            <input
              name="password"
              type="password"
              required
              minLength={8}
              placeholder="Minimum 8 characters"
              className="w-full bg-transparent outline-none"
            />
          </span>
        </label>
      </div>

      {error ? (
        <p className="mt-4 rounded-lg bg-moon-red/10 px-4 py-3 text-sm text-moon-red">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={loading}
        className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-moon-red px-5 py-3 font-semibold text-white shadow-soft transition hover:bg-moon-rust disabled:opacity-70"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {mode === "setup" ? "Create admin" : "Sign in"}
      </button>
    </form>
  );
}
