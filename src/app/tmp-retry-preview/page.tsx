"use client";

// TEMPORARY visual-verification harness — delete after checking the retry table.
import { useEffect, useState } from "react";

import type { Campaign } from "@/types/entities";
import { RetryMetricsAccordion } from "@/components/dashboard/retry/RetryMetricsAccordion";

const CAMPAIGN_ID = "preview";

function makeRecipients() {
  const list = [];
  for (let i = 0; i < 1074; i += 1) {
    if (i < 64) {
      list.push({ name: `c${i}`, phone: `9${i}`, status: "failed" as const, lastStatus: "failed" });
    } else if (i < 64 + 21) {
      list.push({ name: `c${i}`, phone: `9${i}`, status: "accepted" as const, lastStatus: "read" });
    } else if (i < 64 + 69) {
      list.push({ name: `c${i}`, phone: `9${i}`, status: "accepted" as const, lastStatus: "delivered" });
    } else {
      list.push({ name: `c${i}`, phone: `9${i}`, status: "accepted" as const, lastStatus: "accepted" });
    }
  }
  return list;
}

const campaign = {
  _id: CAMPAIGN_ID,
  name: "Preview campaign",
  templateName: "event_details_reminder_1",
  language: "en_US",
  parameters: {},
  listIds: [],
  recipients: makeRecipients(),
  status: "partial",
  acceptedCount: 1010,
  failedCount: 64,
  createdAt: "2026-08-08T07:49:00.000Z",
  sentAt: "2026-08-08T07:49:00.000Z"
} as unknown as Campaign;

const state = {
  policy: {
    _id: "p1",
    campaignId: CAMPAIGN_ID,
    enabled: true,
    status: "active",
    mode: "automatic",
    retryIntervalHours: 24,
    maxRetries: 2,
    relevantUntil: "2026-08-10T14:30:00.000Z",
    retryableErrorCodes: [131049],
    attemptsMade: 0,
    cachedNextRetryAt: "2026-08-09T07:25:00.000Z",
    createdAt: "2026-08-08T07:49:00.000Z",
    updatedAt: "2026-08-08T07:49:00.000Z",
    audit: []
  },
  attempts: [],
  recoveredCount: 0,
  eligibility: {
    eligibleCount: 41,
    ineligibleCount: 23,
    firstEligibleAt: "2026-08-09T07:25:00.000Z",
    errorCode: 131049
  }
};

export default function Page() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const real = window.fetch;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/retry-attempts")) {
        return new Response(JSON.stringify(state), {
          headers: { "Content-Type": "application/json" }
        });
      }
      if (url.includes("/retry-policy")) {
        // eslint-disable-next-line no-console
        console.log("CANCEL CALL", init?.method, init?.body);
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" }
        });
      }
      return real(input, init);
    };
    setReady(true);
    return () => {
      window.fetch = real;
    };
  }, []);

  if (!ready) return null;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="overflow-hidden rounded-xl border border-moon-green/12 bg-moon-cream/20">
        <RetryMetricsAccordion campaign={campaign} open onChanged={() => undefined} />
      </div>
    </div>
  );
}
