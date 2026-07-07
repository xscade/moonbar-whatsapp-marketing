import { format } from "date-fns";

import type { Campaign, RetrySummary } from "@/types/entities";

export function formatRetryTime(iso?: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "d MMM, h:mm a");
}

export type RetryChipTone = "outline" | "active" | "warning" | "muted";

export type RetryChipState = {
  /** Whether to render anything at all in the row. */
  visible: boolean;
  kind:
    | "eligible"
    | "active"
    | "processing"
    | "paused"
    | "completed"
    | "expired"
    | "cancelled";
  label: string;
  sublabel?: string;
  tone: RetryChipTone;
  showChevron: boolean;
  /** Clicking the chip body opens the config/manage drawer. */
  canConfigure: boolean;
  spinner: boolean;
  disabled: boolean;
};

const HIDDEN: RetryChipState = {
  visible: false,
  kind: "eligible",
  label: "",
  tone: "outline",
  showChevron: false,
  canConfigure: false,
  spinner: false,
  disabled: false
};

/**
 * Maps a campaign's retry summary + eligibility into the compact chip shown in
 * the Action column. Encodes states A–G from the design.
 */
export function getRetryChipState(campaign: Campaign): RetryChipState {
  const summary: RetrySummary | null | undefined = campaign.retrySummary;
  const eligible = summary?.eligibleCount ?? campaign.eligibleRetryCount ?? 0;

  if (!summary || summary.status === "none") {
    if (eligible > 0) {
      return {
        ...HIDDEN,
        visible: true,
        kind: "eligible",
        label: `Retry ${eligible} failed`,
        tone: "outline",
        canConfigure: true
      };
    }
    return HIDDEN;
  }

  const plannedRemaining = Math.max(summary.maxRetries - summary.attemptsMade, 0);
  const hasHistory = summary.attemptsMade > 0 || summary.recoveredCount > 0;

  switch (summary.status) {
    case "active":
      if (eligible === 0 && !hasHistory && summary.processingCount === 0) {
        return HIDDEN;
      }
      if (summary.processingCount > 0) {
        return {
          ...HIDDEN,
          visible: true,
          kind: "processing",
          label: eligible > 0 ? `Retrying ${eligible}` : "Retrying",
          tone: "active",
          showChevron: true,
          canConfigure: true,
          spinner: true
        };
      }
      return {
        ...HIDDEN,
        visible: true,
        kind: "active",
        label: `Retry on · ${plannedRemaining} scheduled`,
        sublabel: summary.nextRetryAt
          ? `Next: ${formatRetryTime(summary.nextRetryAt)}`
          : undefined,
        tone: "active",
        showChevron: true,
        canConfigure: true
      };
    case "paused":
      return {
        ...HIDDEN,
        visible: true,
        kind: "paused",
        label: "Retry paused",
        tone: "warning",
        showChevron: true,
        canConfigure: true
      };
    case "completed":
      if (!hasHistory) return HIDDEN;
      return {
        ...HIDDEN,
        visible: true,
        kind: "completed",
        label: `${summary.attemptsMade} ${
          summary.attemptsMade === 1 ? "retry" : "retries"
        } · +${summary.recoveredCount} delivered`,
        tone: "muted",
        showChevron: true,
        canConfigure: true
      };
    case "expired":
      return {
        ...HIDDEN,
        visible: true,
        kind: "expired",
        label: "Retry expired",
        tone: "muted",
        showChevron: hasHistory,
        disabled: true
      };
    case "cancelled":
      return {
        ...HIDDEN,
        visible: true,
        kind: "cancelled",
        label: hasHistory
          ? `Retry cancelled · ${summary.attemptsMade} done`
          : "Retry cancelled",
        tone: "muted",
        showChevron: hasHistory,
        canConfigure: eligible > 0
      };
    default:
      return HIDDEN;
  }
}

/** Should the metrics accordion auto-open? (scheduled/processing/recent activity) */
export function shouldAutoExpand(campaign: Campaign): boolean {
  const summary = campaign.retrySummary;
  if (!summary || summary.status === "none") return false;
  const hasHistory = summary.attemptsMade > 0 || summary.recoveredCount > 0;
  if (summary.status === "active" && summary.eligibleCount === 0 && !hasHistory) {
    return false;
  }
  if (summary.processingCount > 0) return true;
  if (summary.status === "active" && summary.attemptsMade < summary.maxRetries)
    return true;
  return false;
}
