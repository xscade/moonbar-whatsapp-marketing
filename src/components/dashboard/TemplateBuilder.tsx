"use client";

import * as React from "react";
import { Loader2, Plus, Trash2, Upload, Variable } from "lucide-react";

import type {
  MessageTemplate,
  TemplateButton,
  TemplateButtonType,
  TemplateBuilderPayload,
  TemplateCategory,
  TemplateHeaderType
} from "@/types/entities";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { TemplatePreview } from "./TemplatePreview";

const LANGUAGES = [
  ["en_US", "English (US)"],
  ["en_GB", "English (UK)"],
  ["en", "English"],
  ["hi", "Hindi"],
  ["hi_IN", "Hindi (India)"],
  ["te", "Telugu"],
  ["ta", "Tamil"],
  ["es", "Spanish"],
  ["pt_BR", "Portuguese (BR)"],
  ["ar", "Arabic"],
  ["fr", "French"],
  ["de", "German"],
  ["id", "Indonesian"]
] as const;

const BUTTON_LABELS: Record<TemplateButtonType, string> = {
  QUICK_REPLY: "Quick reply",
  URL: "Visit website",
  PHONE_NUMBER: "Call phone number",
  COPY_CODE: "Copy offer code"
};

function namedVars(text: string): string[] {
  return Array.from(text.matchAll(/{{\s*([^{}\s]+)\s*}}/g))
    .map((match) => match[1])
    .filter((name, index, all) => all.indexOf(name) === index);
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_");
}

type BuilderState = {
  name: string;
  language: string;
  category: TemplateCategory;
  headerType: TemplateHeaderType;
  headerText: string;
  headerHandle: string;
  headerFilename: string;
  body: string;
  samples: Record<string, string>;
  footer: string;
  buttons: TemplateButton[];
};

const EMPTY: BuilderState = {
  name: "",
  language: "en_US",
  category: "MARKETING",
  headerType: "none",
  headerText: "",
  headerHandle: "",
  headerFilename: "",
  body: "",
  samples: {},
  footer: "",
  buttons: []
};

function fromTemplate(template: MessageTemplate): BuilderState {
  const headerType: TemplateHeaderType = !template.headerFormat
    ? "none"
    : template.headerFormat === "TEXT"
      ? "text"
      : (template.headerFormat.toLowerCase() as TemplateHeaderType);
  const samples: Record<string, string> = {};
  for (const param of template.parameters ?? []) {
    if (param.example) samples[param.name] = param.example;
  }
  return {
    name: template.name,
    language: template.language,
    category: (template.category as TemplateCategory) || "MARKETING",
    headerType,
    headerText: template.headerText || "",
    headerHandle: "",
    headerFilename: "",
    body: template.body || "",
    samples,
    footer: template.footer || "",
    buttons: template.buttons ? template.buttons.map((b) => ({ ...b })) : []
  };
}

