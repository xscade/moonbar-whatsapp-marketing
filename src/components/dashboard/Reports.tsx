"use client";

import * as React from "react";
import { motion } from "motion/react";
import { CheckCheck, Eye, Send, XCircle } from "lucide-react";

import type { Campaign } from "@/types/entities";
import { fadeInUp, staggerContainer } from "@/lib/motion";
import { CampaignTable } from "./CampaignTable";
import { Section } from "./Section";
import { getCampaignDeliveryStats } from "./types";

export function Reports({
  campaigns,
  busy,
  onResume,
  onCancel,
  onOpenRetry,
  onRetryChanged
}: {
  campaigns: Campaign[];
  busy: string;
  onResume: (campaign: Campaign) => void;
  onCancel: (campaign: Campaign) => void;
  onOpenRetry?: (campaign: Campaign) => void;
  onRetryChanged?: () => void;
}) {
  const totals = React.useMemo(() => {
    return campaigns.reduce(
      (acc, campaign) => {
        const delivery = getCampaignDeliveryStats(campaign);
        acc.submitted += delivery.submitted;
        acc.delivered += delivery.delivered;
        acc.read += delivery.read;
        acc.failed += delivery.failed;
        return acc;
      },
      { submitted: 0, delivered: 0, read: 0, failed: 0 }
    );
  }, [campaigns]);

  const kpis = [
    { label: "Sent", value: totals.submitted, icon: Send, tone: "text-moon-ink/70", bg: "bg-muted" },
    {
      label: "Delivered",
      value: totals.delivered,
      icon: CheckCheck,
      tone: "text-moon-green",
      bg: "bg-moon-green/10"
    },
    { label: "Read", value: totals.read, icon: Eye, tone: "text-moon-gold", bg: "bg-moon-gold/10" },
    {
      label: "Failed",
      value: totals.failed,
      icon: XCircle,
      tone: "text-moon-red",
      bg: "bg-moon-red/10"
    }
  ];

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <motion.div
              key={kpi.label}
              variants={fadeInUp}
              className="flex items-center gap-3 rounded-xl border border-moon-green/12 bg-card p-4 shadow-card"
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${kpi.bg} ${kpi.tone}`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-semibold tabular-nums text-moon-ink">
                  {kpi.value.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
              </div>
            </motion.div>
          );
        })}
      </div>

      <Section
        title="Campaign history"
        description="Every broadcast with its real WhatsApp delivery funnel"
      >
        <p className="mb-4 rounded-lg border border-moon-gold/25 bg-moon-yellow/25 px-4 py-3 text-xs leading-relaxed text-moon-ink/75">
          <strong className="text-moon-ink">Sent</strong> is how many messages WhatsApp
          accepted for sending. <strong className="text-moon-ink">Delivered</strong> and{" "}
          <strong className="text-moon-ink">Read</strong> come from WhatsApp delivery
          receipts and match the numbers in Meta&apos;s WhatsApp Manager. Marketing
          messages are often accepted but not delivered (frequency caps, invalid numbers,
          blocks), so Delivered is usually lower than Sent.
        </p>
        <CampaignTable
          campaigns={campaigns}
          busy={busy}
          onResume={onResume}
          onCancel={onCancel}
          onOpenRetry={onOpenRetry}
          onRetryChanged={onRetryChanged}
        />
      </Section>
    </motion.div>
  );
}
