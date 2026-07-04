"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { formatDistanceToNow } from "date-fns";
import {
  Code2,
  Inbox as InboxIcon,
  Loader2,
  Maximize2,
  MessageSquareText,
  Minimize2,
  Plus,
  RefreshCw,
  Search,
  Send,
  X
} from "lucide-react";

import type { Contact, MessageTemplate } from "@/types/entities";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { staggerContainer } from "@/lib/motion";
import { cn } from "@/lib/utils";
import {
  StatusGlyph,
  getInitials,
  messageText,
  phoneKey,
  shortTime,
  timeAgo
} from "./conversation";
import { InboxTemplateDialog } from "./InboxTemplateDialog";
import { Section } from "./Section";
import type { WebhookEvent, WhatsAppMessage, WhatsAppStatus } from "./types";

const CS_WINDOW_MS = 24 * 60 * 60 * 1000;

type BadgeVariant = "success" | "secondary" | "muted" | "destructive";

type ChatConversation = {
  phone: string;
  name: string;
  messages: WhatsAppMessage[];
  latest?: WhatsAppMessage;
  contact?: Contact;
};

const statusTone: Record<string, BadgeVariant> = {
  read: "success",
  delivered: "secondary",
  sent: "muted",
  accepted: "muted",
  failed: "destructive"
};

function lastInboundMessage(conversation: ChatConversation) {
  return [...conversation.messages]
    .reverse()
    .find((message) => message.direction === "inbound");
}

function sessionExpiresAt(conversation: ChatConversation) {
  const lastInbound = lastInboundMessage(conversation);
  if (!lastInbound) return null;
  return new Date(new Date(lastInbound.createdAt).getTime() + CS_WINDOW_MS);
}

function isSessionOpen(conversation: ChatConversation) {
  const expiresAt = sessionExpiresAt(conversation);
  return !!expiresAt && expiresAt.getTime() > Date.now();
}

function formatError(errors?: unknown[]) {
  const first = errors?.[0];
  if (!first) return "";
  if (typeof first === "string") return first;
  if (
    typeof first === "object" &&
    first &&
    "message" in first &&
    typeof first.message === "string"
  ) {
    return first.message;
  }
  if (
    typeof first === "object" &&
    first &&
    "error" in first &&
    first.error &&
    typeof first.error === "object" &&
    "message" in first.error
  ) {
    return String(first.error.message);
  }
  return JSON.stringify(first).slice(0, 180);
}

function MessageBubble({ message }: { message: WhatsAppMessage }) {
  const inbound = message.direction === "inbound";
  const failed = message.lastStatus === "failed";
  const error = formatError(message.errors);

  return (
    <div
      className={cn(
        "flex w-full",
        inbound ? "justify-start" : "justify-end"
      )}
    >
      <div
        className={cn(
          "max-w-[78%] rounded-lg px-3 py-2 shadow-sm",
          inbound
            ? "rounded-tl-sm bg-white text-moon-ink"
            : failed
              ? "rounded-tr-sm bg-moon-red/10 text-moon-ink"
              : "rounded-tr-sm bg-[#D9FDD3] text-moon-ink"
        )}
      >
        {message.type === "template" && message.templateName ? (
          <Badge variant="secondary" className="mb-1 max-w-full truncate">
            {message.templateName}
          </Badge>
        ) : null}
        <p className="whitespace-pre-wrap break-words text-sm leading-6">
          {messageText(message)}
        </p>
        {error ? (
          <p className="mt-1 break-words text-xs leading-5 text-moon-red">
            {error}
          </p>
        ) : null}
        <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
          <span>{shortTime(message.createdAt)}</span>
          {!inbound ? <StatusGlyph status={message.lastStatus} /> : null}
        </div>
      </div>
    </div>
  );
}