export function TemplateBuilder({
  open,
  onOpenChange,
  mode,
  initial,
  submitting,
  onSubmit,
  onUploadMedia
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initial?: MessageTemplate | null;
  submitting: boolean;
  onSubmit: (payload: TemplateBuilderPayload) => Promise<boolean>;
  onUploadMedia: (
    file: File
  ) => Promise<{ handle: string; filename: string } | null>;
}) {
  const [state, setState] = React.useState<BuilderState>(EMPTY);
  const [uploading, setUploading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    setState(initial ? fromTemplate(initial) : EMPTY);
  }, [open, initial]);

  const set = <K extends keyof BuilderState>(key: K, value: BuilderState[K]) =>
    setState((prev) => ({ ...prev, [key]: value }));

  const variables = React.useMemo(() => {
    const fromHeader = state.headerType === "text" ? namedVars(state.headerText) : [];
    return [...fromHeader, ...namedVars(state.body)].filter(
      (name, index, all) => all.indexOf(name) === index
    );
  }, [state.headerType, state.headerText, state.body]);

  const isMediaHeader =
    state.headerType === "image" ||
    state.headerType === "video" ||
    state.headerType === "document";
  const nameLocked = mode === "edit";

  const missingSamples = variables.filter((name) => !state.samples[name]?.trim());
  const needsMedia = isMediaHeader && !state.headerHandle;
  const canSubmit =
    state.name.trim().length > 0 &&
    state.body.trim().length > 0 &&
    missingSamples.length === 0 &&
    !needsMedia &&
    !submitting &&
    !uploading;

  function addVariable() {
    const next = `var${variables.length + 1}`;
    set("body", `${state.body}{{${next}}}`);
  }

  async function handleMedia(file: File) {
    setUploading(true);
    try {
      const result = await onUploadMedia(file);
      if (result) {
        setState((prev) => ({
          ...prev,
          headerHandle: result.handle,
          headerFilename: result.filename
        }));
      }
    } finally {
      setUploading(false);
    }
  }

  function updateButton(index: number, patch: Partial<TemplateButton>) {
    setState((prev) => ({
      ...prev,
      buttons: prev.buttons.map((button, i) =>
        i === index ? { ...button, ...patch } : button
      )
    }));
  }

  function addButton() {
    setState((prev) => ({
      ...prev,
      buttons: [...prev.buttons, { type: "QUICK_REPLY", text: "" }]
    }));
  }

  async function submit() {
    const payload: TemplateBuilderPayload = {
      name: state.name,
      language: state.language,
      category: state.category,
      headerType: state.headerType,
      headerText: state.headerType === "text" ? state.headerText : undefined,
      headerHandle: isMediaHeader ? state.headerHandle : undefined,
      headerFilename: isMediaHeader ? state.headerFilename : undefined,
      body: state.body,
      samples: state.samples,
      footer: state.footer || undefined,
      buttons: state.buttons
    };
    const ok = await onSubmit(payload);
    if (ok) onOpenChange(false);
  }

  const mediaAccept =
    state.headerType === "image"
      ? "image/*"
      : state.headerType === "video"
        ? "video/*"
        : "application/pdf";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] max-w-5xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-moon-green/10 p-5">
          <DialogTitle>
            {mode === "edit" ? "Edit template" : "New template"}
          </DialogTitle>
          <DialogDescription>
            Build a WhatsApp template and submit it to Meta for approval.
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[calc(94vh-9rem)] md:grid-cols-[1.4fr_1fr]">
          {/* Form */}
          <div className="space-y-5 overflow-y-auto p-5 moon-scrollbar">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="tpl-name">Template name</Label>
                <Input
                  id="tpl-name"
                  value={state.name}
                  disabled={nameLocked}
                  placeholder="weekend_event_reminder"
                  onChange={(e) => set("name", normalizeName(e.target.value))}
                />
              </div>
              <div className="grid gap-2">
                <Label>Category</Label>
                <Select
                  value={state.category}
                  onValueChange={(v) => set("category", v as TemplateCategory)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MARKETING">Marketing</SelectItem>
                    <SelectItem value="UTILITY">Utility</SelectItem>
                    <SelectItem value="AUTHENTICATION">Authentication</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Language</Label>
              <Select
                value={state.language}
                onValueChange={(v) => set("language", v)}
                disabled={nameLocked}
              >
                <SelectTrigger className="sm:w-1/2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map(([code, label]) => (
                    <SelectItem key={code} value={code}>
                      {label} · {code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Header */}
            <div className="grid gap-2 rounded-lg border border-moon-green/12 p-3.5">
              <div className="flex items-center justify-between">
                <Label>Header</Label>
                <span className="text-xs text-muted-foreground">Optional</span>
              </div>
              <Select
                value={state.headerType}
                onValueChange={(v) => set("headerType", v as TemplateHeaderType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="image">Image</SelectItem>
                  <SelectItem value="video">Video</SelectItem>
                  <SelectItem value="document">Document</SelectItem>
                </SelectContent>
              </Select>

              {state.headerType === "text" ? (
                <Input
                  value={state.headerText}
                  maxLength={60}
                  placeholder="Header text (max 60 chars, 1 variable allowed)"
                  onChange={(e) => set("headerText", e.target.value)}
                />
              ) : null}

              {isMediaHeader ? (
                <div className="grid gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept={mediaAccept}
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleMedia(file);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
                    {state.headerFilename
                      ? `Sample: ${state.headerFilename}`
                      : `Upload sample ${state.headerType}`}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Meta requires a sample file to review media templates.
                  </p>
                </div>
              ) : null}
            </div>

            {/* Body */}
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="tpl-body">Body</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7"
                  onClick={addVariable}
                >
                  <Variable className="h-3.5 w-3.5" />
                  Add variable
                </Button>
              </div>
              <Textarea
                id="tpl-body"
                value={state.body}
                maxLength={1024}
                className="min-h-32"
                placeholder="Hey {{name}}, you're invited to our event this {{day}}!"
                onChange={(e) => set("body", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Wrap variables in double braces, e.g. <code>{"{{name}}"}</code>.
              </p>
            </div>

            {/* Variable samples */}
            {variables.length ? (
              <div className="grid gap-2 rounded-lg border border-moon-green/12 bg-muted/40 p-3.5">
                <Label>Sample values</Label>
                <p className="text-xs text-muted-foreground">
                  Meta uses these to review your template.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {variables.map((name) => (
                    <div key={name} className="grid gap-1">
                      <span className="text-xs font-medium text-moon-ink">
                        {`{{${name}}}`}
                      </span>
                      <Input
                        value={state.samples[name] || ""}
                        placeholder={`Example for ${name}`}
                        className="h-9"
                        onChange={(e) =>
                          set("samples", { ...state.samples, [name]: e.target.value })
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Footer */}
            <div className="grid gap-2">
              <Label htmlFor="tpl-footer">Footer</Label>
              <Input
                id="tpl-footer"
                value={state.footer}
                maxLength={60}
                placeholder="Reply STOP to opt out"
                onChange={(e) => set("footer", e.target.value)}
              />
            </div>

            {/* Buttons */}
            <div className="grid gap-3 rounded-lg border border-moon-green/12 p-3.5">
              <div className="flex items-center justify-between">
                <Label>Buttons</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7"
                  onClick={addButton}
                  disabled={state.buttons.length >= 5}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add button
                </Button>
              </div>
              {state.buttons.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Add quick-reply or call-to-action buttons (optional).
                </p>
              ) : null}
              {state.buttons.map((button, index) => (
                <div
                  key={index}
                  className="grid gap-2 rounded-lg border border-moon-green/10 bg-card p-3"
                >
                  <div className="flex items-center gap-2">
                    <Select
                      value={button.type}
                      onValueChange={(v) =>
                        updateButton(index, { type: v as TemplateButtonType })
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(BUTTON_LABELS) as TemplateButtonType[]).map(
                          (type) => (
                            <SelectItem key={type} value={type}>
                              {BUTTON_LABELS[type]}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 text-moon-red hover:bg-moon-red/10 hover:text-moon-red"
                      onClick={() =>
                        setState((prev) => ({
                          ...prev,
                          buttons: prev.buttons.filter((_, i) => i !== index)
                        }))
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>

                  {button.type !== "COPY_CODE" ? (
                    <Input
                      value={button.text}
                      placeholder="Button label"
                      className="h-9"
                      maxLength={25}
                      onChange={(e) => updateButton(index, { text: e.target.value })}
                    />
                  ) : null}

                  {button.type === "URL" ? (
                    <Input
                      value={button.url || ""}
                      placeholder="https://moonbar.in/{{path}}"
                      className="h-9"
                      onChange={(e) => updateButton(index, { url: e.target.value })}
                    />
                  ) : null}
                  {button.type === "URL" && /{{\s*[^{}]+\s*}}/.test(button.url || "") ? (
                    <Input
                      value={button.example || ""}
                      placeholder="Example URL, e.g. https://moonbar.in/summer"
                      className="h-9"
                      onChange={(e) => updateButton(index, { example: e.target.value })}
                    />
                  ) : null}
                  {button.type === "PHONE_NUMBER" ? (
                    <Input
                      value={button.phoneNumber || ""}
                      placeholder="+91 98765 43210"
                      className="h-9"
                      onChange={(e) =>
                        updateButton(index, { phoneNumber: e.target.value })
                      }
                    />
                  ) : null}
                  {button.type === "COPY_CODE" ? (
                    <Input
                      value={button.example || ""}
                      placeholder="Offer code, e.g. MOON25"
                      className="h-9"
                      onChange={(e) => updateButton(index, { example: e.target.value })}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="hidden flex-col gap-3 border-l border-moon-green/10 bg-muted/30 p-5 md:flex">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-moon-ink">Preview</p>
              <Badge variant="secondary">{state.category}</Badge>
            </div>
            <TemplatePreview
              data={{
                headerType: state.headerType,
                headerText: state.headerText,
                headerFilename: state.headerFilename,
                body: state.body,
                footer: state.footer,
                buttons: state.buttons,
                samples: state.samples
              }}
            />
            {needsMedia ? (
              <p className="text-xs text-moon-red">Upload a sample file to continue.</p>
            ) : null}
            {missingSamples.length ? (
              <p className="text-xs text-moon-red">
                Add sample values for: {missingSamples.join(", ")}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-moon-green/10 p-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {submitting ? <Loader2 className="animate-spin" /> : null}
            {mode === "edit" ? "Save & resubmit" : "Submit for approval"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
