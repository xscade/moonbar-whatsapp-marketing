"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  ClipboardList,
  ContactRound,
  Database,
  History,
  Inbox,
  LayoutDashboard,
  Loader2,
  LogOut,
  Megaphone,
  MessageSquareText,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  Tag,
  Trash2,
  UsersRound
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type {
  AdminUser,
  Campaign,
  Contact,
  ContactList,
  MessageTemplate
} from "@/types/entities";

type TabKey =
  | "overview"
  | "inbox"
  | "campaigns"
  | "contacts"
  | "lists"
  | "templates"
  | "reports"
  | "settings";

type DashboardClientProps = {
  user: AdminUser;
};

const tabs: Array<{ key: TabKey; label: string; icon: typeof LayoutDashboard }> = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "inbox", label: "Inbox", icon: Inbox },
  { key: "campaigns", label: "Campaigns", icon: Megaphone },
  { key: "contacts", label: "Contacts", icon: ContactRound },
  { key: "lists", label: "Lists", icon: ClipboardList },
  { key: "templates", label: "Templates", icon: MessageSquareText },
  { key: "reports", label: "Reports", icon: BarChart3 },
  { key: "settings", label: "Settings", icon: Settings }
];

const palette = ["#414C2F", "#BA401D", "#BB5524", "#7F6F34", "#E7A356"];

const fallbackTemplate: MessageTemplate = {
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

type WhatsAppMessage = {
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

type WhatsAppStatus = {
  _id: string;
  messageId: string;
  status: string;
  recipientId?: string;
  errors?: unknown[];
  createdAt: string;
};

type WebhookEvent = {
  _id: string;
  object?: string;
  payload: unknown;
  createdAt: string;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error?.message || body.error || "Request failed");
  }
  return body as T;
}

