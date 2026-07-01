"use client";

import { motion } from "motion/react";
import { formatDistanceToNow } from "date-fns";
import { Inbox as InboxIcon, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { staggerContainer } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Section } from "./Section";
import type { WebhookEvent, WhatsAppMessage, WhatsAppStatus } from "./types";

const statusTone: Record<string, string> = {
  read: "success",
  delivered: "secondary",
  sent: "muted",
  failed: "destructive"
};

export function Inbox({
  messages,
  statuses,
  events,
  busy,
  onRefresh
}: {
  messages: WhatsAppMessage[];
  statuses: WhatsAppStatus[];
  events: WebhookEvent[];
  busy: string;
  onRefresh: () => void;
}) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]"
    >
      <Section
        title="Conversation feed"
        description="Inbound and outbound WhatsApp messages"
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={busy === "messages"}
          >
            <RefreshCw className={busy === "messages" ? "animate-spin" : ""} />
            Refresh
          </Button>
        }
      >
        <div className="rounded-xl border border-moon-green/12">
          <ScrollArea className="h-[620px]">
            {messages.map((message) => {
              const inbound = message.direction === "inbound";
              return (
                <div
                  key={message._id}
                  className="border-b border-moon-green/8 p-4 last:border-0"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-moon-ink">
                        {message.contactName ||
                          (inbound ? `+${message.from}` : `+${message.to}`)}
                      </p>
                      <p className="mt-0.5 text-xs uppercase tracking-wide text-muted-foreground">
                        {inbound ? "Inbound" : "Outbound"} · {message.type || "message"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {message.lastStatus ? (
                        <Badge
                          variant={
                            (statusTone[message.lastStatus] as
                              | "success"
                              | "secondary"
                              | "muted"
                              | "destructive") || "muted"
                          }
                        >
                          {message.lastStatus}
                        </Badge>
                      ) : null}
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(message.createdAt))} ago
                      </span>
                    </div>
                  </div>
                  <p
                    className={cn(
                      "mt-3 inline-block max-w-full rounded-2xl px-3.5 py-2 text-sm leading-6",
                      inbound
                        ? "bg-moon-yellow/50 text-moon-ink"
                        : "bg-moon-green text-moon-paper"
                    )}
                  >
                    {message.text || message.templateName || message.messageId}
                  </p>
                  {message.errors?.length ? (
                    <p className="mt-2 text-xs text-moon-red">
                      {JSON.stringify(message.errors)}
                    </p>
                  ) : null}
                </div>
              );
            })}
            {!messages.length ? (
              <div className="grid place-items-center p-12 text-center text-sm text-muted-foreground">
                <InboxIcon className="mb-3 h-7 w-7 text-moon-green/40" />
                Webhook messages appear here after Meta sends events.
              </div>
            ) : null}
          </ScrollArea>
        </div>
      </Section>

      <Section title="Events" description="Delivery receipts & raw webhooks">
        <Tabs defaultValue="delivery">
          <TabsList className="w-full">
            <TabsTrigger value="delivery" className="flex-1">
              Delivery ({statuses.length})
            </TabsTrigger>
            <TabsTrigger value="webhooks" className="flex-1">
              Webhooks ({events.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="delivery">
            <div className="rounded-xl border border-moon-green/12">
              <ScrollArea className="h-[520px]">
                {statuses.map((status) => (
                  <div
                    key={status._id}
                    className="flex items-center justify-between gap-3 border-b border-moon-green/8 px-3 py-3 text-sm last:border-0"
                  >
                    <div className="min-w-0">
                      <Badge
                        variant={
                          (statusTone[status.status] as
                            | "success"
                            | "secondary"
                            | "muted"
                            | "destructive") || "muted"
                        }
                        className="capitalize"
                      >
                        {status.status}
                      </Badge>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {status.messageId}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(status.createdAt))} ago
                    </span>
                  </div>
                ))}
                {!statuses.length ? (
                  <p className="p-4 text-sm text-muted-foreground">
                    No delivery events yet
                  </p>
                ) : null}
              </ScrollArea>
            </div>
          </TabsContent>

          <TabsContent value="webhooks">
            <div className="rounded-xl bg-moon-ink p-3">
              <ScrollArea className="h-[500px]">
                {events.map((event) => (
                  <details
                    key={event._id}
                    className="border-b border-white/10 py-2 last:border-0"
                  >
                    <summary className="cursor-pointer text-xs font-medium text-moon-cream">
                      {event.object || "event"} ·{" "}
                      {formatDistanceToNow(new Date(event.createdAt))} ago
                    </summary>
                    <pre className="mt-2 whitespace-pre-wrap text-[11px] leading-5 text-moon-cream/70">
                      {JSON.stringify(event.payload, null, 2)}
                    </pre>
                  </details>
                ))}
                {!events.length ? (
                  <p className="p-2 text-sm text-moon-cream/70">
                    No webhook calls stored yet
                  </p>
                ) : null}
              </ScrollArea>
            </div>
          </TabsContent>
        </Tabs>
      </Section>
    </motion.div>
  );
}
