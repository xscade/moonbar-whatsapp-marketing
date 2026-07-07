"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

import type { Campaign, RetryAttempt, RetryPolicy } from "@/types/entities";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/clientApi";
import { cn } from "@/lib/utils";
import { getCampaignDeliveryStats } from "../types";
import { formatRetryTime } from "./retryState";

type RetryAttemptsResponse = {
  policy: RetryPolicy | null;
  attempts: RetryAttempt[];
  recoveredCount: number;
  eligibility: {
    eligibleCount: number;
    ineligibleCount: number;
    firstEligibleAt: string | null;
    errorCode: number;
  };
};

const DAY_MS = 24 * 60 * 60 * 1000;

type DisplayRow = {
  key: string;
  label: string;
  when: string;
  eligible: number | "—";
  submitted: number | "—";
  delivered: number | "—";
  read: number | "—";
  failed: number | "—";
  pending: number | "—";
  recovery: string;
  status: string;
  awaiting?: boolean;
  scheduled?: boolean;
};

function attemptRecovery(attempt: RetryAttempt): {
  label: string;
  awaiting: boolean;
} {
  const resolved = attempt.deliveredCount + attempt.failedCount;
  if (attempt.submittedCount > 0 && resolved === 0) {
    return { label: "—", awaiting: true };
  }
  if (!attempt.submittedCount) return { label: "—", awaiting: false };
  return {
    label: `${Math.round((attempt.deliveredCount / attempt.submittedCount) * 100)}%`,
    awaiting: false
  };
}

function buildRows(campaign: Campaign, data: RetryAttemptsResponse): DisplayRow[] {
  const rows: DisplayRow[] = [];
  const original = getCampaignDeliveryStats(campaign);

  rows.push({
    key: "original",
    label: "Original campaign",
    when: campaign.sentAt ? formatRetryTime(campaign.sentAt) : "—",
    eligible: "—",
    submitted: original.submitted,
    delivered: original.delivered,
    read: original.read,
    failed: original.failed,
    pending: "—",
    recovery: "—",
    status: "Sent"
  });

  for (const attempt of data.attempts) {
    const { label, awaiting } = attemptRecovery(attempt);
    rows.push({
      key: attempt._id,
      label: `Retry #${attempt.attemptNumber}`,
      when: formatRetryTime(attempt.startedAt ?? attempt.scheduledFor),
      eligible: attempt.eligibleCount,
      submitted: attempt.submittedCount,
      delivered: attempt.deliveredCount,
      read: attempt.readCount,
      failed: attempt.failedCount,
      pending: attempt.pendingCount,
      recovery: label,
      awaiting,
      status:
        attempt.status === "queued" || attempt.status === "processing"
          ? "In progress"
          : attempt.status.charAt(0).toUpperCase() + attempt.status.slice(1)
    });
  }

  // Synthesize the not-yet-created future attempts from the policy so scheduled
  // retries are visible before the dispatcher materializes them.
  const policy = data.policy;
  if (policy && policy.status === "active" && policy.cachedNextRetryAt) {
    const done = data.attempts.length;
    const remaining = Math.max(policy.maxRetries - policy.attemptsMade, 0);
    const base = new Date(policy.cachedNextRetryAt).getTime();
    for (let i = 0; i < remaining; i += 1) {
      const attemptNumber = policy.attemptsMade + 1 + i;
      // Skip any that already exist as real attempt docs.
      if (data.attempts.some((a) => a.attemptNumber === attemptNumber)) continue;
      rows.push({
        key: `scheduled-${attemptNumber}`,
        label: `Retry #${attemptNumber}`,
        when: `~ ${formatRetryTime(new Date(base + i * DAY_MS).toISOString())}`,
        eligible: data.eligibility.eligibleCount || "—",
        submitted: "—",
        delivered: "—",
        read: "—",
        failed: "—",
        pending: "—",
        recovery: "—",
        status: "Scheduled",
        scheduled: true
      });
    }
    void done;
  }

  return rows;
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-moon-green/12 bg-card px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold text-moon-ink">{value}</p>
    </div>
  );
}

