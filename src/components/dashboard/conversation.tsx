import { formatDistanceToNow } from "date-fns";
import { AlertCircle, Check, CheckCheck, Clock3 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { WhatsAppMessage } from "./types";

export function phoneKey(phone?: string) {
  return (phone || "").replace(/[^\d]/g, "");
}

export function getInitials(name: string) {
  const parts = name
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function messageText(message?: WhatsAppMessage) {
  if (!message) return "Start a conversation";
  return message.text || message.templateName || message.messageId || "WhatsApp message";
}

export function timeAgo(value?: string) {
  if (!value) return "";
  return `${formatDistanceToNow(new Date(value))} ago`;
}

export function shortTime(value?: string) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

// WhatsApp-style delivery indicator shared by the inbox and the live campaign
// tracker so both render identical icons for each status.
export function StatusGlyph({
  status,
  className
}: {
  status?: string;
  className?: string;
}) {
  const normalized = (status || "").toLowerCase();

  if (normalized === "failed") {
    return (
      <AlertCircle
        className={cn("h-3.5 w-3.5 text-moon-red", className)}
        aria-label="failed"
      />
    );
  }
  if (normalized === "read") {
    return (
      <CheckCheck
        className={cn("h-4 w-4 text-[#34B7F1]", className)}
        aria-label="read"
      />
    );
  }
  if (normalized === "delivered") {
    return (
      <CheckCheck
        className={cn("h-4 w-4 text-moon-green/65", className)}
        aria-label="delivered"
      />
    );
  }
  if (normalized === "sent" || normalized === "accepted") {
    return (
      <Check
        className={cn("h-4 w-4 text-moon-green/65", className)}
        aria-label="sent"
      />
    );
  }
  return (
    <Clock3
      className={cn("h-3.5 w-3.5 text-muted-foreground", className)}
      aria-label="pending"
    />
  );
}
