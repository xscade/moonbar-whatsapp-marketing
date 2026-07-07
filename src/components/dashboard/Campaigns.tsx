"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  CalendarClock,
  Clock3,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Send,
  Upload,
  Users,
  X
} from "lucide-react";

import type {
  Campaign,
  Contact,
  ContactList,
  ContactTemplateField,
  MessageTemplate
} from "@/types/entities";
import { CampaignTable } from "./CampaignTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { staggerContainer } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { CampaignLiveList } from "./CampaignLiveList";
import { Section } from "./Section";
import type { CampaignProgress, WhatsAppMessage } from "./types";

const RETRY_INTERVAL_HOURS = 24;
const RETRY_INTERVAL_MS = RETRY_INTERVAL_HOURS * 60 * 60 * 1000;
const MAX_RETRY_ATTEMPTS = 3;

function toLocalInput(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

export function Campaigns(props: {
  campaigns: Campaign[];
  onResume: (campaign: Campaign) => void;
  onCancelCampaign: (campaign: Campaign) => void;
  onOpenRetry: (campaign: Campaign) => void;
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
  scheduledAt: string;
  setScheduledAt: (value: string) => void;
  retryPlanningEnabled: boolean;
  setRetryPlanningEnabled: (value: boolean) => void;
  retryMode: "once" | "automatic";
  setRetryMode: (value: "once" | "automatic") => void;
  retryRelevantUntil: string;
  setRetryRelevantUntil: (value: string) => void;
  retryMaxRetries: number;
  setRetryMaxRetries: (value: number) => void;
  parameterValues: Record<string, string>;
  setParameterValues: (value: Record<string, string>) => void;
  contactFieldMappings: Record<string, ContactTemplateField>;
  setContactFieldMappings: (value: Record<string, ContactTemplateField>) => void;
  search: string;
  setSearch: (value: string) => void;
  recipientCount: number;
  headerImageId: string;
  headerImageName: string;
  messages: WhatsAppMessage[];
  busy: string;
  progress: CampaignProgress | null;
  cancelRequested: boolean;
  onUploadHeaderImage: (file: File) => void;
  onSend: () => void;
  onSchedule: () => void;
  onCancel: () => void;
}) {
  const percent = props.progress?.total
    ? Math.round((props.progress.sent / props.progress.total) * 100)
    : 0;
  const sending = props.busy === "send" || props.busy === "media";
  const scheduling = props.busy === "schedule";
  const scheduleTime = props.scheduledAt ? new Date(props.scheduledAt) : null;
  const scheduleIsValid =
    !!scheduleTime &&
    !Number.isNaN(scheduleTime.getTime()) &&
    scheduleTime.getTime() > Date.now();
  const sendNowBlockedBySchedule = scheduleIsValid;
  const retryStartAt = scheduleIsValid && scheduleTime ? scheduleTime : new Date();
  const firstRetryAt = new Date(retryStartAt.getTime() + RETRY_INTERVAL_MS);
  const minRetryRelevantUntil = toLocalInput(firstRetryAt);
  const retryRelevantDate = props.retryRelevantUntil
    ? new Date(props.retryRelevantUntil)
    : null;
  const retryRelevantIsValid =
    !props.retryPlanningEnabled ||
    (!!retryRelevantDate &&
      !Number.isNaN(retryRelevantDate.getTime()) &&
      retryRelevantDate.getTime() >= firstRetryAt.getTime());
  const automaticRetryCount =
    retryRelevantDate && retryRelevantDate.getTime() >= firstRetryAt.getTime()
      ? Math.min(
          MAX_RETRY_ATTEMPTS,
          Math.floor(
            (retryRelevantDate.getTime() - firstRetryAt.getTime()) /
              RETRY_INTERVAL_MS
          ) + 1
        )
      : 0;
  const plannedRetryCount = props.retryPlanningEnabled
    ? props.retryMode === "once"
      ? retryRelevantIsValid
        ? 1
        : 0
      : Math.min(Math.max(props.retryMaxRetries, 1), automaticRetryCount)
    : 0;
  const retryPreview = Array.from({ length: plannedRetryCount }, (_, index) =>
    new Date(firstRetryAt.getTime() + index * RETRY_INTERVAL_MS)
  );
  const blocked =
    props.recipientCount === 0 ||
    (props.selectedTemplate.headerFormat === "IMAGE" && !props.headerImageId) ||
    !retryRelevantIsValid;
  // Earliest selectable time as a *local* wall-clock string (datetime-local
  // ignores timezone), so the floor lines up with the admin's clock (e.g. IST).
  const minSchedule = (() => {
    const soon = new Date(Date.now() + 60_000);
    return new Date(soon.getTime() - soon.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);
  })();
  const shownContactIds = props.contacts.map((contact) => contact._id);
  const shownSelectedCount = shownContactIds.filter((id) =>
    props.selectedContactIds.has(id)
  ).length;
  const allShownSelected =
    shownContactIds.length > 0 && shownSelectedCount === shownContactIds.length;

  const [view, setView] = useState<"list" | "builder">("list");
  const [campaignSearch, setCampaignSearch] = useState("");

  useEffect(() => {
    if (!props.retryPlanningEnabled) return;
    if (
      !retryRelevantDate ||
      Number.isNaN(retryRelevantDate.getTime()) ||
      retryRelevantDate.getTime() < firstRetryAt.getTime()
    ) {
      props.setRetryRelevantUntil(
        toLocalInput(new Date(firstRetryAt.getTime() + RETRY_INTERVAL_MS))
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.retryPlanningEnabled, props.scheduledAt]);

  useEffect(() => {
    if (!props.retryPlanningEnabled || props.retryMode !== "automatic") return;
    props.setRetryMaxRetries(Math.max(1, automaticRetryCount || 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.retryPlanningEnabled, props.retryMode, automaticRetryCount]);

  // A live send owns the screen — always show the builder so the admin can watch
  // delivery land and cancel if needed.
  const showBuilder = view === "builder" || !!props.progress;

  const filteredCampaigns = useMemo(() => {
    const query = campaignSearch.trim().toLowerCase();
    if (!query) return props.campaigns;
    return props.campaigns.filter(
      (campaign) =>
        campaign.name.toLowerCase().includes(query) ||
        campaign.templateName.toLowerCase().includes(query)
    );
  }, [props.campaigns, campaignSearch]);

  if (!showBuilder) {
    return (
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="grid gap-4"
      >
        <Section
          title="Campaigns"
          description={`${props.campaigns.length.toLocaleString()} broadcast${
            props.campaigns.length === 1 ? "" : "s"
          }`}
          action={
            <Button type="button" onClick={() => setView("builder")}>
              <Plus />
              New campaign
            </Button>
          }
        >
          <div className="grid gap-4">
            <div className="relative max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-moon-ink/40" />
              <Input
                value={campaignSearch}
                onChange={(event) => setCampaignSearch(event.target.value)}
                placeholder="Search campaigns"
                className="pl-9"
              />
            </div>
            <CampaignTable
              campaigns={filteredCampaigns}
              busy={props.busy}
              onResume={props.onResume}
              onCancel={props.onCancelCampaign}
              onOpenRetry={props.onOpenRetry}
            />
          </div>
        </Section>
      </motion.div>
    );
  }

  return (
    <div className="grid gap-4">
      {!props.progress ? (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2"
            onClick={() => setView("list")}
          >
            <ArrowLeft />
            Back to campaigns
          </Button>
        </div>
      ) : null}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]"
      >
      <Section title="Campaign builder" description="Compose your broadcast">
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="campaign-name">Campaign name</Label>
            <Input
              id="campaign-name"
              value={props.campaignName}
              onChange={(event) => props.setCampaignName(event.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label>Template</Label>
            <Select
              value={props.selectedTemplateName}
              onValueChange={props.setSelectedTemplateName}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a template" />
              </SelectTrigger>
              <SelectContent>
                {props.templates.map((template) => (
                  <SelectItem
                    key={`${template.name}-${template.language}`}
                    value={template.name}
                  >
                    {template.name} ({template.language})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border border-moon-green/12 bg-muted/40 p-3.5 text-sm">
            <p className="font-medium text-moon-ink">{props.selectedTemplate.name}</p>
            <p className="mt-2 whitespace-pre-line text-muted-foreground">
              {props.selectedTemplate.body}
            </p>
            {props.selectedTemplate.headerFormat === "IMAGE" ? (
              <Badge variant="warning" className="mt-3">
                Image header required
              </Badge>
            ) : null}
          </div>

          {props.selectedTemplate.headerFormat === "IMAGE" ? (
            <div className="grid gap-2">
              <Label htmlFor="header-image">Header image</Label>
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-moon-green/25 bg-card px-3 py-3 text-sm text-muted-foreground transition-colors hover:border-moon-red/40",
                  props.busy === "media" && "opacity-60"
                )}
              >
                <Upload className="h-4 w-4" />
                <span className="truncate">
                  {props.headerImageId
                    ? props.headerImageName || props.headerImageId
                    : "Upload PNG, JPG or WebP"}
                </span>
                <input
                  id="header-image"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  disabled={props.busy === "media"}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) props.onUploadHeaderImage(file);
                  }}
                />
              </label>
              {props.headerImageId ? (
                <span className="text-xs font-medium text-moon-green">
                  Uploaded ✓
                </span>
              ) : null}
            </div>
          ) : null}

          {props.selectedTemplate.parameters.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {props.selectedTemplate.parameters.map((parameter) => {
                const mappedField = props.contactFieldMappings[parameter.name];
                return (
                  <div
                    key={parameter.name}
                    className="grid gap-2 rounded-lg border border-moon-green/12 bg-card p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium text-moon-ink">
                        {parameter.name}
                      </span>
                      <Select
                        value={mappedField || "custom"}
                        onValueChange={(value) => {
                          const next = { ...props.contactFieldMappings };
                          if (value === "custom") {
                            delete next[parameter.name];
                          } else {
                            next[parameter.name] = value as ContactTemplateField;
                          }
                          props.setContactFieldMappings(next);
                        }}
                      >
                        <SelectTrigger className="h-8 w-auto min-w-[7.5rem] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="custom">Custom text</SelectItem>
                          <SelectItem value="name">Contact name</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Input
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
                      className="h-9 disabled:bg-moon-cream/50"
                    />
                  </div>
                );
              })}
            </div>
          ) : null}

          <div className="grid gap-3 rounded-lg border border-moon-green/12 bg-muted/40 p-3.5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <RefreshCw className="mt-0.5 h-4 w-4 text-moon-green" />
                <div>
                  <Label htmlFor="retry-plan" className="text-sm">
                    Retry failed deliveries
                  </Label>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Some Meta 131049 failures may become eligible later. Retries
                    run every 24 hours to maximise the delivery rate.
                  </p>
                </div>
              </div>
              <Switch
                id="retry-plan"
                checked={props.retryPlanningEnabled}
                onCheckedChange={props.setRetryPlanningEnabled}
                aria-label="Enable retry plan"
              />
            </div>

            {props.retryPlanningEnabled ? (
              <div className="grid gap-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="gap-1">
                    <Clock3 className="h-3.5 w-3.5" />
                    Every 24h
                  </Badge>
                  <Badge variant="outline">
                    {plannedRetryCount
                      ? `${plannedRetryCount} planned ${
                          plannedRetryCount === 1 ? "retry" : "retries"
                        }`
                      : "Needs event date"}
                  </Badge>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="retry-relevant-until">
                    Event relevant until
                  </Label>
                  <Input
                    id="retry-relevant-until"
                    type="datetime-local"
                    value={props.retryRelevantUntil}
                    min={minRetryRelevantUntil}
                    onChange={(event) =>
                      props.setRetryRelevantUntil(event.target.value)
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Use retries only when the campaign will remain relevant for at
                    least another 24 hours.
                  </p>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      props.setRetryMode("once");
                      props.setRetryMaxRetries(1);
                    }}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      props.retryMode === "once"
                        ? "border-moon-green bg-moon-green text-moon-paper"
                        : "border-moon-green/18 bg-card text-moon-ink hover:bg-moon-cream/50"
                    )}
                  >
                    <span className="font-medium">Retry once</span>
                    <span className="mt-1 block text-xs opacity-75">
                      Best for campaigns ending soon.
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => props.setRetryMode("automatic")}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      props.retryMode === "automatic"
                        ? "border-moon-green bg-moon-green text-moon-paper"
                        : "border-moon-green/18 bg-card text-moon-ink hover:bg-moon-cream/50"
                    )}
                  >
                    <span className="font-medium">Auto calculate</span>
                    <span className="mt-1 block text-xs opacity-75">
                      Fits retries before the relevancy date.
                    </span>
                  </button>
                </div>

                {props.retryMode === "automatic" ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-moon-green/12 bg-card px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-moon-ink">
                        Retry attempts
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Auto-set from the event date, capped at {MAX_RETRY_ATTEMPTS}.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() =>
                          props.setRetryMaxRetries(
                            Math.max(1, props.retryMaxRetries - 1)
                          )
                        }
                        disabled={props.retryMaxRetries <= 1}
                      >
                        -
                      </Button>
                      <span className="w-8 text-center text-sm font-semibold">
                        {Math.max(1, props.retryMaxRetries)}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() =>
                          props.setRetryMaxRetries(
                            Math.min(
                              MAX_RETRY_ATTEMPTS,
                              props.retryMaxRetries + 1
                            )
                          )
                        }
                        disabled={
                          props.retryMaxRetries >=
                          Math.max(1, automaticRetryCount || 1)
                        }
                      >
                        +
                      </Button>
                    </div>
                  </div>
                ) : null}

                {retryPreview.length ? (
                  <div className="grid gap-1 text-xs text-muted-foreground">
                    {retryPreview.map((date, index) => (
                      <span key={date.toISOString()}>
                        Retry #{index + 1}: {date.toLocaleString()}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs font-medium text-moon-red">
                    Pick an event date after {firstRetryAt.toLocaleString()}.
                  </p>
                )}
              </div>
            ) : null}
          </div>

          <Button
            type="button"
            size="lg"
            className="justify-center"
            onClick={props.onSend}
            disabled={sending || scheduling || blocked || sendNowBlockedBySchedule}
            title={
              sendNowBlockedBySchedule
                ? "Clear the scheduled time to send immediately."
                : undefined
            }
          >
            {sending ? <Loader2 className="animate-spin" /> : <Send />}
            Send now to {props.recipientCount.toLocaleString()}
          </Button>

          <div className="grid gap-2 rounded-lg border border-moon-green/12 bg-muted/40 p-3.5">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-moon-green" />
              <Label htmlFor="schedule-at" className="text-sm">
                Schedule for later
              </Label>
              <span className="text-xs text-muted-foreground">Optional</span>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="schedule-at"
                type="datetime-local"
                value={props.scheduledAt}
                min={minSchedule}
                onChange={(event) => props.setScheduledAt(event.target.value)}
                className="sm:flex-1"
              />
              <Button
                type="button"
                variant="outline"
                className="justify-center"
                onClick={props.onSchedule}
                disabled={sending || scheduling || blocked || !scheduleIsValid}
              >
                {scheduling ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <CalendarClock />
                )}
                Schedule
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {props.scheduledAt && !scheduleIsValid
                ? "Pick a time in the future."
                : scheduleIsValid
                  ? `Sends automatically around ${scheduleTime?.toLocaleString()}.`
                  : "Save this broadcast to send automatically at a chosen time."}
            </p>
          </div>

          <AnimatePresence>
            {props.progress ? (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="rounded-xl border border-moon-green/12 bg-muted/40 p-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-moon-ink">
                      {props.cancelRequested || props.progress.canceled
                        ? "Canceling"
                        : "Sending"}{" "}
                      {props.progress.sent} of {props.progress.total}
                    </span>
                    <span className="font-semibold text-moon-red">{percent}%</span>
                  </div>
                  <Progress value={Math.min(percent, 100)} />
                  <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                    <span>
                      Accepted:{" "}
                      <strong className="text-moon-green">
                        {props.progress.acceptedCount}
                      </strong>
                    </span>
                    <span>
                      Failed:{" "}
                      <strong className="text-moon-red">
                        {props.progress.failedCount}
                      </strong>
                    </span>
                    <span>
                      Remaining:{" "}
                      {Math.max(props.progress.total - props.progress.sent, 0)}
                    </span>
                  </div>
                  {props.progress.currentName || props.progress.currentPhone ? (
                    <p className="mt-2 truncate text-xs text-muted-foreground">
                      Last: {props.progress.currentName || props.progress.currentPhone}
                      {props.progress.currentStatus
                        ? ` · ${props.progress.currentStatus}`
                        : ""}
                    </p>
                  ) : null}
                  {props.progress.error ? (
                    <p className="mt-2 line-clamp-2 text-xs text-moon-red">
                      {props.progress.error}
                    </p>
                  ) : null}
                  {!props.progress.canceled ? (
                    <Button
                      variant="outline"
                      className="mt-3 w-full justify-center border-moon-red/30 text-moon-red hover:bg-moon-red/10 hover:text-moon-red"
                      onClick={props.onCancel}
                      disabled={props.cancelRequested}
                    >
                      {props.cancelRequested ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <X />
                      )}
                      {props.cancelRequested ? "Canceling" : "Cancel campaign"}
                    </Button>
                  ) : null}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </Section>

      <Section
        title={props.progress ? "Live delivery" : "Recipients"}
        description={
          props.progress
            ? "Watching each send land in real time"
            : `${props.recipientCount.toLocaleString()} selected`
        }
        action={
          <Badge variant="secondary" className="gap-1">
            <Users className="h-3.5 w-3.5" />
            {props.recipientCount.toLocaleString()}
          </Badge>
        }
      >
        {props.progress ? (
          <CampaignLiveList
            messages={props.messages}
            campaignId={props.progress.campaignId}
            total={props.progress.total}
          />
        ) : (
        <div className="grid gap-4">
          <div className="grid gap-2">
            <p className="text-sm font-medium text-moon-ink">Lists</p>
            <div className="flex flex-wrap gap-2">
              {props.lists.map((list) => {
                const selected = props.selectedListIds.has(list._id);
                return (
                  <button
                    key={list._id}
                    type="button"
                    onClick={() => {
                      const next = new Set(props.selectedListIds);
                      if (selected) next.delete(list._id);
                      else next.add(list._id);
                      props.setSelectedListIds(next);
                    }}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                      selected
                        ? "border-moon-green bg-moon-green text-moon-paper"
                        : "border-moon-green/18 bg-card text-moon-ink hover:bg-moon-cream/50"
                    )}
                  >
                    {list.name}{" "}
                    <span className="opacity-70">({list.memberCount || 0})</span>
                  </button>
                );
              })}
              {!props.lists.length ? (
                <p className="text-sm text-muted-foreground">No lists yet</p>
              ) : null}
            </div>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-moon-ink/40" />
            <Input
              value={props.search}
              onChange={(event) => props.setSearch(event.target.value)}
              placeholder="Search contacts"
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-moon-green/12 bg-muted/35 px-3 py-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-moon-ink">
              <Checkbox
                checked={
                  allShownSelected
                    ? true
                    : shownSelectedCount > 0
                      ? "indeterminate"
                      : false
                }
                onCheckedChange={() => {
                  const next = new Set(props.selectedContactIds);
                  if (allShownSelected) {
                    for (const id of shownContactIds) next.delete(id);
                  } else {
                    for (const id of shownContactIds) next.add(id);
                  }
                  props.setSelectedContactIds(next);
                }}
              />
              Select all shown
            </label>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>
                {shownSelectedCount.toLocaleString()} of{" "}
                {shownContactIds.length.toLocaleString()} shown
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => props.setSelectedContactIds(new Set())}
                disabled={!props.selectedContactIds.size}
                className="h-8 px-2"
              >
                Clear
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-moon-green/12">
            <ScrollArea className="h-[420px]">
              {props.contacts.map((contact) => {
                const selected = props.selectedContactIds.has(contact._id);
                return (
                  <label
                    key={contact._id}
                    className="flex cursor-pointer items-center gap-3 border-b border-moon-green/8 px-3 py-3 last:border-0 hover:bg-moon-cream/30"
                  >
                    <Checkbox
                      checked={selected}
                      onCheckedChange={() => {
                        const next = new Set(props.selectedContactIds);
                        if (selected) next.delete(contact._id);
                        else next.add(contact._id);
                        props.setSelectedContactIds(next);
                      }}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-moon-ink">
                        {contact.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        +{contact.phone}
                        {contact.source ? ` · ${contact.source}` : ""}
                      </span>
                    </span>
                  </label>
                );
              })}
              {!props.contacts.length ? (
                <p className="p-4 text-sm text-muted-foreground">
                  No matching contacts
                </p>
              ) : null}
            </ScrollArea>
          </div>
        </div>
        )}
      </Section>
      </motion.div>
    </div>
  );
}
