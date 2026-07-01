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
  UsersRound,
  X
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type {
  AdminUser,
  Campaign,
  Contact,
  ContactList,
  ContactTemplateField,
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

type CampaignProgress = {
  campaignId?: string;
  total: number;
  sent: number;
  acceptedCount: number;
  failedCount: number;
  currentName?: string;
  currentPhone?: string;
  currentStatus?: string;
  error?: string;
};

type CampaignBatchResult = {
  campaignId: string;
  total: number;
  sent: number;
  acceptedCount: number;
  failedCount: number;
  queuedCount: number;
  done: boolean;
  status: string;
  current?: {
    name?: string;
    phone?: string;
    status?: string;
    error?: string;
  };
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

export function DashboardClient({ user }: DashboardClientProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactTotal, setContactTotal] = useState(0);
  const [lists, setLists] = useState<ContactList[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [statuses, setStatuses] = useState<WhatsAppStatus[]>([]);
  const [webhookEvents, setWebhookEvents] = useState<WebhookEvent[]>([]);
  const [diagnostics, setDiagnostics] = useState<Record<string, unknown> | null>(null);
  const [selectedListId, setSelectedListId] = useState("");
  const [selectedListContacts, setSelectedListContacts] = useState<Contact[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [selectedListIds, setSelectedListIds] = useState<Set<string>>(new Set());
  const [selectedTemplateName, setSelectedTemplateName] = useState("event_details_reminder_1");
  const [campaignName, setCampaignName] = useState("Weekend event reminder");
  const [headerImageId, setHeaderImageId] = useState("");
  const [headerImageName, setHeaderImageName] = useState("");
  const [parameterValues, setParameterValues] = useState<Record<string, string>>({
    djname: "DJ Ravi",
    day: "Friday",
    date: "21st March",
    time: "06:30 PM"
  });
  const [contactFieldMappings, setContactFieldMappings] = useState<
    Record<string, ContactTemplateField>
  >({});
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [sendProgress, setSendProgress] = useState<CampaignProgress | null>(null);

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

  const campaignRecipientCount = useMemo(() => {
    const selectedLists = Array.from(selectedListIds);
    if (!selectedLists.length) return selectedContactIds.size;

    const listTotal = lists
      .filter((list) => selectedListIds.has(list._id))
      .reduce((sum, list) => sum + (list.memberCount || 0), 0);
    const extraSelectedContacts = contacts.filter(
      (contact) =>
        selectedContactIds.has(contact._id) &&
        !contact.listIds.some((listId) => selectedListIds.has(listId))
    ).length;

    return listTotal + extraSelectedContacts;
  }, [contacts, lists, selectedContactIds, selectedListIds]);

  const stats = useMemo(() => {
    const accepted = campaigns.reduce((sum, campaign) => sum + campaign.acceptedCount, 0);
    const failed = campaigns.reduce((sum, campaign) => sum + campaign.failedCount, 0);
    return {
      contacts: contactTotal,
      lists: lists.length,
      templates: templates.length || 1,
      campaigns: campaigns.length,
      accepted,
      failed
    };
  }, [campaigns, contactTotal, lists.length, templates.length]);

  async function refreshAll() {
    setBusy("loading");
    try {
      const [contactRes, listRes, templateRes, campaignRes] = await Promise.all([
        api<{ data: Contact[]; total: number }>("/api/contacts?limit=20000"),
        api<{ data: ContactList[] }>("/api/lists"),
        api<{ data: MessageTemplate[] }>("/api/templates"),
        api<{ data: Campaign[] }>("/api/campaigns")
      ]);
      setContacts(contactRes.data);
      setContactTotal(contactRes.total);
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

  async function fetchListContacts(listId: string) {
    const result = await api<{ data: Contact[] }>(
      `/api/contacts?listId=${encodeURIComponent(listId)}&limit=20000`
    );
    setSelectedListContacts(result.data);
  }

  useEffect(() => {
    refreshAll();
  }, []);

  useEffect(() => {
    const nextTemplate =
      templates.find((template) => template.name === selectedTemplateName) ??
      fallbackTemplate;
    setParameterValues((current) => {
      const nextValues = { ...current };
      for (const parameter of nextTemplate.parameters) {
        if (!nextValues[parameter.name]) {
          nextValues[parameter.name] = parameter.example || "";
        }
      }
      return nextValues;
    });
    setContactFieldMappings((current) => {
      const parameterNames = new Set(
        nextTemplate.parameters.map((parameter) => parameter.name)
      );
      const nextMappings = Object.fromEntries(
        Object.entries(current).filter(([name]) => parameterNames.has(name))
      ) as Record<string, ContactTemplateField>;
      if (parameterNames.has("name") && !nextMappings.name) {
        nextMappings.name = "name";
      }
      return nextMappings;
    });
  }, [selectedTemplateName, templates]);

  useEffect(() => {
    setHeaderImageId("");
    setHeaderImageName("");
  }, [selectedTemplateName]);

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
      setSearch(payload.name || payload.phone);
      await refreshAll();
      const targetListId = payload.listIds[0] || selectedListId;
      if (targetListId) {
        setSelectedListId(targetListId);
        await fetchListContacts(targetListId);
      }
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

  async function openList(listId: string) {
    setSelectedListId(listId);
    setBusy("list-detail");
    try {
      await fetchListContacts(listId);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not load list contacts");
    } finally {
      setBusy("");
    }
  }

  async function deleteList(id: string) {
    const list = lists.find((item) => item._id === id);
    const confirmed = window.confirm(
      `Delete ${list?.name || "this list"}? Contacts will stay saved, but this tag/list will be removed from them.`
    );
    if (!confirmed) return;

    setBusy(`delete-list-${id}`);
    try {
      await api(`/api/lists/${id}`, { method: "DELETE" });
      setSelectedListIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      if (selectedListId === id) {
        setSelectedListId("");
        setSelectedListContacts([]);
      }
      await refreshAll();
      setNotice("List deleted");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not delete list");
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
    if (!campaignRecipientCount) {
      setNotice("Select at least one contact or list");
      return;
    }

    if (selectedTemplate.headerFormat === "IMAGE" && !headerImageId) {
      setNotice("Upload a header image before sending this template");
      return;
    }

    setBusy("send");
    setSendProgress({
      total: campaignRecipientCount,
      sent: 0,
      acceptedCount: 0,
      failedCount: 0
    });
    try {
      const basePayload = {
        name: campaignName,
        templateName: selectedTemplate.name,
        language: selectedTemplate.language,
        parameters: parameterValues,
        parameterOrder: selectedTemplate.parameters.map((parameter) => parameter.name),
        contactFieldMappings,
        headerImageId,
        listIds: Array.from(selectedListIds),
        contactIds: Array.from(selectedContactIds),
        batchSize: 25
      };

      let campaignId = "";
      let finalProgress: CampaignProgress | null = null;

      while (true) {
        const result = await api<CampaignBatchResult>("/api/campaigns/send", {
          method: "POST",
          body: JSON.stringify({
            ...basePayload,
            ...(campaignId ? { campaignId } : {})
          })
        });

        campaignId = result.campaignId;
        finalProgress = {
          campaignId: result.campaignId,
          total: result.total || campaignRecipientCount,
          sent: result.sent,
          acceptedCount: result.acceptedCount,
          failedCount: result.failedCount,
          currentName: result.current?.name,
          currentPhone: result.current?.phone,
          currentStatus: result.current?.status,
          error: result.current?.error
        };
        setSendProgress(finalProgress);

        if (result.done) break;
      }

      await refreshAll();
      setNotice(
        `${finalProgress?.acceptedCount || 0} accepted, ${finalProgress?.failedCount || 0} failed by WhatsApp`
      );
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Campaign failed");
    } finally {
      setBusy("");
      setTimeout(() => setSendProgress(null), 3500);
    }
  }

  async function resumeCampaign(campaign: Campaign) {
    const queuedCount = campaign.recipients.filter(
      (recipient) => recipient.status === "queued"
    ).length;
    if (!queuedCount) {
      setNotice("This campaign has no queued recipients left");
      return;
    }

    setBusy(`resume-${campaign._id}`);
    setSendProgress({
      campaignId: campaign._id,
      total: campaign.recipients.length,
      sent: campaign.recipients.length - queuedCount,
      acceptedCount: campaign.acceptedCount,
      failedCount: campaign.failedCount
    });

    try {
      let finalProgress: CampaignProgress | null = null;

      while (true) {
        const result = await api<CampaignBatchResult>("/api/campaigns/send", {
          method: "POST",
          body: JSON.stringify({
            campaignId: campaign._id,
            name: campaign.name,
            templateName: campaign.templateName,
            language: campaign.language,
            parameters: campaign.parameters || {},
            parameterOrder: campaign.parameterOrder || [],
            contactFieldMappings: campaign.contactFieldMappings || {},
            headerImageId: campaign.headerImageId,
            batchSize: 25
          })
        });

        finalProgress = {
          campaignId: result.campaignId,
          total: result.total,
          sent: result.sent,
          acceptedCount: result.acceptedCount,
          failedCount: result.failedCount,
          currentName: result.current?.name,
          currentPhone: result.current?.phone,
          currentStatus: result.current?.status,
          error: result.current?.error
        };
        setSendProgress(finalProgress);
        setNotice(
          `Resuming campaign: ${result.sent}/${result.total} processed, ${result.queuedCount} queued`
        );
        setCampaigns((current) =>
          current.map((item) =>
            item._id === campaign._id
              ? {
                  ...item,
                  acceptedCount: result.acceptedCount,
                  failedCount: result.failedCount,
                  status: result.status as Campaign["status"],
                  recipients: item.recipients.map((recipient, index) => {
                    if (index < result.acceptedCount) return { ...recipient, status: "accepted" };
                    if (index < result.acceptedCount + result.failedCount) {
                      return { ...recipient, status: "failed" };
                    }
                    return { ...recipient, status: "queued" };
                  })
                }
              : item
          )
        );

        if (result.done) break;
      }

      await refreshAll();
      setNotice(
        `Resume complete: ${finalProgress?.acceptedCount || 0} accepted, ${finalProgress?.failedCount || 0} failed by WhatsApp`
      );
    } catch (err) {
      await refreshAll();
      setNotice(err instanceof Error ? err.message : "Could not resume campaign");
    } finally {
      setBusy("");
      setTimeout(() => setSendProgress(null), 3500);
    }
  }

  async function uploadHeaderImage(file: File) {
    setBusy("media");
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/media/upload", {
        method: "POST",
        body: formData
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(
          body.error?.message ||
            body.error?.error?.message ||
            body.error ||
            "Could not upload image"
        );
      }
      setHeaderImageId(body.id);
      setHeaderImageName(body.filename || file.name);
      setNotice("Header image uploaded");
    } catch (err) {
      setHeaderImageId("");
      setHeaderImageName("");
      setNotice(err instanceof Error ? err.message : "Could not upload image");
    } finally {
      setBusy("");
    }
  }

  async function deleteContact(id: string) {
    setBusy(`delete-${id}`);
    try {
      await api(`/api/contacts/${id}`, { method: "DELETE" });
      await refreshAll();
      if (selectedListId) {
        await fetchListContacts(selectedListId);
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not delete contact");
    } finally {
      setBusy("");
    }
  }

  async function removeContactTag(contact: Contact, tag: string) {
    setBusy(`tag-${contact._id}-${tag}`);
    try {
      await api(`/api/contacts/${contact._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          tags: contact.tags.filter((item) => item !== tag)
        })
      });
      setContacts((current) =>
        current.map((item) =>
          item._id === contact._id
            ? { ...item, tags: item.tags.filter((tagName) => tagName !== tag) }
            : item
        )
      );
      setSelectedListContacts((current) =>
        current.map((item) =>
          item._id === contact._id
            ? { ...item, tags: item.tags.filter((tagName) => tagName !== tag) }
            : item
        )
      );
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not remove tag");
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
              onResume={resumeCampaign}
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
              contactFieldMappings={contactFieldMappings}
              setContactFieldMappings={setContactFieldMappings}
              search={search}
              setSearch={setSearch}
              recipientCount={campaignRecipientCount}
              headerImageId={headerImageId}
              headerImageName={headerImageName}
              busy={busy}
              progress={sendProgress}
              onUploadHeaderImage={uploadHeaderImage}
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
              onRemoveTag={removeContactTag}
            />
          ) : null}

          {activeTab === "lists" ? (
            <Lists
              lists={lists}
              selectedListId={selectedListId}
              selectedListContacts={selectedListContacts}
              busy={busy}
              onCreate={createList}
              onSelect={openList}
              onDelete={deleteList}
            />
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
            <Reports campaigns={campaigns} busy={busy} onResume={resumeCampaign} />
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
  onRefresh,
  onResume
}: {
  stats: Record<string, number>;
  campaigns: Campaign[];
  templates: MessageTemplate[];
  busy: string;
  onSync: () => void;
  onRefresh: () => void;
  onResume: (campaign: Campaign) => void;
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
          <CampaignTable
            campaigns={campaigns.slice(0, 6)}
            busy={busy}
            onResume={onResume}
          />
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
  contactFieldMappings: Record<string, ContactTemplateField>;
  setContactFieldMappings: (value: Record<string, ContactTemplateField>) => void;
  search: string;
  setSearch: (value: string) => void;
  recipientCount: number;
  headerImageId: string;
  headerImageName: string;
  busy: string;
  progress: CampaignProgress | null;
  onUploadHeaderImage: (file: File) => void;
  onSend: () => void;
}) {
  const percent = props.progress?.total
    ? Math.round((props.progress.sent / props.progress.total) * 100)
    : 0;

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
            {props.selectedTemplate.headerFormat === "IMAGE" ? (
              <p className="mt-3 rounded-md bg-moon-yellow/60 px-3 py-2 text-xs font-medium text-moon-ink">
                Image header required
              </p>
            ) : null}
          </div>

          {props.selectedTemplate.headerFormat === "IMAGE" ? (
            <label className="field-label">
              Header image
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="field"
                disabled={props.busy === "media"}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) props.onUploadHeaderImage(file);
                }}
              />
              {props.headerImageId ? (
                <span className="text-xs font-medium text-moon-green">
                  Uploaded: {props.headerImageName || props.headerImageId}
                </span>
              ) : null}
            </label>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            {props.selectedTemplate.parameters.map((parameter) => {
              const mappedField = props.contactFieldMappings[parameter.name];

              return (
                <div
                  key={parameter.name}
                  className="grid gap-2 rounded-lg border border-moon-green/12 bg-white/70 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-moon-ink">
                      {parameter.name}
                    </span>
                    <select
                      value={mappedField || ""}
                      onChange={(event) => {
                        const nextMappings = { ...props.contactFieldMappings };
                        const value = event.target.value as ContactTemplateField | "";
                        if (value) {
                          nextMappings[parameter.name] = value;
                        } else {
                          delete nextMappings[parameter.name];
                        }
                        props.setContactFieldMappings(nextMappings);
                      }}
                      className="field w-auto min-w-36 py-2"
                    >
                      <option value="">Custom text</option>
                      <option value="name">Contact name</option>
                    </select>
                  </div>
                  <input
                    value={
                      mappedField === "name"
                        ? "Contact name"
                        : props.parameterValues[parameter.name] || ""
                    }
                    placeholder={parameter.example || parameter.name}
                    disabled={Boolean(mappedField)}
                    onChange={(event) =>
                      props.setParameterValues({
                        ...props.parameterValues,
                        [parameter.name]: event.target.value
                      })
                    }
                    className="field disabled:bg-moon-cream disabled:text-moon-ink/58"
                  />
                </div>
              );
            })}
          </div>

          <button
            onClick={props.onSend}
            disabled={
              props.busy === "send" ||
              props.busy === "media" ||
              props.recipientCount === 0 ||
              (props.selectedTemplate.headerFormat === "IMAGE" && !props.headerImageId)
            }
            className="primary-button justify-center"
          >
            {props.busy === "send" || props.busy === "media" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send to {props.recipientCount}
          </button>

          {props.progress ? (
            <div className="rounded-lg border border-moon-green/12 bg-moon-paper p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium text-moon-ink">
                  Sending {props.progress.sent} of {props.progress.total}
                </span>
                <span className="font-semibold text-moon-red">{percent}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-white ring-1 ring-moon-green/12">
                <div
                  className="h-full rounded-full bg-moon-red transition-all duration-300"
                  style={{ width: `${Math.min(percent, 100)}%` }}
                />
              </div>
              <div className="mt-3 grid gap-2 text-xs text-moon-ink/62 sm:grid-cols-3">
                <span>
                  Accepted: <strong className="text-moon-green">{props.progress.acceptedCount}</strong>
                </span>
                <span>
                  Failed: <strong className="text-moon-red">{props.progress.failedCount}</strong>
                </span>
                <span>
                  Remaining: {Math.max(props.progress.total - props.progress.sent, 0)}
                </span>
              </div>
              {props.progress.currentName || props.progress.currentPhone ? (
                <p className="mt-2 truncate text-xs text-moon-ink/58">
                  Last: {props.progress.currentName || props.progress.currentPhone}
                  {props.progress.currentStatus ? ` - ${props.progress.currentStatus}` : ""}
                </p>
              ) : null}
              {props.progress.error ? (
                <p className="mt-2 line-clamp-2 text-xs text-moon-red">
                  {props.progress.error}
                </p>
              ) : null}
            </div>
          ) : null}
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
  onRemoveTag: (contact: Contact, tag: string) => void;
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
                  <td className="px-3 py-3 text-moon-ink/65">
                    <div className="flex flex-wrap gap-1.5">
                      {contact.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 rounded-md border border-moon-green/15 bg-moon-paper px-2 py-1 text-xs font-medium text-moon-ink"
                        >
                          {tag}
                          <button
                            type="button"
                            onClick={() => props.onRemoveTag(contact, tag)}
                            className="text-moon-red transition hover:text-moon-ink"
                            title={`Remove ${tag}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                      {!contact.tags.length ? <span>-</span> : null}
                    </div>
                  </td>
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
  selectedListId,
  selectedListContacts,
  busy,
  onCreate,
  onSelect,
  onDelete
}: {
  lists: ContactList[];
  selectedListId: string;
  selectedListContacts: Contact[];
  busy: string;
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const selectedList = lists.find((list) => list._id === selectedListId);

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
            <div
              key={list._id}
              className={`relative rounded-lg border bg-moon-paper p-4 transition hover:-translate-y-0.5 hover:border-moon-red/45 hover:shadow-soft ${
                selectedListId === list._id
                  ? "border-moon-red/55 ring-2 ring-moon-red/10"
                  : "border-moon-green/12"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(list._id)}
                className="block w-full text-left"
              >
                <div
                  className="mb-4 h-2 rounded-full"
                  style={{ backgroundColor: list.color }}
                />
                <h3 className="pr-10 font-semibold text-moon-ink">{list.name}</h3>
                <p className="mt-2 min-h-10 text-sm text-moon-ink/62">
                  {list.description || "No note"}
                </p>
                <p className="mt-4 text-sm font-medium text-moon-red">
                  {list.memberCount || 0} contacts
                </p>
              </button>
              <button
                type="button"
                onClick={() => onDelete(list._id)}
                disabled={busy === `delete-list-${list._id}`}
                className="icon-button absolute right-3 top-3 text-moon-red"
                title="Delete list"
              >
                {busy === `delete-list-${list._id}` ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>
            </div>
          ))}
          {!lists.length ? (
            <p className="rounded-lg border border-moon-green/12 bg-moon-paper p-4 text-sm text-moon-ink/58">
              No lists yet
            </p>
          ) : null}
        </div>

        {selectedList ? (
          <div className="mt-5 rounded-lg border border-moon-green/12 bg-white/80">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-moon-green/10 p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-moon-ink/45">
                  Selected list
                </p>
                <h3 className="mt-1 text-lg font-semibold text-moon-ink">
                  {selectedList.name}
                </h3>
              </div>
              <span className="rounded-md bg-moon-green px-3 py-1 text-sm font-medium text-moon-paper">
                {selectedListContacts.length} loaded
              </span>
            </div>
            {busy === "list-detail" ? (
              <div className="flex items-center gap-2 p-4 text-sm text-moon-ink/62">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading contacts
              </div>
            ) : (
              <div className="max-h-[420px] overflow-auto moon-scrollbar">
                <table className="min-w-full text-left text-sm">
                  <thead className="sticky top-0 bg-moon-green text-moon-paper">
                    <tr>
                      <th className="px-3 py-3 font-medium">Name</th>
                      <th className="px-3 py-3 font-medium">Phone</th>
                      <th className="px-3 py-3 font-medium">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedListContacts.map((contact) => (
                      <tr key={contact._id} className="border-b border-moon-green/10 last:border-0">
                        <td className="px-3 py-3 font-medium text-moon-ink">{contact.name}</td>
                        <td className="px-3 py-3 text-moon-ink/65">+{contact.phone}</td>
                        <td className="px-3 py-3 text-moon-ink/65">{contact.source || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!selectedListContacts.length ? (
                  <p className="p-4 text-sm text-moon-ink/58">No contacts in this list</p>
                ) : null}
              </div>
            )}
          </div>
        ) : (
          <p className="mt-5 rounded-lg border border-moon-green/12 bg-moon-paper p-4 text-sm text-moon-ink/58">
            Select a list to view its contacts.
          </p>
        )}
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

function Reports({
  campaigns,
  busy,
  onResume
}: {
  campaigns: Campaign[];
  busy: string;
  onResume: (campaign: Campaign) => void;
}) {
  return (
    <Section title="Campaign History">
      <CampaignTable campaigns={campaigns} busy={busy} onResume={onResume} />
    </Section>
  );
}

function CampaignTable({
  campaigns,
  busy,
  onResume
}: {
  campaigns: Campaign[];
  busy: string;
  onResume: (campaign: Campaign) => void;
}) {
  return (
    <div className="overflow-auto rounded-lg border border-moon-green/12 moon-scrollbar">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-moon-green text-moon-paper">
          <tr>
            <th className="px-3 py-3 font-medium">Campaign</th>
            <th className="px-3 py-3 font-medium">Template</th>
            <th className="px-3 py-3 font-medium">Accepted</th>
            <th className="px-3 py-3 font-medium">Failed</th>
            <th className="px-3 py-3 font-medium">Queued</th>
            <th className="px-3 py-3 font-medium">Sent</th>
            <th className="px-3 py-3 font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((campaign) => {
            const queuedCount = campaign.recipients.filter(
              (recipient) => recipient.status === "queued"
            ).length;
            const canResume = queuedCount > 0;
            const isResuming = busy === `resume-${campaign._id}`;

            return (
              <tr
                key={campaign._id}
                className={`border-b border-moon-green/10 ${
                  canResume ? "bg-moon-yellow/25" : ""
                }`}
              >
                <td className="px-3 py-3 font-medium text-moon-ink">
                  <span>{campaign.name}</span>
                  {canResume ? (
                    <span className="mt-1 block rounded-md bg-moon-red px-2 py-1 text-xs font-semibold text-white">
                      Interrupted - {queuedCount} queued
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-3 text-moon-ink/65">{campaign.templateName}</td>
                <td className="px-3 py-3 text-moon-green">{campaign.acceptedCount}</td>
                <td className="px-3 py-3 text-moon-red">{campaign.failedCount}</td>
                <td className="px-3 py-3 font-medium text-moon-ink">{queuedCount}</td>
                <td className="px-3 py-3 text-moon-ink/65">
                  {campaign.sentAt
                    ? `${formatDistanceToNow(new Date(campaign.sentAt))} ago`
                    : campaign.status}
                </td>
                <td className="px-3 py-3">
                  {canResume ? (
                    <button
                      type="button"
                      onClick={() => onResume(campaign)}
                      disabled={isResuming || busy === "send"}
                      className="primary-button whitespace-nowrap px-3 py-2 text-xs"
                    >
                      {isResuming ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      Resume queued
                    </button>
                  ) : (
                    <span className="text-xs text-moon-ink/45">Done</span>
                  )}
                </td>
              </tr>
            );
          })}
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
