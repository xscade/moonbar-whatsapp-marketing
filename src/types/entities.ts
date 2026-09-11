export type Role = "owner" | "manager" | "viewer";

export type AdminUser = {
  _id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
  updatedAt?: string;
};

export type Contact = {
  _id: string;
  name: string;
  phone: string;
  tags: string[];
  listIds: string[];
  source?: string;
  notes?: string;
  consentStatus: "subscribed" | "unsubscribed";
  createdAt: string;
  updatedAt?: string;
};

export type ContactList = {
  _id: string;
  name: string;
  description?: string;
  color: string;
  memberCount?: number;
  createdAt: string;
  updatedAt?: string;
};

export type ContactTemplateField = "name";

export type TemplateParameter = {
  name: string;
  example?: string;
};

export type TemplateButtonType =
  | "QUICK_REPLY"
  | "URL"
  | "PHONE_NUMBER"
  | "COPY_CODE";

export type TemplateButton = {
  type: TemplateButtonType;
  text: string;
  url?: string;
  phoneNumber?: string;
  example?: string;
};

export type TemplateHeaderType = "none" | "text" | "image" | "video" | "document";

export type TemplateCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION";

// Flat payload the builder sends to the API for create/edit.
export type TemplateBuilderPayload = {
  name: string;
  language: string;
  category: TemplateCategory;
  headerType: TemplateHeaderType;
  headerText?: string;
  headerHandle?: string;
  headerFilename?: string;
  body: string;
  samples?: Record<string, string>;
  footer?: string;
  buttons?: TemplateButton[];
};

export type MessageTemplate = {
  _id: string;
  metaId?: string;
  name: string;
  language: string;
  category?: string;
  status?: string;
  qualityScore?: string;
  body?: string;
  headerFormat?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION";
  headerText?: string;
  headerMediaUrl?: string;
  footer?: string;
  buttons?: TemplateButton[];
  parameterFormat: "NAMED" | "POSITIONAL";
  parameters: TemplateParameter[];
  createdAt: string;
  updatedAt?: string;
};

export type CampaignRecipient = {
  contactId?: string;
  name: string;
  phone: string;
  status: "queued" | "accepted" | "failed" | "canceled";
  messageId?: string;
  error?: string;
  lastStatus?: string;
  lastStatusAt?: string;
  errors?: unknown;
  // Retry bookkeeping — all optional so pre-existing recipient docs keep working.
  errorCode?: number;
  errorTitle?: string;
  failedAt?: string;
  nextRetryAt?: string;
  retryCount?: number;
  attemptNumber?: number;
  recovered?: boolean;
};

export type Campaign = {
  _id: string;
  name: string;
  templateName: string;
  language: string;
  parameters: Record<string, string>;
  parameterOrder?: string[];
  contactFieldMappings?: Record<string, ContactTemplateField>;
  headerImageId?: string;
  listIds: string[];
  recipients: CampaignRecipient[];
  status:
    | "draft"
    | "scheduled"
    | "sending"
    | "sent"
    | "partial"
    | "failed"
    | "canceled";
  cancelRequested?: boolean;
  canceledAt?: string;
  scheduledAt?: string;
  acceptedCount: number;
  failedCount: number;
  recoveredCount?: number;
  createdBy?: string;
  createdAt: string;
  sentAt?: string;
  // Enrichment attached by GET /api/campaigns (not stored on the campaign doc).
  retryPolicy?: RetryPolicy | null;
  retrySummary?: RetrySummary | null;
  eligibleRetryCount?: number;
};

export type RetryPolicyStatus =
  | "active"
  | "paused"
  | "completed"
  | "expired"
  | "cancelled";

export type RetryMode = "once" | "automatic" | "until_delivered";

export type RetryAuditEntry = {
  action: string;
  by?: string;
  at: string;
  details?: string;
};

export type RetryPolicy = {
  _id: string;
  campaignId: string;
  enabled: boolean;
  status: RetryPolicyStatus;
  mode: RetryMode;
  retryIntervalHours: number;
  maxRetries: number;
  relevantUntil: string;
  retryableErrorCodes: number[];
  attemptsMade: number;
  cachedNextRetryAt?: string | null;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  pausedAt?: string;
  cancelledAt?: string;
  audit?: RetryAuditEntry[];
};

export type RetryAttemptStatus =
  | "scheduled"
  | "queued"
  | "processing"
  | "completed"
  | "partial"
  | "failed"
  | "skipped"
  | "cancelled";

export type RetryAttempt = {
  _id: string;
  campaignId: string;
  retryPolicyId: string;
  attemptNumber: number;
  scheduledFor: string;
  startedAt?: string;
  completedAt?: string;
  status: RetryAttemptStatus;
  eligibleCount: number;
  submittedCount: number;
  deliveredCount: number;
  readCount: number;
  failedCount: number;
  pendingCount: number;
  skippedCount: number;
  recoveredCount: number;
  cronRunId?: string;
  createdAt: string;
  updatedAt: string;
};

/** Compact per-campaign retry rollup attached to the campaigns list response. */
export type RetrySummary = {
  status: RetryPolicyStatus | "none";
  mode?: RetryMode;
  attemptsMade: number;
  maxRetries: number;
  scheduledCount: number;
  processingCount: number;
  recoveredCount: number;
  eligibleCount: number;
  nextRetryAt?: string | null;
  relevantUntil?: string | null;
  lastAttemptStatus?: RetryAttemptStatus;
};
