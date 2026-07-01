"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type {
  AdminUser,
  Campaign,
  Contact,
  ContactList,
  ContactTemplateField,
  MessageTemplate
} from "@/types/entities";

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
  const cancelSendRequestedRef = useRef(false);

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
      setBusy("");
      setCancelSendRequested(false);
      cancelSendRequestedRef.current = false;
      setTimeout(() => setSendProgress(null), 3500);
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
          cancelRequested={cancelSendRequested}
          onUploadHeaderImage={uploadHeaderImage}
          onSend={sendCampaign}
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
        <Reports
          campaigns={campaigns}
          busy={busy}
          onResume={resumeCampaign}
          onCancel={cancelCampaign}
        />
      ) : null}

      {activeTab === "settings" ? (
        <Settings diagnostics={diagnostics} busy={busy} onLoad={loadDiagnostics} />
      ) : null}
    </DashboardShell>
  );
}
