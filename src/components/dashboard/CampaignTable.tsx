"use client";

import { Fragment, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Eye, History, Loader2, RefreshCw, X } from "lucide-react";

import type { Campaign } from "@/types/entities";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { getCampaignDeliveryStats } from "./types";
import { RetryChip } from "./retry/RetryChip";
import { RetryMetricsAccordion } from "./retry/RetryMetricsAccordion";
import { getRetryChipState, shouldAutoExpand } from "./retry/retryState";

const EXPANDED_KEY = "moonbar:retryExpanded";
const TOUCHED_KEY = "moonbar:retryTouched";

const statusVariant: Record<
  string,
  "default" | "success" | "warning" | "destructive" | "muted"
> = {
  sent: "success",
  partial: "warning",
  failed: "destructive",
  sending: "default",
  scheduled: "warning",
  canceled: "muted",
  draft: "muted"
};

export function CampaignTable({
  campaigns,
  busy,
  onResume,
  onCancel,
  onView,
  onOpenRetry,
  onRetryChanged,
  compact = false
}: {
  campaigns: Campaign[];
  busy: string;
  onResume: (campaign: Campaign) => void;
  onCancel: (campaign: Campaign) => void;
  onView?: (campaign: Campaign) => void;
  onOpenRetry?: (campaign: Campaign) => void;
  onRetryChanged?: () => void;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const colSpan = compact ? 6 : 9;

  // Restore the per-session open/closed state for retry accordions.
  useEffect(() => {
    try {
      const rawExpanded = sessionStorage.getItem(EXPANDED_KEY);
      const rawTouched = sessionStorage.getItem(TOUCHED_KEY);
      if (rawExpanded) setExpanded(new Set(JSON.parse(rawExpanded) as string[]));
      if (rawTouched) setTouched(new Set(JSON.parse(rawTouched) as string[]));
    } catch {
      /* sessionStorage unavailable */
    }
  }, []);

  // Auto-expand active/processing retries the user hasn't explicitly collapsed.
  useEffect(() => {
    setExpanded((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const campaign of campaigns) {
        if (
          shouldAutoExpand(campaign) &&
          !touched.has(campaign._id) &&
          !next.has(campaign._id)
        ) {
          next.add(campaign._id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [campaigns, touched]);

  const persist = (set: Set<string>, key: string) => {
    try {
      sessionStorage.setItem(key, JSON.stringify([...set]));
    } catch {
      /* ignore */
    }
  };

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persist(next, EXPANDED_KEY);
      return next;
    });
    setTouched((prev) => {
      const next = new Set(prev).add(id);
      persist(next, TOUCHED_KEY);
      return next;
    });
  };

  if (!campaigns.length) {
    return (
      <div className="grid place-items-center rounded-xl border border-dashed border-moon-green/20 bg-muted/40 p-10 text-center text-sm text-muted-foreground">
        <History className="mb-2 h-6 w-6 text-moon-green/50" />
        No campaigns sent yet
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-moon-green/12">
      <Table>
        <TableHeader className="bg-moon-green">
          <TableRow className="hover:bg-transparent">
            <TableHead>Campaign</TableHead>
            {!compact ? <TableHead>Template</TableHead> : null}
            <TableHead
              className="text-right"
              title="Messages WhatsApp accepted for sending — an acknowledgement, not delivery."
            >
              Sent
            </TableHead>
            <TableHead
              className="text-right"
              title="Delivered to the recipient's phone. Matches Meta's 'Messages delivered'."
            >
              Delivered
            </TableHead>
            {!compact ? (
              <TableHead className="text-right" title="Recipients who read the message.">
                Read
              </TableHead>
            ) : null}
            <TableHead className="text-right">Failed</TableHead>
            {!compact ? <TableHead className="w-40">Delivery</TableHead> : null}
            <TableHead>When</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {campaigns.map((campaign) => {
            const delivery = getCampaignDeliveryStats(campaign);
            const queuedCount = delivery.queued;
            const isScheduled = campaign.status === "scheduled";
            const canResume =
              !isScheduled &&
              queuedCount > 0 &&
              campaign.status !== "canceled" &&
              !campaign.cancelRequested;
            const canCancel = queuedCount > 0 && campaign.status !== "canceled";
            const isResuming = busy === `resume-${campaign._id}`;
            const isCanceling = busy === `cancel-${campaign._id}`;
            const rate = delivery.submitted
              ? Math.round((delivery.delivered / delivery.submitted) * 100)
              : 0;
            const recovered =
              campaign.recoveredCount ?? campaign.retrySummary?.recoveredCount ?? 0;
            const retryChipState = getRetryChipState(campaign);
            const isExpanded =
              expanded.has(campaign._id) && retryChipState.visible && retryChipState.showChevron;

            return (
              <Fragment key={campaign._id}>
              <TableRow className={cn(canResume && "bg-moon-yellow/20")}>
                <TableCell className="max-w-[15rem]">
                  <div className="font-medium text-moon-ink">{campaign.name}</div>
                  {isScheduled ? (
                    <Badge variant="warning" className="mt-1">
                      Scheduled · {queuedCount} recipient
                      {queuedCount === 1 ? "" : "s"}
                    </Badge>
                  ) : queuedCount > 0 ? (
                    <Badge variant="destructive" className="mt-1">
                      {campaign.status === "canceled" ? "Canceled" : "Interrupted"} ·{" "}
                      {queuedCount} queued
                    </Badge>
                  ) : (
                    <Badge
                      variant={statusVariant[campaign.status] ?? "muted"}
                      className="mt-1 capitalize"
                    >
                      {campaign.status}
                    </Badge>
                  )}
                </TableCell>
                {!compact ? (
                  <TableCell className="text-muted-foreground">
                    <span className="line-clamp-1">{campaign.templateName}</span>
                  </TableCell>
                ) : null}
                <TableCell className="text-right tabular-nums text-moon-ink/80">
                  {delivery.submitted}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums text-moon-green">
                  {delivery.delivered}
                </TableCell>
                {!compact ? (
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {delivery.read}
                  </TableCell>
                ) : null}
                <TableCell
                  className={cn(
                    "text-right tabular-nums",
                    delivery.failed ? "text-moon-red" : "text-muted-foreground"
                  )}
                >
                  {delivery.failed}
                </TableCell>
                {!compact ? (
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={rate} className="h-1.5" />
                      <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                        {rate}%
                      </span>
                    </div>
                    {recovered > 0 ? (
                      <p
                        className="mt-1 text-[11px] font-medium text-moon-green"
                        title="Delivery rate is based on unique recipients. Retry attempts are shown separately."
                      >
                        +{recovered} via retries
                      </p>
                    ) : null}
                  </TableCell>
                ) : null}
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {isScheduled && campaign.scheduledAt
                    ? formatDistanceToNow(new Date(campaign.scheduledAt), {
                        addSuffix: true
                      })
                    : campaign.sentAt
                      ? `${formatDistanceToNow(new Date(campaign.sentAt))} ago`
                      : campaign.status}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex flex-col items-end gap-2">
                    {onView ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onView(campaign)}
                      >
                        <Eye />
                        View
                      </Button>
                    ) : null}
                    {canResume || canCancel ? (
                      <div className="flex justify-end gap-2">
                        {canResume ? (
                          <Button
                            size="sm"
                            onClick={() => onResume(campaign)}
                            disabled={isResuming || isCanceling || busy === "send"}
                          >
                            {isResuming ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <RefreshCw />
                            )}
                            Resume
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-moon-red/30 text-moon-red hover:bg-moon-red/10 hover:text-moon-red"
                          onClick={() => onCancel(campaign)}
                          disabled={isResuming || isCanceling}
                        >
                          {isCanceling ? <Loader2 className="animate-spin" /> : <X />}
                          Cancel
                        </Button>
                      </div>
                    ) : !onOpenRetry || !retryChipState.visible ? (
                      <span className="text-xs text-muted-foreground">Done</span>
                    ) : null}
                    {onOpenRetry ? (
                      <RetryChip
                        campaign={campaign}
                        expanded={isExpanded}
                        onToggle={() => toggleExpanded(campaign._id)}
                        onOpenDrawer={() => onOpenRetry(campaign)}
                      />
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
              {isExpanded ? (
                <TableRow className="bg-moon-cream/20 hover:bg-moon-cream/20">
                  <TableCell colSpan={colSpan} className="p-0">
                    <RetryMetricsAccordion
                      campaign={campaign}
                      open={isExpanded}
                      onChanged={onRetryChanged}
                    />
                  </TableCell>
                </TableRow>
              ) : null}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
