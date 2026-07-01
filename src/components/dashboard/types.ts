import {
  BarChart3,
  ClipboardList,
  ContactRound,
  Inbox,
  LayoutDashboard,
  Megaphone,
  MessageSquareText,
  Settings
} from "lucide-react";

import type { Campaign, MessageTemplate } from "@/types/entities";

export type TabKey =
  | "overview"
  | "inbox"
  | "campaigns"
  | "contacts"
  | "lists"
  | "templates"
  | "reports"
  | "settings";

export const tabs: Array<{
  key: TabKey;
  label: string;
  description: string;
  icon: typeof LayoutDashboard;
}> = [
  { key: "overview", label: "Overview", description: "Delivery at a glance", icon: LayoutDashboard },
  { key: "inbox", label: "Inbox", description: "Conversations & webhook events", icon: Inbox },
  { key: "campaigns", label: "Campaigns", description: "Build and send a broadcast", icon: Megaphone },
  { key: "contacts", label: "Contacts", description: "Your subscriber base", icon: ContactRound },
  { key: "lists", label: "Lists", description: "Audience segments", icon: ClipboardList },
  { key: "templates", label: "Templates", description: "Approved message templates", icon: MessageSquareText },
  { key: "reports", label: "Reports", description: "Campaign history & delivery", icon: BarChart3 },
  { key: "settings", label: "Settings", description: "Meta connection diagnostics", icon: Settings }
];

export const palette = ["#414C2F", "#BA401D", "#BB5524", "#7F6F34", "#E7A356"];

export const fallbackTemplate: MessageTemplate = {
  _id: "event_details_reminder_1",
  name: "event_details_reminder_1",
  language: "en_US",
  category: "UTILITY",
  status: "APPROVED",
  body:
    "*Reminder:* {{djname}} at Moon Bar and Kitchen this {{day}}\n\nThe event starts on {{date}} at {{time}} at *Moon Bar & Kitchen*",
  parameterFormat: "NAMED",
  parameters: [
    { name: "djname", example: "DJ Ravi" },
    { name: "day", example: "Friday" },
    { name: "date", example: "21st March" },
    { name: "time", example: "06:30 PM" }
  ],
  createdAt: new Date().toISOString()
};

export type WhatsAppMessage = {
  _id: string;
  messageId: string;
  direction: "inbound" | "outbound";
  from?: string;
  to?: string;
  contactName?: string;
  type?: string;
  text?: string;
  templateName?: string;
  lastStatus?: string;
  errors?: unknown[];
  createdAt: string;
};

export type WhatsAppStatus = {
  _id: string;
  messageId: string;
  status: string;
  recipientId?: string;
  errors?: unknown[];
  createdAt: string;
};

export type WebhookEvent = {
  _id: string;
  object?: string;
  payload: unknown;
  createdAt: string;
};

export type CampaignProgress = {
  campaignId?: string;
  total: number;
  sent: number;
  acceptedCount: number;
  failedCount: number;
  currentName?: string;
  currentPhone?: string;
  currentStatus?: string;
  error?: string;
  canceled?: boolean;
};

export type CampaignBatchResult = {
  campaignId: string;
  total: number;
  sent: number;
  acceptedCount: number;
  failedCount: number;
  queuedCount: number;
  done: boolean;
  status: string;
  canceled?: boolean;
  canceledCount?: number;
  current?: {
    name?: string;
    phone?: string;
    status?: string;
    error?: string;
  };
};

export function csvToArray(value: string) {
  const seen = new Set<string>();
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => {
      if (!item) return false;
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export type CampaignDeliveryStats = {
  submitted: number;
  delivered: number;
  read: number;
  failed: number;
  queued: number;
};

// Reconstructs the real WhatsApp delivery funnel from per-recipient webhook
// statuses (recipient.lastStatus is set by processStatuses). "submitted" is the
// count WhatsApp accepted for sending; "delivered"/"read" come from delivery
// receipts and line up with Meta's WhatsApp Manager numbers.
export function getCampaignDeliveryStats(campaign: Campaign): CampaignDeliveryStats {
  const stats: CampaignDeliveryStats = {
    submitted: 0,
    delivered: 0,
    read: 0,
    failed: 0,
    queued: 0
  };

  for (const recipient of campaign.recipients ?? []) {
    const last = recipient.lastStatus;

    if (recipient.status === "failed" || last === "failed") {
      stats.failed += 1;
      continue;
    }
    if (recipient.status === "queued") {
      stats.queued += 1;
      continue;
    }
    if (recipient.status === "accepted") {
      stats.submitted += 1;
      if (last === "read") {
        stats.read += 1;
        stats.delivered += 1;
      } else if (last === "delivered") {
        stats.delivered += 1;
      }
    }
    // "canceled" recipients were never sent and are intentionally excluded.
  }

  return stats;
}
