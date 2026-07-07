"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  Loader2,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2
} from "lucide-react";

import type { Campaign, RetryAttempt, RetryPolicy, RetrySummary } from "@/types/entities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { apiFetch } from "@/lib/clientApi";
import { cn } from "@/lib/utils";
import { formatRetryTime } from "./retryState";

type Eligibility = {
  eligibleCount: number;
  ineligibleCount: number;
  deliveredCount: number;
  firstEligibleAt: string | null;
  recommendedMaxRetries: number;
  errorCode: number;
  canSchedule: boolean;
  schedule: Array<{ attemptNumber: number; approxAt: string }>;
};

type StateResponse = {
  policy: RetryPolicy | null;
  attempts: RetryAttempt[];
  summary: RetrySummary;
  recoveredCount: number;
};

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

function toLocalInput(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

export function RetryConfigDrawer({
  campaign,
  open,
  onOpenChange,
  onChanged
}: {
  campaign: Campaign | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const [policy, setPolicy] = useState<RetryPolicy | null>(null);
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [mode, setMode] = useState<"once" | "automatic">("once");
  const [relevantUntil, setRelevantUntil] = useState("");
  const [maxRetries, setMaxRetries] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const campaignId = campaign?._id;
  const managing = policy && (policy.status === "active" || policy.status === "paused");
  const minInput = toLocalInput(new Date(Date.now() + 60_000));

  // Fetch eligibility + schedule preview from the backend (authoritative).
  const loadEligibility = useCallback(
    async (until: string, count: number, retryMode: "once" | "automatic") => {
      if (!campaignId) return;
      const query = new URLSearchParams();
      if (until) query.set("relevantUntil", new Date(until).toISOString());
      query.set("maxRetries", String(count));
      query.set("mode", retryMode);
      const result = await apiFetch<Eligibility>(
        `/api/campaigns/${campaignId}/retry-eligibility?${query.toString()}`
      );
      setEligibility(result);
      return result;
    },
    [campaignId]
  );

  // Initialize when opened.
  useEffect(() => {
    if (!open || !campaign) return;
    setPolicy(campaign.retryPolicy ?? null);
    setMode(campaign.retryPolicy?.mode ?? "once");
    setLoading(true);
    (async () => {
      try {
        const initial = await loadEligibility("", 1, "once");
        const seed = initial?.firstEligibleAt
          ? new Date(new Date(initial.firstEligibleAt).getTime() + 24 * 3600_000)
          : new Date(Date.now() + 48 * 3600_000);
        const until =
          campaign.retryPolicy?.relevantUntil
            ? toLocalInput(new Date(campaign.retryPolicy.relevantUntil))
            : toLocalInput(seed);
        setRelevantUntil(until);
        setMaxRetries(campaign.retryPolicy?.mode === "automatic" ? 2 : 1);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, campaignId]);

  // Refresh the schedule preview whenever inputs change.
  useEffect(() => {
    if (!open || !relevantUntil || managing) return;
    const requested = mode === "once" ? 1 : maxRetries;
    loadEligibility(relevantUntil, requested, mode).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relevantUntil, maxRetries, mode, open]);

  const recommended = eligibility?.recommendedMaxRetries ?? 1;
  const scheduleCount = eligibility?.schedule.length ?? 0;
  const canSchedule = (eligibility?.canSchedule ?? false) && scheduleCount > 0;

  async function refreshState(): Promise<void> {
    if (!campaignId) return;
    const state = await apiFetch<StateResponse>(
      `/api/campaigns/${campaignId}/retry-attempts`
    );
    setPolicy(state.policy);
  }

  async function submitSchedule() {
    if (!campaignId) return;
    setBusy("schedule");
    try {
      const state = await apiFetch<StateResponse>(
        `/api/campaigns/${campaignId}/retry-policy`,
        {
          method: "POST",
          body: JSON.stringify({
            mode,
            relevantUntil: new Date(relevantUntil).toISOString(),
            maxRetries: mode === "once" ? 1 : maxRetries,
            timezone: TZ
          })
        }
      );
      setPolicy(state.policy);
      toast.success(
        `${scheduleCount} ${scheduleCount === 1 ? "retry" : "retries"} scheduled for up to ${eligibility?.eligibleCount ?? 0} eligible contacts.`
      );
      onChanged();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not schedule retries");
    } finally {
      setBusy(null);
    }
  }

  async function action(
    path: string,
    method: string,
    confirmMsg?: string,
    body?: unknown
  ) {
    if (!campaignId) return;
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(path || "cancel");
    try {
      const state = await apiFetch<StateResponse>(
        `/api/campaigns/${campaignId}/retry-policy${path}`,
        { method, ...(body ? { body: JSON.stringify(body) } : {}) }
      );
      setPolicy(state.policy);
      onChanged();
      toast.success("Retry settings updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update retries");
    } finally {
      setBusy(null);
    }
  }

  const eligibleSummary = useMemo(() => eligibility, [eligibility]);

  if (!campaign) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-moon-green" />
            Retry failed deliveries
          </SheetTitle>
          <SheetDescription>{campaign.name}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 px-5 py-2">
          <p className="rounded-lg border border-moon-green/12 bg-moon-cream/40 p-3 text-xs leading-relaxed text-moon-ink/80">
            Meta recommends waiting at least 24 hours before resending messages
            rejected with error 131049. Retrying may recover additional
            deliveries, but delivery is not guaranteed. Use retries only when the
            campaign will remain relevant for at least another 24 hours.
          </p>

          {/* Eligibility summary */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg border border-moon-green/12 bg-card px-3 py-2">
              <p className="text-lg font-semibold text-moon-ink">
                {eligibleSummary?.eligibleCount ?? "—"}
              </p>
              <p className="text-xs text-muted-foreground">Eligible (131049)</p>
            </div>
            <div className="rounded-lg border border-moon-green/12 bg-card px-3 py-2">
              <p className="text-lg font-semibold text-moon-green">
                {eligibleSummary?.deliveredCount ?? "—"}
              </p>
              <p className="text-xs text-muted-foreground">Already delivered</p>
            </div>
            <div className="rounded-lg border border-moon-green/12 bg-card px-3 py-2">
              <p className="text-sm font-semibold text-moon-ink">
                {eligibleSummary?.firstEligibleAt
                  ? formatRetryTime(eligibleSummary.firstEligibleAt)
                  : "—"}
              </p>
              <p className="text-xs text-muted-foreground">First eligible retry</p>
            </div>
            <div className="rounded-lg border border-moon-green/12 bg-card px-3 py-2">
              <p className="text-sm font-semibold text-moon-ink">
                {eligibleSummary?.ineligibleCount ?? "—"}
              </p>
              <p className="text-xs text-muted-foreground">Other (not eligible)</p>
            </div>
          </div>

          {loading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking eligibility…
            </p>
          ) : managing ? (
            <ManagePanel
              policy={policy!}
              busy={busy}
              onPause={() => action("/pause", "POST")}
              onResume={() => action("/resume", "POST")}
              onCancel={() =>
                action(
                  "",
                  "DELETE",
                  "Cancel all future retries? Completed retries stay in your history."
                )
              }
              onExtend={(untilIso, max) =>
                action("", "PATCH", undefined, {
                  relevantUntil: untilIso,
                  maxRetries: max
                })
              }
            />
          ) : (
            <>
              {/* Mode */}
              <div className="grid grid-cols-2 gap-2">
                {(["once", "automatic"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMode(value)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      mode === value
                        ? "border-moon-green bg-moon-green/10 text-moon-green"
                        : "border-moon-green/18 bg-card text-moon-ink hover:bg-moon-cream/50"
                    )}
                  >
                    <span className="block font-semibold">
                      {value === "once" ? "Retry once" : "Automatic retries"}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {value === "once"
                        ? "One attempt after 24h"
                        : "Repeat every 24h until relevant"}
                    </span>
                  </button>
                ))}
              </div>

              {/* Relevance date */}
              <div className="grid gap-2">
                <Label htmlFor="relevant-until">
                  Campaign remains relevant until
                </Label>
                <Input
                  id="relevant-until"
                  type="datetime-local"
                  value={relevantUntil}
                  min={minInput}
                  onChange={(e) => setRelevantUntil(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Timezone: {TZ}. Future retries stop automatically after this time.
                </p>
              </div>

              {/* Interval (read-only) + max retries */}
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Retry interval</Label>
                  <div className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground">
                    Every 24 hours
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Maximum attempts</Label>
                  {mode === "once" ? (
                    <div className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground">
                      1 attempt
                    </div>
                  ) : (
                    <div className="flex h-10 items-center justify-between rounded-md border border-input bg-card px-2">
                      <button
                        type="button"
                        aria-label="Fewer attempts"
                        onClick={() => setMaxRetries((v) => Math.max(1, v - 1))}
                        className="rounded p-1 hover:bg-moon-cream disabled:opacity-40"
                        disabled={maxRetries <= 1}
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="text-sm font-semibold tabular-nums">
                        {maxRetries}
                      </span>
                      <button
                        type="button"
                        aria-label="More attempts"
                        onClick={() =>
                          setMaxRetries((v) => Math.min(recommended, v + 1))
                        }
                        className="rounded p-1 hover:bg-moon-cream disabled:opacity-40"
                        disabled={maxRetries >= recommended}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {mode === "automatic" ? (
                <p className="text-xs text-muted-foreground">
                  Recommended: {recommended} — based on the selected campaign end
                  time.
                </p>
              ) : null}

              {/* Schedule preview */}
              <div className="rounded-lg border border-moon-green/12 bg-muted/30 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Schedule preview
                </p>
                {canSchedule ? (
                  <ul className="space-y-1.5">
                    {eligibility!.schedule.map((s) => (
                      <li key={s.attemptNumber} className="text-sm text-moon-ink">
                        <span className="font-medium">Retry {s.attemptNumber}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          — approximately {formatRetryTime(s.approxAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-moon-red">
                    This campaign ends before the 24-hour retry window. No retry
                    can be scheduled.
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 rounded-lg border border-moon-green/12 bg-card px-3 py-2 text-xs text-moon-ink">
                <ShieldCheck className="h-4 w-4 text-moon-green" />
                Retries only Meta error 131049 failures.
              </div>

              <ul className="space-y-1 text-xs text-muted-foreground">
                <li className="flex gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Contacts already delivered, read or pending will not be retried.
                </li>
                <li className="flex gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Delivery is not guaranteed; extra attempts may affect usage and
                  billing.
                </li>
              </ul>
            </>
          )}
        </div>

        {!managing ? (
          <SheetFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={submitSchedule}
              disabled={!canSchedule || busy === "schedule" || loading}
            >
              {busy === "schedule" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <CalendarClock />
              )}
              {scheduleCount > 1
                ? `Schedule ${scheduleCount} retries`
                : "Schedule retry"}
            </Button>
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function ManagePanel({
  policy,
  busy,
  onPause,
  onResume,
  onCancel,
  onExtend
}: {
  policy: RetryPolicy;
  busy: string | null;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onExtend: (untilIso: string, max: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [until, setUntil] = useState(
    toLocalInput(new Date(policy.relevantUntil))
  );
  const [max, setMax] = useState(policy.maxRetries);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 text-sm">
        <Field label="Mode" value={policy.mode === "once" ? "Retry once" : "Automatic"} />
        <Field
          label="Attempts"
          value={`${policy.attemptsMade} of ${policy.maxRetries}`}
        />
        <Field
          label="Next retry"
          value={
            policy.status === "active" && policy.cachedNextRetryAt
              ? formatRetryTime(policy.cachedNextRetryAt)
              : "—"
          }
        />
        <Field label="Relevant until" value={formatRetryTime(policy.relevantUntil)} />
        <Field label="Status" value={policy.status} />
      </div>

      {editing ? (
        <div className="space-y-3 rounded-lg border border-moon-green/12 bg-muted/30 p-3">
          <div className="grid gap-2">
            <Label htmlFor="edit-until">Campaign relevant until</Label>
            <Input
              id="edit-until"
              type="datetime-local"
              value={until}
              min={toLocalInput(new Date(Date.now() + 60_000))}
              onChange={(e) => setUntil(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-max">Maximum attempts</Label>
            <Input
              id="edit-max"
              type="number"
              min={policy.attemptsMade}
              value={max}
              onChange={(e) => setMax(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              Cannot be lower than the {policy.attemptsMade} attempt(s) already
              completed.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                onExtend(new Date(until).toISOString(), max);
                setEditing(false);
              }}
            >
              <Check /> Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {policy.status === "active" ? (
            <Button size="sm" variant="outline" onClick={onPause} disabled={!!busy}>
              {busy === "/pause" ? <Loader2 className="animate-spin" /> : <Pause />}
              Pause
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={onResume} disabled={!!busy}>
              {busy === "/resume" ? <Loader2 className="animate-spin" /> : <Play />}
              Resume
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <CalendarClock /> Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-moon-red/30 text-moon-red hover:bg-moon-red/10 hover:text-moon-red"
            onClick={onCancel}
            disabled={!!busy}
          >
            {busy === "cancel" ? <Loader2 className="animate-spin" /> : <Trash2 />}
            Cancel future retries
          </Button>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-moon-green/12 bg-card px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold capitalize text-moon-ink">
        {value}
      </p>
    </div>
  );
}
