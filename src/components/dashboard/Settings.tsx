"use client";

import { motion } from "motion/react";
import { Database, Loader2, ShieldCheck, Webhook } from "lucide-react";

import { Button } from "@/components/ui/button";
import { staggerContainer } from "@/lib/motion";
import { Section } from "./Section";

export function Settings({
  diagnostics,
  busy,
  onLoad
}: {
  diagnostics: Record<string, unknown> | null;
  busy: string;
  onLoad: () => void;
}) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-start gap-3 rounded-xl border border-moon-green/12 bg-card p-4 shadow-card">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-moon-green/10 text-moon-green">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-moon-ink">Cloud API</p>
            <p className="text-xs text-muted-foreground">
              Connected to Meta WhatsApp Cloud API.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-xl border border-moon-green/12 bg-card p-4 shadow-card">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-moon-rust/10 text-moon-rust">
            <Webhook className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-moon-ink">Webhooks</p>
            <p className="text-xs text-muted-foreground">
              Delivery receipts keep reports in sync.
            </p>
          </div>
        </div>
      </div>

      <Section
        title="Meta diagnostics"
        description="Verify your connection, phone number and templates"
        action={
          <Button onClick={onLoad} disabled={busy === "diagnostics"}>
            {busy === "diagnostics" ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Database />
            )}
            Run check
          </Button>
        }
      >
        <pre className="max-h-[560px] overflow-auto rounded-xl bg-moon-ink p-4 text-xs leading-6 text-moon-cream moon-scrollbar">
          {diagnostics
            ? JSON.stringify(diagnostics, null, 2)
            : "No diagnostics loaded yet. Run a check to fetch your Meta connection details."}
        </pre>
      </Section>
    </motion.div>
  );
}
