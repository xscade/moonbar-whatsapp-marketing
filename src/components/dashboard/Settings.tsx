"use client";

import { useCallback, useState } from "react";
import { motion } from "motion/react";
import {
  Bell,
  Check,
  Copy,
  Database,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Volume2,
  Webhook
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { apiFetch } from "@/lib/clientApi";
import { staggerContainer } from "@/lib/motion";
import { playNotificationSound } from "@/lib/notificationSound";
import type { RuntimeEnvEntry, RuntimeEnvResponse } from "@/lib/runtimeEnv";
import { Section } from "./Section";

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

function dotenvDump(variables: RuntimeEnvEntry[]) {
  return variables.map((item) => `${item.key}=${item.value}`).join("\n");
}

export function Settings({
  diagnostics,
  busy,
  onLoad,
  runtimeEnv: initialRuntimeEnv,
  notificationSoundEnabled,
  onNotificationSoundEnabledChange
}: {
  diagnostics: Record<string, unknown> | null;
  busy: string;
  onLoad: () => void;
  runtimeEnv: RuntimeEnvResponse;
  notificationSoundEnabled: boolean;
  onNotificationSoundEnabledChange: (enabled: boolean) => void;
}) {
  const [envBusy, setEnvBusy] = useState(false);
  const [envError, setEnvError] = useState("");
  const [copiedKey, setCopiedKey] = useState("");
  const [runtimeEnv, setRuntimeEnv] = useState<RuntimeEnvResponse>(initialRuntimeEnv);

  const loadRuntimeEnv = useCallback(async () => {
    setEnvBusy(true);
    setEnvError("");
    try {
      const result = await apiFetch<RuntimeEnvResponse>("/api/settings/env", {
        cache: "no-store"
      });
      setRuntimeEnv(result);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not load environment variables";
      setEnvError(message);
      toast.error(message);
    } finally {
      setEnvBusy(false);
    }
  }, []);

  async function copyValue(key: string, value: string) {
    try {
      await copyText(value);
      setCopiedKey(key);
      toast.success(`Copied ${key}`);
      window.setTimeout(() => {
        setCopiedKey((current) => (current === key ? "" : current));
      }, 1600);
    } catch {
      toast.error("Could not copy to the clipboard");
    }
  }

  async function copyAll() {
    if (!runtimeEnv.variables.length) return;
    try {
      await copyText(dotenvDump(runtimeEnv.variables));
      setCopiedKey("all");
      toast.success("Copied all environment variables");
      window.setTimeout(() => {
        setCopiedKey((current) => (current === "all" ? "" : current));
      }, 1600);
    } catch {
      toast.error("Could not copy to the clipboard");
    }
  }

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
        title="Notifications"
        description="Control alerts for inbound messages, template updates, and delivery events"
      >
        <div className="flex items-center justify-between gap-4 rounded-xl border border-moon-green/12 bg-card p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-moon-yellow/35 text-moon-ink">
              <Volume2 className="h-5 w-5" />
            </div>
            <div>
              <Label htmlFor="notification-sound" className="text-sm font-semibold text-moon-ink">
                Notification sounds
              </Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Play a chime when new notifications arrive, even while you are
                on this tab.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="notification-sound"
              checked={notificationSoundEnabled}
              onCheckedChange={(checked) => {
                onNotificationSoundEnabledChange(checked);
                if (checked) void playNotificationSound();
              }}
            />
            <Bell className="hidden h-4 w-4 text-muted-foreground sm:block" />
          </div>
        </div>
      </Section>

      <Section
        title="Runtime environment"
        description="Live values from this server. Use this when Vercel marks variables as Sensitive and hides them in the dashboard."
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => void copyAll()}
              disabled={!runtimeEnv.variables.length || envBusy}
            >
              {copiedKey === "all" ? <Check /> : <Copy />}
              Copy all
            </Button>
            <Button onClick={() => void loadRuntimeEnv()} disabled={envBusy}>
              {envBusy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Refresh
            </Button>
          </div>
        }
      >
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-moon-yellow/50 bg-moon-yellow/20 p-3">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-moon-ink" />
          <p className="text-xs leading-5 text-moon-ink/80">
            These secrets are visible to signed-in admins only. Copy what you
            need, then keep this tab private.
            {runtimeEnv.environment
              ? ` Current environment: ${runtimeEnv.environment}.`
              : ""}
          </p>
        </div>
        {envError ? (
          <p className="mb-3 text-sm text-moon-red">{envError}</p>
        ) : null}
        <div className="overflow-hidden rounded-xl border border-moon-green/12">
          <Table>
            <TableHeader className="bg-moon-green">
              <TableRow className="hover:bg-transparent">
                <TableHead>Variable</TableHead>
                <TableHead>Value</TableHead>
                <TableHead className="w-[88px] text-right">Copy</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runtimeEnv.variables.map((item) => (
                <TableRow key={item.key}>
                  <TableCell className="align-top">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="text-xs font-semibold text-moon-ink">
                        {item.key}
                      </code>
                      <Badge variant={item.set ? "success" : "muted"}>
                        {item.set ? "Set" : "Missing"}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[42rem] align-top">
                    {item.set ? (
                      <code className="block whitespace-pre-wrap break-all text-xs leading-5 text-moon-ink">
                        {item.value}
                      </code>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not set</span>
                    )}
                  </TableCell>
                  <TableCell className="align-top text-right">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      disabled={!item.set}
                      aria-label={`Copy ${item.key}`}
                      onClick={() => void copyValue(item.key, item.value)}
                    >
                      {copiedKey === item.key ? <Check /> : <Copy />}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>

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
