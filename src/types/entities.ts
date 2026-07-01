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

export type MessageTemplate = {
  _id: string;
  metaId?: string;
  name: string;
  language: string;
  category?: string;
  status?: string;
  body?: string;
  headerFormat?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION";
  headerMediaUrl?: string;
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
  errors?: unknown;
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
  status: "draft" | "sending" | "sent" | "partial" | "failed" | "canceled";
  cancelRequested?: boolean;
  canceledAt?: string;
  acceptedCount: number;
  failedCount: number;
  createdBy?: string;
  createdAt: string;
  sentAt?: string;
};
