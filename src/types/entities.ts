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
