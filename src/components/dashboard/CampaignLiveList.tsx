"use client";

import * as React from "react";
import { Radio } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StatusGlyph, getInitials, timeAgo } from "./conversation";
import type { WhatsAppMessage } from "./types";

// Ranks a message's delivery status so the live tracker can surface the most
// meaningful state per recipient (a failure or read receipt beats a bare "sent").
const STATUS_RANK: Record<string, number> = {
  failed: 5,
  read: 4,
  delivered: 3,
  sent: 2,
  accepted: 1
};

/**
 * Live delivery tracker shown in place of the recipient picker while a campaign
 * is sending. Reuses the inbox conversation-row look: avatar, name, time and a
 * WhatsApp-style status glyph next to the template name. Driven entirely by the
 * polled `messages` feed, so delivery receipts update in place.
 */
export function CampaignLiveList({
  messages,
  campaignId,
  total
}: {
  messages: WhatsAppMessage[];
  campaignId?: string;
  total?: number;
}) {
  const rows = React.useMemo(() => {
    if (!campaignId) return [];
    // One row per recipient, keeping the most advanced status we've seen.
    const byPhone = new Map<string, WhatsAppMessage>();
    for (const message of messages) {
      if (message.campaignId !== campaignId) continue;
      const key = message.to || message.messageId;
      if (!key) continue;
      const existing = byPhone.get(key);
      if (!existing) {
        byPhone.set(key, message);
        continue;
      }
      const rank = STATUS_RANK[(message.lastStatus || "").toLowerCase()] ?? 0;
      const existingRank =
        STATUS_RANK[(existing.lastStatus || "").toLowerCase()] ?? 0;
      if (rank >= existingRank) byPhone.set(key, message);
    }
    return Array.from(byPhone.values()).sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [messages, campaignId]);

  const counts = React.useMemo(() => {
    const tally = { sent: 0, delivered: 0, read: 0, failed: 0 };
    for (const row of rows) {
      const status = (row.lastStatus || "").toLowerCase();
      if (status === "failed") tally.failed += 1;
      else if (status === "read") {
        tally.read += 1;
        tally.delivered += 1;
        tally.sent += 1;
      } else if (status === "delivered") {
        tally.delivered += 1;
        tally.sent += 1;
      } else tally.sent += 1;
    }
    return tally;
  }, [rows]);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-moon-green/12 bg-muted/40 px-3.5 py-2.5 text-xs">
        <span className="flex items-center gap-1.5 font-medium text-moon-green">
          <Radio className="h-3.5 w-3.5 animate-pulse" />
          Live delivery
        </span>
        <span className="text-muted-foreground">
          Sent <strong className="text-moon-ink">{counts.sent}</strong>
          {total ? ` / ${total}` : ""}
        </span>
        <span className="text-muted-foreground">
          Delivered{" "}
          <strong className="text-moon-green">{counts.delivered}</strong>
        </span>
        {counts.read ? (
          <span className="text-muted-foreground">
            Read <strong className="text-[#34B7F1]">{counts.read}</strong>
          </span>
        ) : null}
        <span className="text-muted-foreground">
          Failed <strong className="text-moon-red">{counts.failed}</strong>
        </span>
      </div>

      <div className="rounded-xl border border-moon-green/12">
        <ScrollArea className="h-[420px]">
          {rows.map((row) => (
            <div
              key={row.to || row.messageId}
              className="flex items-center gap-3 border-b border-moon-green/8 px-3 py-3 last:border-0"
            >
              <Avatar className="h-10 w-10">
                <AvatarFallback>
                  {getInitials(row.contactName || row.to || "?")}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-moon-ink">
                    {row.contactName || `+${row.to}`}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {timeAgo(row.createdAt)}
                  </span>
                </span>
                <span className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <StatusGlyph status={row.lastStatus} className="shrink-0" />
                  <span className="truncate">
                    {row.templateName || "template"}
                  </span>
                </span>
              </span>
            </div>
          ))}
          {!rows.length ? (
            <div className="grid place-items-center p-10 text-center text-sm text-muted-foreground">
              <Radio className="mb-2 h-6 w-6 animate-pulse text-moon-green/50" />
              Waiting for the first sends to land…
            </div>
          ) : null}
        </ScrollArea>
      </div>
    </div>
  );
}
