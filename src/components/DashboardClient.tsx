"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type {
  AdminUser,
  Campaign,
  Contact,
  ContactList,
  ContactTemplateField,
  MessageTemplate,
  TemplateBuilderPayload
} from "@/types/entities";

import {
  ensureNotificationAudioReady,
  isNotificationSoundEnabled,
  playNotificationSound,
  setNotificationSoundEnabled
} from "@/lib/notificationSound";
import { DashboardShell } from "./dashboard/DashboardShell";
import { Overview } from "./dashboard/Overview";
import { Inbox } from "./dashboard/Inbox";
import { Campaigns } from "./dashboard/Campaigns";
import { Contacts } from "./dashboard/Contacts";
import { Lists } from "./dashboard/Lists";
import { Templates } from "./dashboard/Templates";
import { Reports } from "./dashboard/Reports";
import { Settings } from "./dashboard/Settings";
import {
  csvToArray,
  fallbackTemplate,
  getCampaignDeliveryStats,
  palette,
  type CampaignBatchResult,
  type CampaignProgress,
  type DashboardNotification,
  type TabKey,
  type WebhookEvent,
  type WhatsAppMessage,
  type WhatsAppStatus
} from "./dashboard/types";

type DashboardClientProps = {
  user: AdminUser;
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
  const [scheduledAt, setScheduledAt] = useState("");
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
  const [sendProgress, setSendProgress] = useState<CampaignProgress | null>(null);
  const [cancelSendRequested, setCancelSendRequested] = useState(false);
  const sendCampaignInFlightRef = useRef(false);
  const scheduleCampaignInFlightRef = useRef(false);
  const cancelSendRequestedRef = useRef(false);

  const [notifications, setNotifications] = useState<DashboardNotification[]>([]);
  const [lastSeenAt, setLastSeenAt] = useState(0);
  const [inboxFocusPhone, setInboxFocusPhone] = useState("");
  const [notificationSoundEnabled, setNotificationSoundEnabledState] = useState(true);
  const messageStatusRef = useRef<Map<string, string>>(new Map());
  const notifSeededRef = useRef(false);
  const templateStatusRef = useRef<Map<string, string>>(new Map());
  const templatesSeededRef = useRef(false);
  const webhookSeededRef = useRef(false);
  const webhookSeenRef = useRef<Set<string>>(new Set());

  const unreadCount = notifications.filter(
    (item) => new Date(item.createdAt).getTime() > lastSeenAt
  ).length;

  function pushNotifications(items: DashboardNotification[]) {
    if (!items.length) return;
    setNotifications((current) => {
      const existing = new Set(current.map((item) => item.id));
      const fresh = items.filter((item) => !existing.has(item.id));
      if (!fresh.length) return current;
      void playNotificationSound();
      for (const item of fresh) {
        if (item.kind === "inbound") toast(item.title, { description: item.description });
        else if (item.kind === "template") toast.success(item.title);
        else if (item.kind === "failed") toast.error(item.title, { description: item.description });
        else if (item.kind === "info") toast(item.title, { description: item.description });
      }
      return [...fresh, ...current].slice(0, 50);
    });
  }

  function dismissNotification(id: string) {
    setNotifications((current) => current.filter((item) => item.id !== id));
  }

  function updateNotificationSoundEnabled(enabled: boolean) {
    setNotificationSoundEnabled(enabled);
    setNotificationSoundEnabledState(enabled);
  }

  function markNotificationsRead() {
    const now = Date.now();
    setLastSeenAt(now);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("moonbar:notif-seen", String(now));
    }
  }

  function handleNotificationClick(notification: DashboardNotification) {
    if (notification.tab) setActiveTab(notification.tab);
    else if (notification.phone) setActiveTab("inbox");
    if (notification.phone) {
      setInboxFocusPhone(notification.phone.replace(/[^\d]/g, ""));
    }
    markNotificationsRead();
  }

  // Toast-based notifier (replaces the old inline notice banner).
  const setNotice = (message: string) => {
    if (message) toast(message);
  };

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
    let delivered = 0;
    let failed = 0;
    for (const campaign of campaigns) {
      const campaignStats = getCampaignDeliveryStats(campaign);
      delivered += campaignStats.delivered;
      failed += campaignStats.failed;
    }
    return {
      contacts: contactTotal,
      lists: lists.length,
      templates: templates.length || 1,
      campaigns: campaigns.length,
      delivered,
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

  async function sendInboxMessage({
    to,
    text,
    contactName
  }: {
    to: string;
    text: string;
    contactName?: string;
  }) {
    setBusy(`chat-send-${to}`);
    try {
      const result = await api<{
        ok: boolean;
        error?: string;
        message?: WhatsAppMessage;
      }>("/api/messages/send", {
        method: "POST",
        body: JSON.stringify({ to, text, contactName })
      });
      await refreshMessages();
      if (!result.ok) {
        setNotice(result.error || "Message could not be sent");
        return false;
      }
      return true;
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Message could not be sent");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function sendInboxTemplate(input: {
    to: string;
    templateName: string;
    language: string;
    parameters: Record<string, string>;
    parameterOrder: string[];
    parameterFormat?: "NAMED" | "POSITIONAL";
    headerImageId?: string;
    contactName?: string;
  }) {
    setBusy(`chat-send-${input.to}`);
    try {
      const result = await api<{ ok: boolean; error?: string }>(
        "/api/messages/send-template",
        { method: "POST", body: JSON.stringify(input) }
      );
      await refreshMessages();
      if (!result.ok) {
        toast.error(result.error || "Template could not be sent");
        return false;
      }
      toast.success("Template sent");
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Template could not be sent");
      return false;
    } finally {
      setBusy("");
    }
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

  // Load persisted notification "seen" marker.
  useEffect(() => {
    const saved =
      typeof window !== "undefined"
        ? window.localStorage.getItem("moonbar:notif-seen")
        : null;
    if (saved) setLastSeenAt(Number(saved) || 0);
    setNotificationSoundEnabledState(isNotificationSoundEnabled());
  }, []);

  // Unlock audio after the first user interaction (browser autoplay policy).
  useEffect(() => {
    const unlock = () => {
      void ensureNotificationAudioReady();
    };
    unlock();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    window.addEventListener("touchstart", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, []);

  // A campaign send/resume is streaming: drives the live delivery tracker and
  // a faster message poll.
  const liveTracking = !!sendProgress;

  // Background polling keeps notifications current even when the tab is hidden.
  useEffect(() => {
    const pollMessages = async () => {
      try {
        const res = await api<{
          messages: WhatsAppMessage[];
          statuses: WhatsAppStatus[];
          events: WebhookEvent[];
        }>("/api/messages");
        setMessages(res.messages);
        setStatuses(res.statuses);
        setWebhookEvents(res.events);
      } catch {
        // ignore transient poll errors
      }
    };
    const pollTemplates = async () => {
      try {
        const res = await api<{ data: MessageTemplate[] }>("/api/templates");
        setTemplates(res.data.length ? res.data : [fallbackTemplate]);
      } catch {
        // ignore
      }
    };
    const onVisible = () => {
      if (!document.hidden) {
        void pollMessages();
        void pollTemplates();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    void pollMessages();
    // Poll fast while the inbox is open or a campaign is actively sending, so
    // the live delivery tracker updates in near real time.
    const messageInterval = activeTab === "inbox" || liveTracking ? 3000 : 10000;
    const messageTimer = setInterval(pollMessages, messageInterval);
    const templateTimer = setInterval(pollTemplates, 30000);
    return () => {
      clearInterval(messageTimer);
      clearInterval(templateTimer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [activeTab, liveTracking]);

  // Notifications from new inbound messages and outbound send failures.
  useEffect(() => {
    const statusMap = messageStatusRef.current;
    const first = !notifSeededRef.current;
    const items: DashboardNotification[] = [];
    for (const message of messages) {
      const previous = statusMap.get(message._id);
      const isNew = previous === undefined;
      statusMap.set(message._id, message.lastStatus || "");
      if (first) continue;
      if (isNew && message.direction === "inbound") {
        items.push({
          id: `inbound-${message._id}`,
          kind: "inbound",
          title: `New message from ${message.contactName || `+${message.from}`}`,
          description: message.text || message.templateName,
          createdAt: message.createdAt,
          phone: message.from,
          tab: "inbox"
        });
      } else if (
        message.direction === "outbound" &&
        message.lastStatus === "failed" &&
        previous !== "failed"
      ) {
        items.push({
          id: `failed-${message._id}`,
          kind: "failed",
          title: `Message to ${message.contactName || `+${message.to}`} failed`,
          description: message.templateName || message.text,
          createdAt: message.createdAt,
          phone: message.to,
          tab: "inbox"
        });
      }
    }
    if (first && messages.length) notifSeededRef.current = true;
    pushNotifications(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  // Notifications from template status transitions (approval, rejection…).
  useEffect(() => {
    const statusMap = templateStatusRef.current;
    const first = !templatesSeededRef.current;
    const items: DashboardNotification[] = [];
    for (const template of templates) {
      const key = `${template.name}:${template.language}`;
      const previous = statusMap.get(key);
      const status = (template.status || "").toUpperCase();
      statusMap.set(key, status);
      if (first) continue;
      if (
        previous &&
        previous !== status &&
        ["APPROVED", "REJECTED", "PAUSED", "DISABLED"].includes(status)
      ) {
        items.push({
          id: `tpl-${key}-${status}`,
          kind: "template",
          title: `Template ${template.name} ${status.toLowerCase()}`,
          createdAt: new Date().toISOString(),
          tab: "templates"
        });
      }
    }
    if (first && templates.length) templatesSeededRef.current = true;
    pushNotifications(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates]);

  // Faster template / Meta webhook notifications from stored webhook payloads.
  useEffect(() => {
    const first = !webhookSeededRef.current;
    const items: DashboardNotification[] = [];
    for (const event of webhookEvents) {
      if (webhookSeenRef.current.has(event._id)) continue;
      webhookSeenRef.current.add(event._id);
      if (first) continue;

      const payload = event.payload as {
        entry?: Array<{
          changes?: Array<{ field: string; value: Record<string, unknown> }>;
        }>;
      };

      for (const entry of payload.entry ?? []) {
        for (const change of entry.changes ?? []) {
          if (change.field === "message_template_status_update") {
            const name = String(
              change.value.message_template_name || change.value.name || "template"
            );
            const language = String(
              change.value.message_template_language || change.value.language || ""
            );
            const status = String(
              change.value.event || change.value.message_template_status || "updated"
            ).toUpperCase();
            items.push({
              id: `tpl-${name}:${language}-${status}`,
              kind: "template",
              title: `Template ${name} ${status.toLowerCase()}`,
              createdAt: event.createdAt,
              tab: "templates"
            });
          } else if (change.field === "message_template_quality_update") {
            const name = String(change.value.message_template_name || "template");
            items.push({
              id: `tpl-quality-${event._id}`,
              kind: "info",
              title: `Template ${name} quality updated`,
              description: String(change.value.new_quality_score || ""),
              createdAt: event.createdAt,
              tab: "templates"
            });
          } else if (change.field === "phone_number_quality_update") {
            items.push({
              id: `phone-quality-${event._id}`,
              kind: "info",
              title: "Phone number quality update",
              description: String(change.value.current_limit || change.value.event || ""),
              createdAt: event.createdAt,
              tab: "settings"
            });
          }
        }
      }
    }
    if (first && webhookEvents.length) webhookSeededRef.current = true;
    pushNotifications(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webhookEvents]);

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

  async function submitTemplate(payload: TemplateBuilderPayload, id?: string) {
    setBusy("template");
    try {
      if (id) {
        const result = await api<{ status?: string }>(`/api/templates/${id}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
        toast.success(
          result.status === "PENDING"
            ? "Template updated — resubmitted to Meta for review"
            : "Template updated"
        );
      } else {
        const result = await api<{ status?: string }>("/api/templates", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        toast.success(`Template submitted to Meta (${result.status || "PENDING"})`);
      }
      await refreshAll();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save template");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function deleteTemplate(template: MessageTemplate) {
    const confirmed = window.confirm(
      `Delete "${template.name}"? It will be removed from Meta. An approved template name cannot be reused for 30 days.`
    );
    if (!confirmed) return;

    setBusy(`delete-template-${template._id}`);
    try {
      await api(`/api/templates/${template._id}`, { method: "DELETE" });
      toast.success("Template deleted");
      await refreshAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete template");
    } finally {
      setBusy("");
    }
  }

  async function uploadTemplateMedia(file: File) {
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/templates/media", {
        method: "POST",
        body: formData
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error?.message || "Could not upload media");
      }
      return {
        handle: body.handle as string,
        filename: (body.filename as string) || file.name
      };
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not upload media");
      return null;
    }
  }

  async function sendCampaign() {
    if (sendCampaignInFlightRef.current) return;

    if (!campaignRecipientCount) {
      setNotice("Select at least one contact or list");
      return;
    }

    if (selectedTemplate.headerFormat === "IMAGE" && !headerImageId) {
      setNotice("Upload a header image before sending this template");
      return;
    }

    const chosenSchedule = scheduledAt ? new Date(scheduledAt) : null;
    if (
      chosenSchedule &&
      !Number.isNaN(chosenSchedule.getTime()) &&
      chosenSchedule.getTime() > Date.now()
    ) {
      setNotice("Clear the scheduled time to send immediately, or use Schedule.");
      return;
    }

    sendCampaignInFlightRef.current = true;
    setBusy("send");
    setCancelSendRequested(false);
    cancelSendRequestedRef.current = false;
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
        batchSize: 10
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
          error: result.current?.error,
          canceled: result.canceled
        };
        setSendProgress(finalProgress);

        if (result.done || result.canceled || cancelSendRequestedRef.current) break;
      }

      await refreshAll();
      if (finalProgress?.canceled || cancelSendRequestedRef.current) {
        setNotice(
          `Campaign canceled after ${finalProgress?.acceptedCount || 0} accepted by WhatsApp`
        );
      } else {
        setNotice(
          `${finalProgress?.acceptedCount || 0} accepted, ${finalProgress?.failedCount || 0} failed by WhatsApp`
        );
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Campaign failed");
    } finally {
      sendCampaignInFlightRef.current = false;
      setBusy("");
      setCancelSendRequested(false);
      cancelSendRequestedRef.current = false;
      setTimeout(() => setSendProgress(null), 3500);
    }
  }

  async function scheduleCampaign() {
    if (scheduleCampaignInFlightRef.current) return;

    if (!campaignRecipientCount) {
      setNotice("Select at least one contact or list");
      return;
    }
    if (selectedTemplate.headerFormat === "IMAGE" && !headerImageId) {
      setNotice("Upload a header image before scheduling this template");
      return;
    }
    if (!scheduledAt) {
      setNotice("Pick a date and time to schedule");
      return;
    }
    const when = new Date(scheduledAt);
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      setNotice("Choose a date and time in the future");
      return;
    }

    scheduleCampaignInFlightRef.current = true;
    setBusy("schedule");
    try {
      await api("/api/campaigns/send", {
        method: "POST",
        body: JSON.stringify({
          name: campaignName,
          templateName: selectedTemplate.name,
          language: selectedTemplate.language,
          parameters: parameterValues,
          parameterOrder: selectedTemplate.parameters.map((parameter) => parameter.name),
          contactFieldMappings,
          headerImageId,
          listIds: Array.from(selectedListIds),
          contactIds: Array.from(selectedContactIds),
          scheduledAt: when.toISOString()
        })
      });
      await refreshAll();
      setScheduledAt("");
      toast.success(`Campaign scheduled for ${when.toLocaleString()}`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not schedule campaign");
    } finally {
      scheduleCampaignInFlightRef.current = false;
      setBusy("");
    }
  }

  async function cancelCurrentCampaign() {
    const campaignId = sendProgress?.campaignId;
    if (!campaignId) {
      setCancelSendRequested(true);
      cancelSendRequestedRef.current = true;
      setNotice("Cancel requested. The campaign will stop after this batch starts.");
      return;
    }

    setCancelSendRequested(true);
    cancelSendRequestedRef.current = true;
    setNotice("Cancel requested. Stopping remaining queued recipients.");
    try {
      await api(`/api/campaigns/${campaignId}/cancel`, {
        method: "POST",
        body: "{}"
      });
      await refreshAll();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not cancel campaign");
    }
  }

  async function cancelCampaign(campaign: Campaign) {
    const queuedCount = campaign.recipients.filter(
      (recipient) => recipient.status === "queued"
    ).length;
    if (!queuedCount) {
      setNotice("This campaign has no queued recipients left to cancel");
      return;
    }

    setBusy(`cancel-${campaign._id}`);
    try {
      const result = await api<{
        acceptedCount: number;
        failedCount: number;
        canceledCount: number;
      }>(`/api/campaigns/${campaign._id}/cancel`, {
        method: "POST",
        body: "{}"
      });
      await refreshAll();
      setNotice(
        `Campaign canceled: ${result.acceptedCount} accepted, ${result.canceledCount} unsent`
      );
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not cancel campaign");
    } finally {
      setBusy("");
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

  async function updateContact(contact: Contact, formData: FormData) {
    const payload = {
      name: String(formData.get("name") || ""),
      phone: String(formData.get("phone") || ""),
      source: String(formData.get("source") || ""),
      tags: csvToArray(String(formData.get("tags") || "")),
      listIds: formData.getAll("listIds").map(String),
      notes: String(formData.get("notes") || ""),
      consentStatus: String(formData.get("consentStatus") || "subscribed")
    };

    setBusy(`edit-${contact._id}`);
    try {
      await api(`/api/contacts/${contact._id}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      await refreshAll();
      if (selectedListId) await fetchListContacts(selectedListId);
      setNotice("Contact updated");
      return true;
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not update contact");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function importContacts(file: File, listId: string) {
    setBusy("import-contacts");
    try {
      const formData = new FormData();
      formData.set("file", file);
      if (listId) formData.set("listId", listId);
      const response = await fetch("/api/contacts/import", {
        method: "POST",
        body: formData
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error?.message || body.error || "Import failed");
      }
      await refreshAll();
      if (selectedListId) await fetchListContacts(selectedListId);
      setNotice(
        `Imported ${body.created || 0} new, updated ${body.updated || 0}, skipped ${body.skipped || 0}`
      );
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not import contacts");
    } finally {
      setBusy("");
    }
  }

  async function updateList(list: ContactList, formData: FormData) {
    const payload = {
      name: String(formData.get("name") || ""),
      description: String(formData.get("description") || ""),
      color: String(formData.get("color") || list.color)
    };

    setBusy(`edit-list-${list._id}`);
    try {
      await api(`/api/lists/${list._id}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      await refreshAll();
      await fetchListContacts(list._id);
      setNotice("List updated");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not update list");
    } finally {
      setBusy("");
    }
  }

  async function addContactsToList(listId: string, contactIds: string[]) {
    if (!contactIds.length) return;
    setBusy(`add-list-contacts-${listId}`);
    try {
      const updates = contactIds.map((contactId) => {
        const contact = contacts.find((item) => item._id === contactId);
        if (!contact) return Promise.resolve();
        return api(`/api/contacts/${contactId}`, {
          method: "PATCH",
          body: JSON.stringify({
            listIds: Array.from(new Set([...(contact.listIds || []), listId]))
          })
        });
      });
      await Promise.all(updates);
      await refreshAll();
      await fetchListContacts(listId);
      setNotice(`${contactIds.length} contact${contactIds.length === 1 ? "" : "s"} added`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not add contacts");
    } finally {
      setBusy("");
    }
  }

  async function removeContactFromList(listId: string, contact: Contact) {
    setBusy(`remove-list-contact-${contact._id}`);
    try {
      await api(`/api/contacts/${contact._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          listIds: contact.listIds.filter((id) => id !== listId)
        })
      });
      await refreshAll();
      await fetchListContacts(listId);
      setNotice("Contact removed from list");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not remove contact");
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
    <DashboardShell
      user={user}
      activeTab={activeTab}
      onSelect={setActiveTab}
      search={search}
      setSearch={setSearch}
      onRefresh={refreshAll}
      busy={busy}
      onLogout={logout}
      notifications={notifications}
      unreadCount={unreadCount}
      onMarkNotificationsRead={markNotificationsRead}
      onNotificationClick={handleNotificationClick}
      onDismissNotification={dismissNotification}
    >
      {activeTab === "overview" ? (
        <Overview
          stats={stats}
          campaigns={campaigns}
          templates={templates.length ? templates : [fallbackTemplate]}
          busy={busy}
          onSync={syncTemplates}
          onRefresh={refreshAll}
          onResume={resumeCampaign}
          onCancel={cancelCampaign}
        />
      ) : null}

      {activeTab === "inbox" ? (
        <Inbox
          contacts={contacts}
          messages={messages}
          statuses={statuses}
          events={webhookEvents}
          templates={templates.length ? templates : [fallbackTemplate]}
          busy={busy}
          focusPhone={inboxFocusPhone}
          onFocusPhoneHandled={() => setInboxFocusPhone("")}
          onSendMessage={sendInboxMessage}
          onSendTemplate={sendInboxTemplate}
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
          scheduledAt={scheduledAt}
          setScheduledAt={setScheduledAt}
          parameterValues={parameterValues}
          setParameterValues={setParameterValues}
          contactFieldMappings={contactFieldMappings}
          setContactFieldMappings={setContactFieldMappings}
          search={search}
          setSearch={setSearch}
          recipientCount={campaignRecipientCount}
          headerImageId={headerImageId}
          headerImageName={headerImageName}
          messages={messages}
          busy={busy}
          progress={sendProgress}
          cancelRequested={cancelSendRequested}
          onUploadHeaderImage={uploadHeaderImage}
          onSend={sendCampaign}
          onSchedule={scheduleCampaign}
          onCancel={cancelCurrentCampaign}
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
          onUpdate={updateContact}
          onImport={importContacts}
          onDelete={deleteContact}
          onRemoveTag={removeContactTag}
        />
      ) : null}

      {activeTab === "lists" ? (
        <Lists
          lists={lists}
          contacts={contacts}
          selectedListId={selectedListId}
          selectedListContacts={selectedListContacts}
          busy={busy}
          onCreate={createList}
          onUpdate={updateList}
          onSelect={openList}
          onDelete={deleteList}
          onAddContacts={addContactsToList}
          onRemoveContact={removeContactFromList}
        />
      ) : null}

      {activeTab === "templates" ? (
        <Templates
          templates={templates.length ? templates : [fallbackTemplate]}
          busy={busy}
          onSync={syncTemplates}
          onSubmitTemplate={submitTemplate}
          onDeleteTemplate={deleteTemplate}
          onUploadTemplateMedia={uploadTemplateMedia}
        />
      ) : null}

      {activeTab === "reports" ? (
        <Reports
          campaigns={campaigns}
          busy={busy}
          onResume={resumeCampaign}
          onCancel={cancelCampaign}
        />
      ) : null}

      {activeTab === "settings" ? (
        <Settings
          diagnostics={diagnostics}
          busy={busy}
          onLoad={loadDiagnostics}
          notificationSoundEnabled={notificationSoundEnabled}
          onNotificationSoundEnabledChange={updateNotificationSoundEnabled}
        />
      ) : null}
    </DashboardShell>
  );
}
