"use client";

import * as React from "react";
import { motion } from "motion/react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  CheckCircle2,
  ClipboardList,
  Loader2,
  MessageSquareText,
  RefreshCw,
  UsersRound
} from "lucide-react";

import type { Campaign, MessageTemplate } from "@/types/entities";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { staggerContainer } from "@/lib/motion";
import { CampaignTable } from "./CampaignTable";
import { Section } from "./Section";
import { StatCard } from "./StatCard";
import { getCampaignDeliveryStats } from "./types";

function ChartTooltip({
  active,
  payload,
  label
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-moon-green/12 bg-card px-3 py-2 text-xs shadow-soft">
      <p className="mb-1 font-semibold text-moon-ink">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="flex items-center gap-2 text-muted-foreground">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          {entry.name}: <span className="font-medium text-moon-ink">{entry.value}</span>
        </p>
      ))}
    </div>
  );
}

function formatCampaignTime(value?: string) {
  if (!value) return "";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatTemplateLabel(value: string) {
  return value.length > 22 ? `${value.slice(0, 19)}...` : value;
}

function getInDeliveryCount(campaign: Campaign) {
  const delivery = getCampaignDeliveryStats(campaign);
  return Math.max(delivery.submitted - delivery.delivered, 0);
}

export function Overview({
  stats,
  campaigns,
  templates,
  busy,
  onSync,
  onRefresh,
  onResume,
  onCancel
}: {
  stats: Record<string, number>;
  campaigns: Campaign[];
  templates: MessageTemplate[];
  busy: string;
  onSync: () => void;
  onRefresh: () => void;
  onResume: (campaign: Campaign) => void;
  onCancel: (campaign: Campaign) => void;
}) {
  const [selectedTemplateFilter, setSelectedTemplateFilter] = React.useState("all");

  const templateOptions = React.useMemo(() => {
    const names = new Set<string>();
    for (const campaign of campaigns) {
      if (campaign.templateName) names.add(campaign.templateName);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [campaigns]);

  React.useEffect(() => {
    if (
      selectedTemplateFilter !== "all" &&
      !templateOptions.includes(selectedTemplateFilter)
    ) {
      setSelectedTemplateFilter("all");
    }
  }, [selectedTemplateFilter, templateOptions]);

  const chartData = React.useMemo(
    () => {
      if (selectedTemplateFilter === "all") {
        const byTemplate = new Map<
          string,
          { name: string; Sent: number; Delivered: number; "In delivery": number }
        >();

        for (const campaign of campaigns) {
          const templateName = campaign.templateName || "Unknown template";
          const delivery = getCampaignDeliveryStats(campaign);
          const current = byTemplate.get(templateName) ?? {
            name: formatTemplateLabel(templateName),
            Sent: 0,
            Delivered: 0,
            "In delivery": 0
          };
          current.Sent += delivery.submitted;
          current.Delivered += delivery.delivered;
          current["In delivery"] += getInDeliveryCount(campaign);
          byTemplate.set(templateName, current);
        }

        return Array.from(byTemplate.values())
          .sort((a, b) => b.Sent - a.Sent)
          .slice(0, 9);
      }

      return campaigns
        .filter((campaign) => campaign.templateName === selectedTemplateFilter)
        .slice(0, 9)
        .reverse()
        .map((campaign, index) => {
          const sentAt = formatCampaignTime(campaign.sentAt || campaign.createdAt);
          const delivery = getCampaignDeliveryStats(campaign);
          return {
            name: sentAt || `Run ${index + 1}`,
            Sent: delivery.submitted,
            Delivered: delivery.delivered,
            "In delivery": getInDeliveryCount(campaign)
          };
        });
    },
    [campaigns, selectedTemplateFilter]
  );

  const selectedTemplateStats = React.useMemo(() => {
    const scopedCampaigns =
      selectedTemplateFilter === "all"
        ? campaigns
        : campaigns.filter((campaign) => campaign.templateName === selectedTemplateFilter);
    return scopedCampaigns.reduce(
      (total, campaign) => {
        const delivery = getCampaignDeliveryStats(campaign);
        total.sent += delivery.submitted;
        total.delivered += delivery.delivered;
        total.inDelivery += getInDeliveryCount(campaign);
        total.failed += delivery.failed;
        return total;
      },
      { sent: 0, delivered: 0, inDelivery: 0, failed: 0 }
    );
  }, [campaigns, selectedTemplateFilter]);

  const deliveryRate = selectedTemplateStats.sent
    ? Math.round((selectedTemplateStats.delivered / selectedTemplateStats.sent) * 100)
    : 0;

  const trendDescription =
    selectedTemplateFilter === "all"
      ? "Template-level delivery health across recent sends"
      : `${selectedTemplateFilter} delivery is still updating from webhooks`;

  const statCards = [
    {
      label: "Delivered",
      value: stats.delivered,
      icon: CheckCircle2,
      tone: "#414C2F",
      hint: `${stats.failed || 0} failed across campaigns`
    },
    { label: "Contacts", value: stats.contacts, icon: UsersRound, tone: "#BB5524" },
    { label: "Lists", value: stats.lists, icon: ClipboardList, tone: "#7F6F34" },
    {
      label: "Templates",
      value: stats.templates,
      icon: MessageSquareText,
      tone: "#BA401D"
    }
  ];

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.55fr_1fr]">
        <Section
          title="Delivery trend"
          description={trendDescription}
          action={
            <Select
              value={selectedTemplateFilter}
              onValueChange={setSelectedTemplateFilter}
            >
              <SelectTrigger
                className="h-9 w-[15rem]"
                aria-label="Select template for delivery trend"
              >
                <SelectValue placeholder="All templates" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All templates</SelectItem>
                {templateOptions.map((templateName) => (
                  <SelectItem key={templateName} value={templateName}>
                    {templateName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        >
          {chartData.length ? (
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="fillDelivered" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="fillSent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-3))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--chart-3))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="fillInDelivery" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-4))" stopOpacity={0.32} />
                      <stop offset="95%" stopColor="hsl(var(--chart-4))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={44}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="Sent"
                    stroke="hsl(var(--chart-3))"
                    strokeWidth={2}
                    fill="url(#fillSent)"
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="In delivery"
                    stroke="hsl(var(--chart-4))"
                    strokeWidth={2}
                    fill="url(#fillInDelivery)"
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="Delivered"
                    stroke="hsl(var(--chart-2))"
                    strokeWidth={2.5}
                    fill="url(#fillDelivered)"
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="grid h-[260px] place-items-center text-sm text-muted-foreground">
              Send a campaign to see delivery trends.
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-chart-2" /> Delivered
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-chart-4" /> In delivery
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-chart-3" /> Sent
            </span>
            <span className="ml-auto font-medium text-moon-ink">
              {deliveryRate}% delivered · {selectedTemplateStats.inDelivery.toLocaleString()} still updating
            </span>
          </div>
        </Section>

        <Section
          title="Templates"
          description="Recently used message templates"
          action={
            <Button size="sm" onClick={onSync} disabled={busy === "sync"}>
              {busy === "sync" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <RefreshCw />
              )}
              Sync
            </Button>
          }
        >
          <div className="space-y-3">
            {templates.slice(0, 4).map((template) => (
              <div
                key={`${template.name}-${template.language}`}
                className="rounded-lg border border-moon-green/10 bg-muted/40 p-3 transition-colors hover:border-moon-green/25"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-medium text-moon-ink">
                    {template.name}
                  </p>
                  <Badge variant="secondary">{template.status || "LOCAL"}</Badge>
                </div>
                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                  {template.body || "No body stored"}
                </p>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <Section
        title="Recent campaigns"
        description="Latest broadcasts and their delivery"
        action={
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={onRefresh}
            aria-label="Refresh"
          >
            <RefreshCw />
          </Button>
        }
      >
        <CampaignTable
          campaigns={campaigns.slice(0, 6)}
          busy={busy}
          onResume={onResume}
          onCancel={onCancel}
          compact
        />
      </Section>
    </motion.div>
  );
}
