"use client";

import { ChevronDown, Loader2, RotateCcw } from "lucide-react";

import type { Campaign } from "@/types/entities";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getRetryChipState, type RetryChipTone } from "./retryState";

const toneClass: Record<RetryChipTone, string> = {
  outline:
    "border-moon-green/30 bg-card text-moon-ink hover:bg-moon-cream/60",
  active: "border-moon-green/25 bg-moon-green/10 text-moon-green hover:bg-moon-green/15",
  warning: "border-transparent bg-moon-yellow/60 text-moon-ink hover:bg-moon-yellow/70",
  muted: "border-transparent bg-muted text-muted-foreground hover:bg-muted/80"
};

export function RetryChip({
  campaign,
  expanded,
  onToggle,
  onOpenDrawer
}: {
  campaign: Campaign;
  expanded: boolean;
  onToggle: () => void;
  onOpenDrawer: () => void;
}) {
  const state = getRetryChipState(campaign);
  if (!state.visible) return null;

  const body = (
    <button
      type="button"
      onClick={state.canConfigure && !state.disabled ? onOpenDrawer : undefined}
      disabled={state.disabled || !state.canConfigure}
      aria-label={`${state.label}${state.sublabel ? `, ${state.sublabel}` : ""}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        toneClass[state.tone],
        state.disabled && "cursor-not-allowed opacity-70",
        !state.canConfigure && !state.disabled && "cursor-default"
      )}
    >
      {state.spinner ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <RotateCcw className="h-3.5 w-3.5" />
      )}
      {state.label}
    </button>
  );

  return (
    <div className="flex flex-col items-end gap-0.5">
      <div className="flex items-center gap-1">
        {state.kind === "expired" ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>{body}</TooltipTrigger>
              <TooltipContent>
                The campaign relevance date has passed — no further retries will run.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          body
        )}

        {state.showChevron ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={expanded ? "Hide retry details" : "Show retry details"}
            className="rounded-md p-1 text-moon-ink/50 transition-colors hover:bg-moon-cream hover:text-moon-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform",
                expanded && "rotate-180"
              )}
            />
          </button>
        ) : null}
      </div>
      {state.sublabel ? (
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {state.sublabel}
        </span>
      ) : null}
    </div>
  );
}