export function RetryMetricsAccordion({
  campaign,
  open
}: {
  campaign: Campaign;
  open: boolean;
}) {
  const [data, setData] = useState<RetryAttemptsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const result = await apiFetch<RetryAttemptsResponse>(
        `/api/campaigns/${campaign._id}/retry-attempts`
      );
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load retries");
    } finally {
      setLoading(false);
    }
  }, [campaign._id]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    load();
  }, [open, load]);

  // Poll while an attempt is actively processing and the panel is visible.
  const isProcessing =
    data?.attempts.some(
      (a) =>
        a.status === "processing" ||
        a.status === "queued" ||
        (a.submittedCount > 0 && a.deliveredCount + a.failedCount < a.submittedCount)
    ) ?? false;

  useEffect(() => {
    if (!open || !isProcessing) return;
    const timer = setInterval(load, 20_000);
    return () => clearInterval(timer);
  }, [open, isProcessing, load]);

  if (!open) return null;

  if (loading && !data) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-5 w-40" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-between gap-3 p-4 text-sm text-moon-red">
        <span className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4" /> {error}
        </span>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            load();
          }}
          className="inline-flex items-center gap-1 rounded-md border border-moon-red/30 px-2 py-1 text-xs font-medium hover:bg-moon-red/10"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const rows = buildRows(campaign, data);
  const policy = data.policy;

  return (
    <div className="space-y-4 p-4">
      <p className="text-sm font-semibold text-moon-ink">Retry performance</p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <SummaryCard label="Recovered" value={String(data.recoveredCount)} />
        <SummaryCard
          label="Still eligible"
          value={String(data.eligibility.eligibleCount)}
        />
        <SummaryCard
          label="Attempts"
          value={policy ? `${policy.attemptsMade} of ${policy.maxRetries}` : "—"}
        />
        <SummaryCard
          label="Next retry"
          value={
            policy?.status === "active" && policy.cachedNextRetryAt
              ? formatRetryTime(policy.cachedNextRetryAt)
              : "—"
          }
        />
        <SummaryCard
          label="Relevant until"
          value={policy ? formatRetryTime(policy.relevantUntil) : "—"}
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-moon-green/12">
        <table className="w-full text-left text-xs">
          <thead className="bg-moon-cream/50 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Attempt</th>
              <th className="px-3 py-2 font-medium">When</th>
              <th className="px-3 py-2 text-right font-medium">Eligible</th>
              <th className="px-3 py-2 text-right font-medium">Submitted</th>
              <th className="px-3 py-2 text-right font-medium">Delivered</th>
              <th className="px-3 py-2 text-right font-medium">Read</th>
              <th className="px-3 py-2 text-right font-medium">Failed</th>
              <th className="px-3 py-2 text-right font-medium">Recovery</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.key}
                className={cn(
                  "border-t border-moon-green/8",
                  row.scheduled && "text-muted-foreground"
                )}
              >
                <td className="px-3 py-2 font-medium text-moon-ink">{row.label}</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                  {row.when}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{row.eligible}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.submitted}</td>
                <td className="px-3 py-2 text-right tabular-nums text-moon-green">
                  {row.delivered}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{row.read}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.failed}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {row.awaiting ? (
                    <span className="text-[11px] text-muted-foreground">
                      Awaiting updates
                    </span>
                  ) : (
                    row.recovery
                  )}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={cn(
                      "inline-block rounded-full px-2 py-0.5 text-[11px] font-medium",
                      row.scheduled
                        ? "bg-muted text-muted-foreground"
                        : row.status === "In progress"
                          ? "bg-moon-green/10 text-moon-green"
                          : "bg-moon-cream text-moon-ink"
                    )}
                  >
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Delivery rate on the campaign row is based on unique recipients. Retry
        attempts are counted separately here.
      </p>
    </div>
  );
}
