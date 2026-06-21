export function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function graphBaseUrl() {
  return process.env.WHATSAPP_GRAPH_BASE_URL || "https://graph.facebook.com";
}

export function graphVersion() {
  return process.env.WHATSAPP_GRAPH_API_VERSION || "v25.0";
}

export function graphUrl(path: string) {
  return `${graphBaseUrl()}/${graphVersion()}/${path.replace(/^\//, "")}`;
}