function csvToArray(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function DashboardClient({ user }: DashboardClientProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [lists, setLists] = useState<ContactList[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [statuses, setStatuses] = useState<WhatsAppStatus[]>([]);
  const [webhookEvents, setWebhookEvents] = useState<WebhookEvent[]>([]);
  const [diagnostics, setDiagnostics] = useState<Record<string, unknown> | null>(null);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [selectedListIds, setSelectedListIds] = useState<Set<string>>(new Set());
  const [selectedTemplateName, setSelectedTemplateName] = useState("event_details_reminder_1");
  const [campaignName, setCampaignName] = useState("Weekend event reminder");
  const [parameterValues, setParameterValues] = useState<Record<string, string>>({
    djname: "DJ Ravi",
    day: "Friday",
    date: "21st March",
    time: "06:30 PM"
  });
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  const selectedTemplate =
    templates.find((template) => template.name === selectedTemplateName) ??
    fallbackTemplate;

  const filteredContacts = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return contacts;
    return contacts.filter((contact) =>
      [contact.name, contact.phone, contact.source, contact.tags.join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [contacts, search]);

  const campaignRecipients = useMemo(() => {
    const selectedLists = Array.from(selectedListIds);
    return contacts.filter(
      (contact) =>
        selectedContactIds.has(contact._id) ||
        contact.listIds.some((listId) => selectedLists.includes(listId))
    );
  }, [contacts, selectedContactIds, selectedListIds]);

  const stats = useMemo(() => {
    const accepted = campaigns.reduce((sum, campaign) => sum + campaign.acceptedCount, 0);
    const failed = campaigns.reduce((sum, campaign) => sum + campaign.failedCount, 0);
    return {
      contacts: contacts.length,
      lists: lists.length,
      templates: templates.length || 1,
      campaigns: campaigns.length,
      accepted,
      failed
    };
  }, [campaigns, contacts.length, lists.length, templates.length]);

  async function refreshAll() {
    setBusy("loading");
    try {
      const [contactRes, listRes, templateRes, campaignRes] = await Promise.all([
        api<{ data: Contact[] }>("/api/contacts"),
        api<{ data: ContactList[] }>("/api/lists"),
        api<{ data: MessageTemplate[] }>("/api/templates"),
        api<{ data: Campaign[] }>("/api/campaigns")
      ]);
      setContacts(contactRes.data);
      setLists(listRes.data);
      setTemplates(templateRes.data.length ? templateRes.data : [fallbackTemplate]);
      setCampaigns(campaignRes.data);
      await refreshMessages();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not load dashboard");
    } finally {
      setBusy("");
    }
  }

  async function refreshMessages() {
    const messageRes = await api<{
      messages: WhatsAppMessage[];
      statuses: WhatsAppStatus[];
      events: WebhookEvent[];
    }>("/api/messages");
    setMessages(messageRes.messages);
    setStatuses(messageRes.statuses);
    setWebhookEvents(messageRes.events);
  }

  useEffect(() => {
    refreshAll();
  }, []);

  useEffect(() => {
    const nextTemplate =
      templates.find((template) => template.name === selectedTemplateName) ??
      fallbackTemplate;
    const nextValues = { ...parameterValues };
    for (const parameter of nextTemplate.parameters) {
      if (!nextValues[parameter.name]) {
        nextValues[parameter.name] = parameter.example || "";
      }
    }
    setParameterValues(nextValues);
  }, [selectedTemplateName, templates]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  async function createContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = {
      name: String(form.get("name") || ""),
      phone: String(form.get("phone") || ""),
      source: String(form.get("source") || ""),
      tags: csvToArray(String(form.get("tags") || "")),
      listIds: form.getAll("listIds").map(String),
      notes: String(form.get("notes") || ""),
      consentStatus: "subscribed"
    };

    setBusy("contact");
    try {
      await api("/api/contacts", { method: "POST", body: JSON.stringify(payload) });
      formElement.reset();
      await refreshAll();
      setNotice("Contact saved");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not save contact");
    } finally {
      setBusy("");
    }
  }

  async function createList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") || ""),
      description: String(form.get("description") || ""),
      color: String(form.get("color") || palette[0])
    };

    setBusy("list");
    try {
      await api("/api/lists", { method: "POST", body: JSON.stringify(payload) });
      event.currentTarget.reset();
      await refreshAll();
      setNotice("List created");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not create list");
    } finally {
      setBusy("");
    }
  }

  async function syncTemplates() {
    setBusy("sync");
    try {
      const result = await api<{ synced: number }>("/api/templates/sync", {
        method: "POST",
        body: "{}"
      });
      await refreshAll();
      setNotice(`${result.synced} templates synced from Meta`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Template sync failed");
    } finally {
      setBusy("");
    }
  }

  async function createTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") || ""),
      language: String(form.get("language") || "en_US"),
      category: String(form.get("category") || "UTILITY"),
      status: "LOCAL",
      body: String(form.get("body") || ""),
      parameterFormat: "NAMED",
      parameters: csvToArray(String(form.get("parameters") || "")).map((name) => ({
        name
      }))
    };

    setBusy("template");
    try {
      await api("/api/templates", { method: "POST", body: JSON.stringify(payload) });
      event.currentTarget.reset();
      await refreshAll();
      setNotice("Template saved");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not save template");
    } finally {
      setBusy("");
    }
  }

  async function sendCampaign() {
    if (!campaignRecipients.length) {
      setNotice("Select at least one contact or list");
      return;
    }

    setBusy("send");
    try {
      const result = await api<{ acceptedCount: number; failedCount: number }>(
        "/api/campaigns/send",
        {
          method: "POST",
          body: JSON.stringify({
            name: campaignName,
            templateName: selectedTemplate.name,
            language: selectedTemplate.language,
            parameters: parameterValues,
            parameterOrder: selectedTemplate.parameters.map((parameter) => parameter.name),
            listIds: Array.from(selectedListIds),
            contactIds: Array.from(selectedContactIds)
          })
        }
      );
      await refreshAll();
      setNotice(
        `${result.acceptedCount} accepted, ${result.failedCount} failed by WhatsApp`
      );
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Campaign failed");
    } finally {
      setBusy("");
    }
  }

  async function deleteContact(id: string) {
    setBusy(`delete-${id}`);
    try {
      await api(`/api/contacts/${id}`, { method: "DELETE" });
      await refreshAll();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not delete contact");
    } finally {
      setBusy("");
    }
  }

  async function loadDiagnostics() {
    setBusy("diagnostics");
    try {
      const result = await api<Record<string, unknown>>("/api/meta/diagnostics");
      setDiagnostics(result);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Diagnostics failed");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-moon-green/12 bg-moon-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 lg:px-6">
          <div className="flex items-center gap-3">
            <Image
              src="https://moon-bar-kitchen-new.vercel.app/images/moon%20logo%20(2).png"
              alt="Moon Bar and Kitchen"
              width={44}
              height={44}
              className="h-11 w-11 rounded-lg border border-moon-red/20 bg-moon-red object-contain p-1.5"
              priority
            />
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-moon-red">
                Moonbar
              </p>
              <h1 className="text-lg font-semibold text-moon-ink">
                WhatsApp Marketing
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden rounded-lg border border-moon-green/15 bg-white px-3 py-2 text-sm text-moon-ink/72 sm:block">
              {user.name}
            </span>
            <button
              onClick={logout}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-moon-green/15 bg-white text-moon-green transition hover:bg-moon-cream"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 lg:grid-cols-[248px_1fr] lg:px-6">
        <aside className="h-max rounded-lg border border-moon-green/15 bg-white/82 p-2 shadow-soft">
          <nav className="grid gap-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium transition ${
                    active
                      ? "bg-moon-green text-moon-paper"
                      : "text-moon-ink/70 hover:bg-moon-cream"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="grid gap-5">
          {notice ? (
            <div className="flex items-center justify-between rounded-lg border border-moon-gold/24 bg-moon-yellow/55 px-4 py-3 text-sm text-moon-ink">
              <span>{notice}</span>
              <button onClick={() => setNotice("")} className="font-semibold text-moon-red">
                Dismiss
              </button>
            </div>
          ) : null}

          {activeTab === "overview" ? (
            <Overview
              stats={stats}
              campaigns={campaigns}
              templates={templates.length ? templates : [fallbackTemplate]}
              busy={busy}
              onSync={syncTemplates}
              onRefresh={refreshAll}
            />
          ) : null}

          {activeTab === "inbox" ? (
            <InboxPanel
              messages={messages}
              statuses={statuses}
              events={webhookEvents}
              busy={busy}
              onRefresh={async () => {
                setBusy("messages");
                try {
                  await refreshMessages();
                } finally {
                  setBusy("");
                }
              }}
            />
          ) : null}

          {activeTab === "campaigns" ? (
            <Campaigns
              contacts={filteredContacts}
              allContacts={contacts}
              lists={lists}
              selectedContactIds={selectedContactIds}
              setSelectedContactIds={setSelectedContactIds}
              selectedListIds={selectedListIds}
              setSelectedListIds={setSelectedListIds}
              templates={templates.length ? templates : [fallbackTemplate]}
              selectedTemplateName={selectedTemplateName}
              setSelectedTemplateName={setSelectedTemplateName}
              selectedTemplate={selectedTemplate}
              campaignName={campaignName}
              setCampaignName={setCampaignName}
              parameterValues={parameterValues}
              setParameterValues={setParameterValues}
              search={search}
              setSearch={setSearch}
              recipientCount={campaignRecipients.length}
              busy={busy}
              onSend={sendCampaign}
            />
          ) : null}

          {activeTab === "contacts" ? (
            <Contacts
              contacts={filteredContacts}
              lists={lists}
              search={search}
              setSearch={setSearch}
              busy={busy}
              onCreate={createContact}
              onDelete={deleteContact}
            />
          ) : null}

          {activeTab === "lists" ? (
            <Lists lists={lists} busy={busy} onCreate={createList} />
          ) : null}

          {activeTab === "templates" ? (
            <Templates
              templates={templates.length ? templates : [fallbackTemplate]}
              busy={busy}
              onSync={syncTemplates}
              onCreate={createTemplate}
            />
          ) : null}

          {activeTab === "reports" ? (
            <Reports campaigns={campaigns} />
          ) : null}

          {activeTab === "settings" ? (
            <SettingsPanel
              diagnostics={diagnostics}
              busy={busy}
              onLoad={loadDiagnostics}
            />
          ) : null}
        </main>
      </div>
    </div>
  );
}

function Section({
  title,
  action,
  children
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-moon-green/15 bg-white/86 p-4 shadow-soft lg:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-moon-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Overview({
  stats,
  campaigns,
  templates,
  busy,
  onSync,
  onRefresh
}: {
  stats: Record<string, number>;
  campaigns: Campaign[];
  templates: MessageTemplate[];
  busy: string;
  onSync: () => void;
  onRefresh: () => void;
}) {
  const statCards = [
    { label: "Contacts", value: stats.contacts, icon: UsersRound, color: "#414C2F" },
    { label: "Lists", value: stats.lists, icon: ClipboardList, color: "#7F6F34" },
    { label: "Templates", value: stats.templates, icon: MessageSquareText, color: "#BB5524" },
    { label: "Accepted", value: stats.accepted, icon: CheckCircle2, color: "#BA401D" }
  ];

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="rounded-lg border border-moon-green/12 bg-white/88 p-4 shadow-soft"
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-lg text-white"
                style={{ backgroundColor: card.color }}
              >
                <Icon className="h-5 w-5" />
              </div>
              <p className="mt-4 text-3xl font-semibold text-moon-ink">{card.value}</p>
              <p className="mt-1 text-sm text-moon-ink/58">{card.label}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_0.86fr]">
        <Section
          title="Recent Campaigns"
          action={
            <button onClick={onRefresh} className="icon-button">
              <RefreshCw className="h-4 w-4" />
            </button>
          }
        >
          <CampaignTable campaigns={campaigns.slice(0, 6)} />
        </Section>

        <Section
          title="Templates"
          action={
            <button onClick={onSync} disabled={busy === "sync"} className="primary-button">
              {busy === "sync" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Sync
            </button>
          }
        >
          <div className="grid gap-3">
            {templates.slice(0, 4).map((template) => (
              <div
                key={`${template.name}-${template.language}`}
                className="rounded-lg border border-moon-green/12 bg-moon-paper p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-moon-ink">{template.name}</p>
                  <span className="rounded-md bg-moon-green px-2 py-1 text-xs text-moon-paper">
                    {template.status || "LOCAL"}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-moon-ink/62">
                  {template.body || "No body stored"}
                </p>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </>
  );
}

function Campaigns(props: {
  contacts: Contact[];
  allContacts: Contact[];
  lists: ContactList[];
  selectedContactIds: Set<string>;
  setSelectedContactIds: (value: Set<string>) => void;
  selectedListIds: Set<string>;
  setSelectedListIds: (value: Set<string>) => void;
  templates: MessageTemplate[];
  selectedTemplateName: string;
  setSelectedTemplateName: (value: string) => void;
  selectedTemplate: MessageTemplate;
  campaignName: string;
  setCampaignName: (value: string) => void;
  parameterValues: Record<string, string>;
  setParameterValues: (value: Record<string, string>) => void;
  search: string;
  setSearch: (value: string) => void;
  recipientCount: number;
  busy: string;
  onSend: () => void;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
      <Section title="Campaign Builder">
        <div className="grid gap-4">
          <label className="field-label">
            Campaign name
            <input
              value={props.campaignName}
              onChange={(event) => props.setCampaignName(event.target.value)}
              className="field"
            />
          </label>

          <label className="field-label">
            Template
            <select
              value={props.selectedTemplateName}
              onChange={(event) => props.setSelectedTemplateName(event.target.value)}
              className="field"
            >
              {props.templates.map((template) => (
                <option key={`${template.name}-${template.language}`} value={template.name}>
                  {template.name} ({template.language})
                </option>
              ))}
            </select>
          </label>

          <div className="rounded-lg border border-moon-green/12 bg-moon-paper p-3 text-sm text-moon-ink/72">
            <p className="font-medium text-moon-ink">{props.selectedTemplate.name}</p>
            <p className="mt-2 whitespace-pre-line">{props.selectedTemplate.body}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {props.selectedTemplate.parameters.map((parameter) => (
              <label key={parameter.name} className="field-label">
                {parameter.name}
                <input
                  value={props.parameterValues[parameter.name] || ""}
                  placeholder={parameter.example || parameter.name}
                  onChange={(event) =>
                    props.setParameterValues({
                      ...props.parameterValues,
                      [parameter.name]: event.target.value
                    })
                  }
                  className="field"
                />
              </label>
            ))}
          </div>

          <button
            onClick={props.onSend}
            disabled={props.busy === "send" || props.recipientCount === 0}
            className="primary-button justify-center"
          >
            {props.busy === "send" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send to {props.recipientCount}
          </button>
        </div>
      </Section>

      <Section title="Recipients">
        <div className="grid gap-4">
          <div className="grid gap-2">
            <p className="text-sm font-medium text-moon-ink">Lists</p>
            <div className="flex flex-wrap gap-2">
              {props.lists.map((list) => {
                const selected = props.selectedListIds.has(list._id);
                return (
                  <button
                    key={list._id}
                    onClick={() => {
                      const next = new Set(props.selectedListIds);
                      selected ? next.delete(list._id) : next.add(list._id);
                      props.setSelectedListIds(next);
                    }}
                    className={`rounded-md border px-3 py-2 text-sm font-medium ${
                      selected
                        ? "border-moon-green bg-moon-green text-moon-paper"
                        : "border-moon-green/18 bg-white text-moon-ink"
                    }`}
                  >
                    {list.name} ({list.memberCount || 0})
                  </button>
                );
              })}
            </div>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-moon-ink/42" />
            <input
              value={props.search}
              onChange={(event) => props.setSearch(event.target.value)}
              placeholder="Search contacts"
              className="field pl-10"
            />
          </div>

          <div className="max-h-[420px] overflow-auto rounded-lg border border-moon-green/12 moon-scrollbar">
            {props.contacts.map((contact) => {
              const selected = props.selectedContactIds.has(contact._id);
              return (
                <label
                  key={contact._id}
                  className="flex items-center gap-3 border-b border-moon-green/10 px-3 py-3 last:border-0"
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => {
                      const next = new Set(props.selectedContactIds);
                      selected ? next.delete(contact._id) : next.add(contact._id);
                      props.setSelectedContactIds(next);
                    }}
                    className="h-4 w-4 accent-moon-red"
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-moon-ink">
                      {contact.name}
                    </span>
                    <span className="block truncate text-sm text-moon-ink/58">
                      +{contact.phone} {contact.source ? `- ${contact.source}` : ""}
                    </span>
                  </span>
                </label>
              );
            })}
            {!props.contacts.length ? (
              <p className="p-4 text-sm text-moon-ink/58">No matching contacts</p>
            ) : null}
          </div>
        </div>
      </Section>
    </div>
  );
}

function InboxPanel({
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
    <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
      <Section
        title="Conversation Feed"
        action={
          <button onClick={onRefresh} disabled={busy === "messages"} className="secondary-button">
            <RefreshCw className={`h-4 w-4 ${busy === "messages" ? "animate-spin" : ""}`} />
            Refresh
          </button>
        }
      >
        <div className="max-h-[620px] overflow-auto rounded-lg border border-moon-green/12 moon-scrollbar">
          {messages.map((message) => {
            const inbound = message.direction === "inbound";
            return (
              <div
                key={message._id}
                className="border-b border-moon-green/10 p-4 last:border-0"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-moon-ink">
                      {message.contactName ||
                        (inbound ? `+${message.from}` : `+${message.to}`)}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-[0.14em] text-moon-ink/45">
                      {inbound ? "Inbound" : "Outbound"} · {message.type || "message"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {message.lastStatus ? (
                      <span className="rounded-md bg-moon-green px-2 py-1 text-xs text-moon-paper">
                        {message.lastStatus}
                      </span>
                    ) : null}
                    <span className="text-xs text-moon-ink/50">
                      {formatDistanceToNow(new Date(message.createdAt))} ago
                    </span>
                  </div>
                </div>
                <p
                  className={`mt-3 rounded-lg px-3 py-2 text-sm leading-6 ${
                    inbound
                      ? "bg-moon-yellow/55 text-moon-ink"
                      : "bg-moon-green text-moon-paper"
                  }`}
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
            <div className="grid place-items-center p-10 text-center text-sm text-moon-ink/58">
              <Inbox className="mb-3 h-6 w-6" />
              Webhook messages will appear here after Meta sends events.
            </div>
          ) : null}
        </div>
      </Section>

      <div className="grid gap-5">
        <Section title="Status Events">
          <div className="max-h-[280px] overflow-auto rounded-lg border border-moon-green/12 moon-scrollbar">
            {statuses.map((status) => (
              <div
                key={status._id}
                className="border-b border-moon-green/10 px-3 py-3 text-sm last:border-0"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-moon-ink">{status.status}</span>
                  <span className="text-xs text-moon-ink/50">
                    {formatDistanceToNow(new Date(status.createdAt))} ago
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-moon-ink/55">
                  {status.messageId}
                </p>
              </div>
            ))}
            {!statuses.length ? (
              <p className="p-4 text-sm text-moon-ink/58">No delivery events yet</p>
            ) : null}
          </div>
        </Section>

        <Section title="Webhook Audit">
          <div className="max-h-[280px] overflow-auto rounded-lg bg-moon-ink p-3 moon-scrollbar">
            {events.map((event) => (
              <details key={event._id} className="border-b border-white/10 py-2 last:border-0">
                <summary className="cursor-pointer text-xs font-medium text-moon-cream">
                  {event.object || "event"} · {formatDistanceToNow(new Date(event.createdAt))} ago
                </summary>
                <pre className="mt-2 whitespace-pre-wrap text-[11px] leading-5 text-moon-cream/70">
                  {JSON.stringify(event.payload, null, 2)}
                </pre>
              </details>
            ))}
            {!events.length ? (
              <p className="text-sm text-moon-cream/70">No webhook calls stored yet</p>
            ) : null}
          </div>
        </Section>
      </div>
    </div>
  );
}

function Contacts(props: {
  contacts: Contact[];
  lists: ContactList[];
  search: string;
  setSearch: (value: string) => void;
  busy: string;
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[0.68fr_1.32fr]">
      <Section title="Add Contact">
        <form onSubmit={props.onCreate} className="grid gap-3">
          <label className="field-label">
            Name
            <input name="name" required placeholder="Namballa Ravikiran" className="field" />
          </label>
          <label className="field-label">
            WhatsApp number
            <input name="phone" required placeholder="919381167516" className="field" />
          </label>
          <label className="field-label">
            List
            <select name="listIds" className="field" defaultValue="">
              <option value="">No list yet</option>
              {props.lists.map((list) => (
                <option key={list._id} value={list._id}>
                  {list.name}
                </option>
              ))}
            </select>
          </label>
          <details className="rounded-lg border border-moon-green/12 bg-moon-paper p-3">
            <summary className="cursor-pointer text-sm font-medium text-moon-green">
              Optional details
            </summary>
            <div className="mt-3 grid gap-3">
              <label className="field-label">
                Source
                <input name="source" placeholder="Walk-in, Instagram, event" className="field" />
              </label>
              <label className="field-label">
                Tags
                <input name="tags" placeholder="friday, vip, regular" className="field" />
              </label>
              <label className="field-label">
                Notes
                <textarea name="notes" placeholder="Optional note" className="field min-h-20" />
              </label>
            </div>
          </details>
          <button disabled={props.busy === "contact"} className="primary-button justify-center">
            {props.busy === "contact" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Save contact
          </button>
        </form>
      </Section>

      <Section title="Contacts">
        <div className="mb-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-moon-ink/42" />
            <input
              value={props.search}
              onChange={(event) => props.setSearch(event.target.value)}
              placeholder="Search by name, tag, or phone"
              className="field pl-10"
            />
          </div>
        </div>
        <div className="overflow-auto rounded-lg border border-moon-green/12 moon-scrollbar">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-moon-green text-moon-paper">
              <tr>
                <th className="px-3 py-3 font-medium">Name</th>
                <th className="px-3 py-3 font-medium">Phone</th>
                <th className="px-3 py-3 font-medium">Tags</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {props.contacts.map((contact) => (
                <tr key={contact._id} className="border-b border-moon-green/10">
                  <td className="px-3 py-3 font-medium text-moon-ink">{contact.name}</td>
                  <td className="px-3 py-3 text-moon-ink/65">+{contact.phone}</td>
                  <td className="px-3 py-3 text-moon-ink/65">{contact.tags.join(", ")}</td>
                  <td className="px-3 py-3 text-moon-ink/65">{contact.consentStatus}</td>
                  <td className="px-3 py-3 text-right">
                    <button
                      onClick={() => props.onDelete(contact._id)}
                      className="icon-button text-moon-red"
                      title="Delete contact"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!props.contacts.length ? (
            <p className="p-4 text-sm text-moon-ink/58">No contacts yet</p>
          ) : null}
        </div>
      </Section>
    </div>
  );
}

function Lists({
  lists,
  busy,
  onCreate
}: {
  lists: ContactList[];
  busy: string;
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[0.7fr_1.3fr]">
      <Section title="New List">
        <form onSubmit={onCreate} className="grid gap-3">
          <input name="name" required placeholder="Friday regulars" className="field" />
          <textarea name="description" placeholder="Audience note" className="field min-h-24" />
          <div className="grid grid-cols-5 gap-2">
            {palette.map((color) => (
              <label key={color} className="cursor-pointer">
                <input type="radio" name="color" value={color} className="sr-only" />
                <span
                  className="block h-10 rounded-lg border border-moon-green/15"
                  style={{ backgroundColor: color }}
                />
              </label>
            ))}
          </div>
          <button disabled={busy === "list"} className="primary-button justify-center">
            <Plus className="h-4 w-4" />
            Create list
          </button>
        </form>
      </Section>

      <Section title="Contact Lists">
        <div className="grid gap-3 sm:grid-cols-2">
          {lists.map((list) => (
            <div key={list._id} className="rounded-lg border border-moon-green/12 bg-moon-paper p-4">
              <div
                className="mb-4 h-2 rounded-full"
                style={{ backgroundColor: list.color }}
              />
              <h3 className="font-semibold text-moon-ink">{list.name}</h3>
              <p className="mt-2 text-sm text-moon-ink/62">{list.description || "No note"}</p>
              <p className="mt-4 text-sm font-medium text-moon-red">
                {list.memberCount || 0} contacts
              </p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Templates({
  templates,
  busy,
  onSync,
  onCreate
}: {
  templates: MessageTemplate[];
  busy: string;
  onSync: () => void;
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[0.78fr_1.22fr]">
      <Section
        title="Template Library"
        action={
          <button onClick={onSync} disabled={busy === "sync"} className="primary-button">
            <RefreshCw className={`h-4 w-4 ${busy === "sync" ? "animate-spin" : ""}`} />
            Sync Meta
          </button>
        }
      >
        <div className="grid gap-3">
          {templates.map((template) => (
            <div
              key={`${template.name}-${template.language}`}
              className="rounded-lg border border-moon-green/12 bg-moon-paper p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-semibold text-moon-ink">{template.name}</h3>
                <div className="flex gap-2 text-xs">
                  <span className="rounded-md bg-moon-green px-2 py-1 text-moon-paper">
                    {template.language}
                  </span>
                  <span className="rounded-md bg-moon-yellow px-2 py-1 text-moon-ink">
                    {template.status || "LOCAL"}
                  </span>
                </div>
              </div>
              <p className="mt-3 whitespace-pre-line text-sm text-moon-ink/65">
                {template.body}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {template.parameters.map((parameter) => (
                  <span
                    key={parameter.name}
                    className="inline-flex items-center gap-1 rounded-md border border-moon-green/15 px-2 py-1 text-xs text-moon-green"
                  >
                    <Tag className="h-3 w-3" />
                    {parameter.name}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Save Manual Template">
        <form onSubmit={onCreate} className="grid gap-3">
          <input name="name" required placeholder="template_name" className="field" />
          <input name="language" defaultValue="en_US" className="field" />
          <input name="category" defaultValue="UTILITY" className="field" />
          <textarea
            name="body"
            placeholder="Template body with {{parameter}} values"
            className="field min-h-32"
          />
          <input name="parameters" placeholder="djname, day, date, time" className="field" />
          <button disabled={busy === "template"} className="primary-button justify-center">
            <Plus className="h-4 w-4" />
            Save template
          </button>
        </form>
      </Section>
    </div>
  );
}

function Reports({ campaigns }: { campaigns: Campaign[] }) {
  return (
    <Section title="Campaign History">
      <CampaignTable campaigns={campaigns} />
    </Section>
  );
}

function CampaignTable({ campaigns }: { campaigns: Campaign[] }) {
  return (
    <div className="overflow-auto rounded-lg border border-moon-green/12 moon-scrollbar">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-moon-green text-moon-paper">
          <tr>
            <th className="px-3 py-3 font-medium">Campaign</th>
            <th className="px-3 py-3 font-medium">Template</th>
            <th className="px-3 py-3 font-medium">Accepted</th>
            <th className="px-3 py-3 font-medium">Failed</th>
            <th className="px-3 py-3 font-medium">Sent</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((campaign) => (
            <tr key={campaign._id} className="border-b border-moon-green/10">
              <td className="px-3 py-3 font-medium text-moon-ink">{campaign.name}</td>
              <td className="px-3 py-3 text-moon-ink/65">{campaign.templateName}</td>
              <td className="px-3 py-3 text-moon-green">{campaign.acceptedCount}</td>
              <td className="px-3 py-3 text-moon-red">{campaign.failedCount}</td>
              <td className="px-3 py-3 text-moon-ink/65">
                {campaign.sentAt
                  ? `${formatDistanceToNow(new Date(campaign.sentAt))} ago`
                  : campaign.status}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!campaigns.length ? (
        <div className="grid place-items-center p-8 text-sm text-moon-ink/58">
          <History className="mb-2 h-5 w-5" />
          No campaigns sent yet
        </div>
      ) : null}
    </div>
  );
}

function SettingsPanel({
  diagnostics,
  busy,
  onLoad
}: {
  diagnostics: Record<string, unknown> | null;
  busy: string;
  onLoad: () => void;
}) {
  return (
    <Section
      title="Meta Diagnostics"
      action={
        <button onClick={onLoad} disabled={busy === "diagnostics"} className="primary-button">
          {busy === "diagnostics" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Database className="h-4 w-4" />
          )}
          Check
        </button>
      }
    >
      <pre className="max-h-[560px] overflow-auto rounded-lg bg-moon-ink p-4 text-xs leading-6 text-moon-cream moon-scrollbar">
        {diagnostics ? JSON.stringify(diagnostics, null, 2) : "No diagnostics loaded"}
      </pre>
    </Section>
  );
}