export function Inbox({
  contacts,
  messages,
  statuses,
  events,
  templates,
  busy,
  focusPhone,
  onFocusPhoneHandled,
  onSendMessage,
  onSendTemplate,
  onRefresh
}: {
  contacts: Contact[];
  messages: WhatsAppMessage[];
  statuses: WhatsAppStatus[];
  events: WebhookEvent[];
  templates: MessageTemplate[];
  busy: string;
  focusPhone?: string;
  onFocusPhoneHandled?: () => void;
  onSendMessage: (input: {
    to: string;
    text: string;
    contactName?: string;
  }) => Promise<boolean>;
  onSendTemplate: (input: {
    to: string;
    templateName: string;
    language: string;
    parameters: Record<string, string>;
    parameterOrder: string[];
    parameterFormat?: "NAMED" | "POSITIONAL";
    headerImageId?: string;
    contactName?: string;
  }) => Promise<boolean>;
  onRefresh: () => void;
}) {
  const [search, setSearch] = useState("");
  const [activePhone, setActivePhone] = useState("");
  const [draft, setDraft] = useState("");
  const [developerOpen, setDeveloperOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);

  const conversations = useMemo(() => {
    const contactByPhone = new Map<string, Contact>();
    const map = new Map<string, ChatConversation>();

    for (const contact of contacts) {
      const key = phoneKey(contact.phone);
      if (!key) continue;
      contactByPhone.set(key, contact);
      map.set(key, {
        phone: key,
        name: contact.name || `+${key}`,
        contact,
        messages: []
      });
    }

    function ensureConversation(phone?: string, name?: string) {
      const key = phoneKey(phone);
      if (!key) return null;
      const contact = contactByPhone.get(key);
      const existing = map.get(key);
      if (existing) {
        if (contact) existing.contact = contact;
        if (!existing.name || existing.name === `+${key}`) {
          existing.name = contact?.name || name || `+${key}`;
        }
        return existing;
      }
      const conversation: ChatConversation = {
        phone: key,
        name: contact?.name || name || `+${key}`,
        contact,
        messages: []
      };
      map.set(key, conversation);
      return conversation;
    }

    for (const message of messages) {
      const phone =
        message.direction === "inbound" ? message.from : message.to;
      const conversation = ensureConversation(phone, message.contactName);
      if (conversation) conversation.messages.push(message);
    }

    return Array.from(map.values())
      .map((conversation) => {
        const sortedMessages = [...conversation.messages].sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        return {
          ...conversation,
          messages: sortedMessages,
          latest: sortedMessages.at(-1)
        };
      })
      .sort((a, b) => {
        const aOpen = isSessionOpen(a);
        const bOpen = isSessionOpen(b);
        if (aOpen !== bOpen) return aOpen ? -1 : 1;
        const aTime = a.latest ? new Date(a.latest.createdAt).getTime() : 0;
        const bTime = b.latest ? new Date(b.latest.createdAt).getTime() : 0;
        if (aTime !== bTime) return bTime - aTime;
        return a.name.localeCompare(b.name);
      });
  }, [contacts, messages]);

  const visibleConversations = useMemo(() => {
    const term = search.toLowerCase().trim();
    return conversations
      .filter((conversation) => {
        if (!term) return true;
        return [
          conversation.name,
          conversation.phone,
          conversation.contact?.source,
          conversation.contact?.tags.join(" "),
          messageText(conversation.latest)
        ]
          .join(" ")
          .toLowerCase()
          .includes(term);
      })
      .slice(0, 150);
  }, [conversations, search]);

  useEffect(() => {
    if (!focusPhone) return;
    setActivePhone(focusPhone);
    onFocusPhoneHandled?.();
  }, [focusPhone, onFocusPhoneHandled]);

  useEffect(() => {
    if (!conversations.length) {
      if (activePhone) setActivePhone("");
      return;
    }
    if (!activePhone || !conversations.some((item) => item.phone === activePhone)) {
      setActivePhone(conversations[0].phone);
    }
  }, [activePhone, conversations]);

  const activeConversation =
    conversations.find((conversation) => conversation.phone === activePhone) ||
    visibleConversations[0] ||
    conversations[0];
  const sessionOpen = activeConversation ? isSessionOpen(activeConversation) : false;
  const sessionExpiry = activeConversation ? sessionExpiresAt(activeConversation) : null;
  const sending = activeConversation
    ? busy === `chat-send-${activeConversation.phone}`
    : false;

  useEffect(() => {
    const container = messagesScrollRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [
    activeConversation?.phone,
    activeConversation?.messages.length,
    activeConversation?.messages.at(-1)?._id
  ]);

  useEffect(() => {
    if (!fullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [fullscreen]);

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!activeConversation || !text || sending || !sessionOpen) return;

    const sent = await onSendMessage({
      to: activeConversation.phone,
      text,
      contactName: activeConversation.name
    });
    if (sent) setDraft("");
  }

  const chatUi = (
    <div
      className={cn(
        "relative overflow-hidden bg-[#F4EEE3]",
        fullscreen
          ? "flex h-full min-h-0 flex-col"
          : "h-[720px] rounded-xl border border-moon-green/12 shadow-sm"
      )}
    >
      <div
        className={cn(
          "grid h-full min-h-0 overflow-hidden",
          fullscreen
            ? "lg:grid-cols-[400px_minmax(0,1fr)]"
            : "lg:grid-cols-[360px_minmax(0,1fr)]"
        )}
      >
        <aside
          className={cn(
            "flex h-full min-h-0 flex-col overflow-hidden border-b border-moon-green/12 bg-[#F7F3EA] lg:border-b-0 lg:border-r",
            fullscreen && "bg-white"
          )}
        >
          <div className="shrink-0 border-b border-moon-green/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-moon-ink">Chats</h3>
                <p className="text-sm text-muted-foreground">
                  {conversations.length.toLocaleString()} conversations
                </p>
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={onRefresh}
                disabled={busy === "messages"}
                title="Refresh"
              >
                <RefreshCw className={busy === "messages" ? "animate-spin" : ""} />
              </Button>
            </div>
            <div className="relative mt-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-moon-ink/40" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search chats or contacts"
                className="h-11 rounded-full bg-white pl-9"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto moon-scrollbar">
            {visibleConversations.map((conversation) => {
              const active = conversation.phone === activeConversation?.phone;
              const latest = conversation.latest;
              const open = isSessionOpen(conversation);
              return (
                <button
                  key={conversation.phone}
                  type="button"
                  onClick={() => setActivePhone(conversation.phone)}
                  className={cn(
                    "flex w-full items-center gap-3 border-b border-moon-green/8 px-4 py-3 text-left transition-colors hover:bg-white/70",
                    active ? "bg-white" : "bg-transparent",
                    fullscreen && active && "bg-[#F0F2F5]"
                  )}
                >
                  <Avatar className="h-11 w-11">
                    <AvatarFallback>{getInitials(conversation.name)}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-semibold text-moon-ink">
                          {conversation.name}
                        </span>
                        {open ? (
                          <Badge variant="success" className="shrink-0 px-1.5 py-0 text-[10px]">
                            24h
                          </Badge>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {latest ? timeAgo(latest.createdAt) : ""}
                      </span>
                    </span>
                    <span className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                      {latest?.direction === "outbound" ? (
                        <StatusGlyph status={latest.lastStatus} className="shrink-0" />
                      ) : null}
                      <span className="truncate">{messageText(latest)}</span>
                    </span>
                  </span>
                </button>
              );
            })}
            {!visibleConversations.length ? (
              <div className="grid place-items-center p-10 text-center text-sm text-muted-foreground">
                <InboxIcon className="mb-3 h-7 w-7 text-moon-green/40" />
                No chats found
              </div>
            ) : null}
          </div>
        </aside>

        <section className="flex h-full min-h-0 flex-col overflow-hidden bg-[#EFE7DA]">
          {activeConversation ? (
            <>
              <div
                className={cn(
                  "flex shrink-0 items-center justify-between gap-3 border-b border-moon-green/12 bg-[#F7F3EA] px-4 py-3",
                  fullscreen && "bg-[#F0F2F5]"
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback>
                      {getInitials(activeConversation.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-moon-ink">
                      {activeConversation.name}
                    </h3>
                    <p className="truncate text-sm text-muted-foreground">
                      +{activeConversation.phone}
                    </p>
                    {sessionOpen && sessionExpiry ? (
                      <p className="truncate text-xs text-moon-green">
                        Reply window open · closes{" "}
                        {formatDistanceToNow(sessionExpiry, { addSuffix: true })}
                      </p>
                    ) : lastInboundMessage(activeConversation) ? (
                      <p className="truncate text-xs text-moon-red/80">
                        Reply window closed · send an approved template
                      </p>
                    ) : (
                      <p className="truncate text-xs text-muted-foreground">
                        No inbound messages yet · start with a template
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="muted">
                    {activeConversation.messages.length} messages
                  </Badge>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setDeveloperOpen(true)}
                    title="Developer events"
                  >
                    <Code2 />
                  </Button>
                </div>
              </div>

              <div
                ref={messagesScrollRef}
                className="min-h-0 flex-1 overflow-y-auto moon-scrollbar"
              >
                <div className="space-y-3 bg-[radial-gradient(circle_at_1px_1px,rgba(65,76,47,0.10)_1px,transparent_0)] bg-[length:22px_22px] p-5">
                  {activeConversation.messages.map((message) => (
                    <MessageBubble key={message._id} message={message} />
                  ))}
                  <div ref={messagesEndRef} />
                  {!activeConversation.messages.length ? (
                    <div className="flex min-h-[320px] items-center justify-center text-center text-sm text-muted-foreground">
                      <div>
                        <MessageSquareText className="mx-auto mb-3 h-8 w-8 text-moon-green/45" />
                        No messages with this contact yet
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <form
                onSubmit={handleSend}
                className={cn(
                  "flex shrink-0 items-end gap-2 border-t border-moon-green/12 bg-[#F7F3EA] p-3",
                  fullscreen && "bg-[#F0F2F5]"
                )}
              >
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 shrink-0 rounded-full bg-white"
                  onClick={() => setTemplateOpen(true)}
                  disabled={sending}
                  title="Send approved template"
                >
                  <Plus />
                </Button>
                <Textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder={
                    sessionOpen
                      ? "Message"
                      : "24-hour window closed — use + to send a template"
                  }
                  className="min-h-11 resize-none rounded-2xl bg-white"
                  disabled={sending || !sessionOpen}
                />
                <Button
                  type="submit"
                  size="icon"
                  className="h-11 w-11 shrink-0 rounded-full"
                  disabled={!draft.trim() || sending || !sessionOpen}
                  title="Send message"
                >
                  {sending ? <Loader2 className="animate-spin" /> : <Send />}
                </Button>
              </form>
            </>
          ) : (
            <div className="grid flex-1 place-items-center p-8 text-center text-sm text-muted-foreground">
              <div>
                <InboxIcon className="mx-auto mb-3 h-8 w-8 text-moon-green/45" />
                Select a contact to chat
              </div>
            </div>
          )}
        </section>
      </div>

      <div
        className={cn(
          "absolute inset-y-0 right-0 z-20 w-full max-w-[480px] border-l border-moon-green/12 bg-[#F7F3EA] shadow-2xl transition-transform duration-300",
          developerOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex items-center justify-between border-b border-moon-green/10 p-4">
          <div>
            <h3 className="font-semibold text-moon-ink">Developer events</h3>
            <p className="text-sm text-muted-foreground">
              Delivery receipts and webhook payloads
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDeveloperOpen(false)}
            title="Close"
          >
            <X />
          </Button>
        </div>

        <Tabs defaultValue="delivery" className="p-4">
          <TabsList className="w-full">
            <TabsTrigger value="delivery" className="flex-1">
              Delivery ({statuses.length})
            </TabsTrigger>
            <TabsTrigger value="webhooks" className="flex-1">
              Webhooks ({events.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="delivery">
            <div className="mt-3 overflow-hidden rounded-lg border border-moon-green/12 bg-white">
              <ScrollArea className={cn(fullscreen ? "h-[calc(100vh-12rem)]" : "h-[600px]")}>
                {statuses.map((status) => (
                  <div
                    key={status._id}
                    className="flex items-center justify-between gap-3 border-b border-moon-green/8 px-3 py-3 text-sm last:border-0"
                  >
                    <div className="min-w-0">
                      <Badge
                        variant={statusTone[status.status] || "muted"}
                        className="capitalize"
                      >
                        <StatusGlyph status={status.status} />
                        {status.status}
                      </Badge>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {status.messageId}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {timeAgo(status.createdAt)}
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
            <div className="mt-3 rounded-lg bg-moon-ink p-3">
              <ScrollArea className={cn(fullscreen ? "h-[calc(100vh-12rem)]" : "h-[600px]")}>
                {events.map((event) => (
                  <details
                    key={event._id}
                    className="border-b border-white/10 py-2 last:border-0"
                  >
                    <summary className="cursor-pointer text-xs font-medium text-moon-cream">
                      {event.object || "event"} · {timeAgo(event.createdAt)}
                    </summary>
                    <pre className="mt-2 whitespace-pre-wrap break-words text-[11px] leading-5 text-moon-cream/70">
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
      </div>

      {developerOpen ? (
        <button
          type="button"
          aria-label="Close developer events"
          className="absolute inset-0 z-10 bg-moon-ink/20 lg:hidden"
          onClick={() => setDeveloperOpen(false)}
        />
      ) : null}
    </div>
  );

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
    >
      {fullscreen ? (
        <div className="fixed inset-0 z-[100] flex flex-col bg-[#F0F2F5]">
          <div className="flex shrink-0 items-center justify-between border-b border-[#D1D7DB] bg-[#F0F2F5] px-4 py-3 sm:px-6">
            <div>
              <h2 className="text-base font-semibold text-[#111B21]">WhatsApp Inbox</h2>
              <p className="text-sm text-[#667781]">Live customer conversations</p>
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0 bg-white"
              onClick={() => setFullscreen(false)}
              title="Exit full screen"
              aria-label="Exit full screen"
            >
              <Minimize2 />
            </Button>
          </div>
          <div className="min-h-0 flex-1">{chatUi}</div>
        </div>
      ) : (
        <Section
          title="WhatsApp Inbox"
          description="Live customer conversations"
          action={
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => setFullscreen(true)}
              title="Full screen"
              aria-label="Full screen"
            >
              <Maximize2 />
            </Button>
          }
        >
          {chatUi}
        </Section>
      )}

      {activeConversation ? (
        <InboxTemplateDialog
          open={templateOpen}
          onOpenChange={setTemplateOpen}
          templates={templates}
          phone={activeConversation.phone}
          contactName={activeConversation.name}
          sending={sending}
          onSend={onSendTemplate}
        />
      ) : null}
    </motion.div>
  );
}
