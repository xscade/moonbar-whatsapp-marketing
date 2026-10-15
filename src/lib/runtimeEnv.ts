export const RUNTIME_ENV_KEYS = [
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_APP_ID",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_DISPLAY_PHONE_NUMBER",
  "WHATSAPP_BUSINESS_ACCOUNT_ID",
  "WHATSAPP_VERIFY_TOKEN",
  "WHATSAPP_WEBHOOK_SECRET",
  "WHATSAPP_REGISTRATION_PIN",
  "WHATSAPP_GRAPH_API_VERSION",
  "WHATSAPP_GRAPH_BASE_URL",
  "META_BUSINESS_ID",
  "META_SYSTEM_USER_ID",
  "MONGODB_URI",
  "CRON_SECRET",
  "AUTH_SECRET",
  "RETRY_MAX_ATTEMPTS",
  "NODE_ENV",
  "VERCEL_ENV"
] as const;

export type RuntimeEnvKey = (typeof RUNTIME_ENV_KEYS)[number];

export type RuntimeEnvEntry = {
  key: RuntimeEnvKey;
  value: string;
  set: boolean;
};

export type RuntimeEnvResponse = {
  environment: string;
  variables: RuntimeEnvEntry[];
};

export function getRuntimeEnv(): RuntimeEnvResponse {
  return {
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown",
    variables: getRuntimeEnvEntries()
  };
}

export function getRuntimeEnvEntries(): RuntimeEnvEntry[] {
  return RUNTIME_ENV_KEYS.map((key) => {
    const value = process.env[key] ?? "";
    return { key, value, set: value.length > 0 };
  });
}
