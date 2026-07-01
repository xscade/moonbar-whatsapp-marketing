import type { TemplateButton, TemplateBuilderPayload } from "@/types/entities";

type MetaButton = {
  type: string;
  text?: string;
  url?: string;
  phone_number?: string;
  example?: string[] | string;
};

type MetaComponent = {
  type: string;
  format?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION";
  text?: string;
  example?: {
    header_handle?: string[];
    header_text?: string[];
    header_text_named_params?: Array<{ param_name: string; example?: string }>;
    body_text_named_params?: Array<{ param_name: string; example?: string }>;
    body_text?: string[][];
  };
  buttons?: MetaButton[];
};

export type MetaTemplate = {
  id: string;
  name: string;
  language: string;
  category?: string;
  status?: string;
  quality_score?: { score?: string };
  parameter_format?: "NAMED" | "POSITIONAL";
  components?: MetaComponent[];
};

// Unique {{named}} variables in the order they appear.
export function namedVariables(text?: string): string[] {
  return Array.from((text ?? "").matchAll(/{{\s*([^{}\s]+)\s*}}/g))
    .map((match) => match[1])
    .filter((name, index, all) => all.indexOf(name) === index);
}

function mapMetaButtons(buttons?: MetaButton[]): TemplateButton[] {
  return (buttons ?? []).map((button) => {
    const type = (button.type || "").toUpperCase();
    const example = Array.isArray(button.example)
      ? button.example[0]
      : button.example;
    if (type === "URL") {
      return { type: "URL", text: button.text || "", url: button.url, example };
    }
    if (type === "PHONE_NUMBER") {
      return {
        type: "PHONE_NUMBER",
        text: button.text || "",
        phoneNumber: button.phone_number
      };
    }
    if (type === "COPY_CODE") {
      return { type: "COPY_CODE", text: button.text || "Copy code", example };
    }
    return { type: "QUICK_REPLY", text: button.text || "" };
  });
}

export function extractTemplate(template: MetaTemplate) {
  const components = template.components ?? [];
  const header = components.find((component) => component.type === "HEADER");
  const body = components.find((component) => component.type === "BODY");
  const footer = components.find((component) => component.type === "FOOTER");
  const buttonsComponent = components.find(
    (component) => component.type === "BUTTONS"
  );

  const named = body?.example?.body_text_named_params ?? [];
  const positional = body?.example?.body_text?.[0] ?? [];
  const bodyTextParams = namedVariables(body?.text);
  const parameterFormat =
    template.parameter_format ||
    (named.length || bodyTextParams.length ? "NAMED" : "POSITIONAL");

  return {
    metaId: template.id,
    name: template.name,
    language: template.language,
    category: template.category,
    status: template.status,
    qualityScore: template.quality_score?.score,
    body: body?.text,
    headerFormat: header?.format,
    headerText: header?.format === "TEXT" ? header?.text : undefined,
    headerMediaUrl: header?.example?.header_handle?.[0],
    footer: footer?.text,
    buttons: mapMetaButtons(buttonsComponent?.buttons),
    parameterFormat,
    parameters: named.length
      ? named.map((param) => ({ name: param.param_name, example: param.example }))
      : bodyTextParams.length
        ? bodyTextParams.map((name) => ({ name }))
        : positional.map((example, index) => ({ name: String(index + 1), example }))
  };
}

// Converts the flat builder payload into Meta's `components` array (NAMED format).
export function buildTemplateComponents(payload: TemplateBuilderPayload) {
  const components: Array<Record<string, unknown>> = [];
  const samples = payload.samples ?? {};

  if (payload.headerType === "text" && payload.headerText?.trim()) {
    const vars = namedVariables(payload.headerText);
    const header: Record<string, unknown> = {
      type: "HEADER",
      format: "TEXT",
      text: payload.headerText
    };
    if (vars.length) {
      header.example = {
        header_text_named_params: vars.map((name) => ({
          param_name: name,
          example: samples[name] || name
        }))
      };
    }
    components.push(header);
  } else if (
    (payload.headerType === "image" ||
      payload.headerType === "video" ||
      payload.headerType === "document") &&
    payload.headerHandle
  ) {
    components.push({
      type: "HEADER",
      format: payload.headerType.toUpperCase(),
      example: { header_handle: [payload.headerHandle] }
    });
  }

  const bodyVars = namedVariables(payload.body);
  const body: Record<string, unknown> = { type: "BODY", text: payload.body };
  if (bodyVars.length) {
    body.example = {
      body_text_named_params: bodyVars.map((name) => ({
        param_name: name,
        example: samples[name] || name
      }))
    };
  }
  components.push(body);

  if (payload.footer?.trim()) {
    components.push({ type: "FOOTER", text: payload.footer });
  }

  const buttons = (payload.buttons ?? [])
    .filter((button) => button.text?.trim() || button.type === "COPY_CODE")
    .map((button) => {
      if (button.type === "URL") {
        const entry: Record<string, unknown> = {
          type: "URL",
          text: button.text,
          url: button.url
        };
        if (button.url && /{{\s*[^{}]+\s*}}/.test(button.url) && button.example) {
          entry.example = [button.example];
        }
        return entry;
      }
      if (button.type === "PHONE_NUMBER") {
        return {
          type: "PHONE_NUMBER",
          text: button.text,
          phone_number: button.phoneNumber
        };
      }
      if (button.type === "COPY_CODE") {
        return { type: "COPY_CODE", example: button.example || button.text };
      }
      return { type: "QUICK_REPLY", text: button.text };
    });
  if (buttons.length) {
    components.push({ type: "BUTTONS", buttons });
  }

  return components;
}

// Builds the local `message_templates` document from a builder payload, matching
// the shape produced by extractTemplate so browse/preview stay consistent.
export function templateDocFromPayload(
  payload: TemplateBuilderPayload,
  meta: { metaId?: string; status?: string }
) {
  const samples = payload.samples ?? {};
  const headerFormat =
    payload.headerType === "none"
      ? undefined
      : payload.headerType === "text"
        ? "TEXT"
        : (payload.headerType.toUpperCase() as "IMAGE" | "VIDEO" | "DOCUMENT");

  return {
    metaId: meta.metaId,
    name: payload.name,
    language: payload.language,
    category: payload.category,
    status: meta.status,
    body: payload.body,
    headerFormat,
    headerText: payload.headerType === "text" ? payload.headerText : undefined,
    footer: payload.footer || undefined,
    buttons: payload.buttons ?? [],
    parameterFormat: "NAMED" as const,
    parameters: namedVariables(payload.body).map((name) => ({
      name,
      example: samples[name]
    }))
  };
}
