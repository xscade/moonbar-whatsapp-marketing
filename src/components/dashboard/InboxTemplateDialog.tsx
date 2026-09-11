"use client";

import * as React from "react";
import { Loader2, Send, Upload } from "lucide-react";

import type { MessageTemplate } from "@/types/entities";
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
import { cn } from "@/lib/utils";
import { TemplatePreview, type TemplatePreviewData } from "./TemplatePreview";

export type InboxTemplateSend = {
  to: string;
  templateName: string;
  language: string;
  parameters: Record<string, string>;
  parameterOrder: string[];
  parameterFormat?: "NAMED" | "POSITIONAL";
  headerImageId?: string;
  contactName?: string;
};

export function InboxTemplateDialog({
  open,
  onOpenChange,
  templates,
  phone,
  contactName,
  sending,
  onSend
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: MessageTemplate[];
  phone: string;
  contactName?: string;
  sending: boolean;
  onSend: (input: InboxTemplateSend) => Promise<boolean>;
}) {
  const approved = React.useMemo(
    () => templates.filter((t) => (t.status || "").toUpperCase() === "APPROVED"),
    [templates]
  );

  const [selectedName, setSelectedName] = React.useState("");
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [headerImageId, setHeaderImageId] = React.useState("");
  const [headerPreviewUrl, setHeaderPreviewUrl] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const selected = approved.find((t) => t.name === selectedName) || null;

  React.useEffect(() => {
    if (!open) return;
    setSelectedName(approved[0]?.name || "");
  }, [open, approved]);

  React.useEffect(() => {
    setHeaderImageId("");
    setHeaderPreviewUrl("");
    if (!selected) {
      setValues({});
      return;
    }
    const seed: Record<string, string> = {};
    for (const param of selected.parameters ?? []) {
      seed[param.name] = param.example || "";
    }
    setValues(seed);
  }, [selectedName]); // eslint-disable-line react-hooks/exhaustive-deps

  const needsImage = selected?.headerFormat === "IMAGE";
  const missing = selected
    ? (selected.parameters ?? [])
        .filter((param) => !values[param.name]?.trim())
        .map((param) => param.name)
    : [];
  const canSend =
    !!selected &&
    missing.length === 0 &&
    (!needsImage || !!headerImageId) &&
    !sending &&
    !uploading;

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/media/upload", {
        method: "POST",
        body: formData
      });
      const body = await response.json();
      if (response.ok && body.id) {
        setHeaderImageId(body.id);
        setHeaderPreviewUrl(URL.createObjectURL(file));
      }
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (!selected) return;
    const ok = await onSend({
      to: phone,
      templateName: selected.name,
      language: selected.language,
      parameters: values,
      parameterOrder: (selected.parameters ?? []).map((param) => param.name),
      parameterFormat: selected.parameterFormat,
      headerImageId: needsImage ? headerImageId : undefined,
      contactName
    });
    if (ok) onOpenChange(false);
  }

  const previewData: TemplatePreviewData = selected
    ? {
        headerType: !selected.headerFormat
          ? "none"
          : selected.headerFormat === "TEXT"
            ? "text"
            : (selected.headerFormat.toLowerCase() as TemplatePreviewData["headerType"]),
        headerText: selected.headerText,
        headerMediaUrl: headerPreviewUrl,
        body: selected.body,
        footer: selected.footer,
        buttons: selected.buttons,
        samples: values
      }
    : { body: "" };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-moon-green/10 p-5">
          <DialogTitle>Send a template</DialogTitle>
          <DialogDescription>To {contactName || `+${phone}`}</DialogDescription>
        </DialogHeader>

        {approved.length ? (
          <div className="grid md:grid-cols-[1.2fr_1fr]">
            <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5 moon-scrollbar">
              <div className="grid gap-2">
                <Label>Template</Label>
                <Select value={selectedName} onValueChange={setSelectedName}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a template" />
                  </SelectTrigger>
                  <SelectContent className="z-[120]">
                    {approved.map((template) => (
                      <SelectItem
                        key={`${template.name}-${template.language}`}
                        value={template.name}
                      >
                        {template.name} ({template.language})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {needsImage ? (
                <div className="grid gap-2">
                  <Label>Header image</Label>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUpload(file);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
                    {headerImageId ? "Image ready ✓" : "Upload header image"}
                  </Button>
                </div>
              ) : null}

              {selected?.parameters?.length ? (
                <div className="grid gap-2">
                  <Label>Values</Label>
                  {selected.parameters.map((param) => (
                    <div key={param.name} className="grid gap-1">
                      <span className="text-xs font-medium text-moon-ink">
                        {`{{${param.name}}}`}
                      </span>
                      <Input
                        value={values[param.name] || ""}
                        placeholder={param.example || param.name}
                        className="h-9"
                        onChange={(e) =>
                          setValues((current) => ({
                            ...current,
                            [param.name]: e.target.value
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="hidden border-l border-moon-green/10 bg-muted/30 p-5 md:block">
              <p className="mb-2 text-sm font-semibold text-moon-ink">Preview</p>
              <TemplatePreview data={previewData} />
            </div>
          </div>
        ) : (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No approved templates yet. Create one and wait for Meta approval to
            send it here.
          </div>
        )}

        <div
          className={cn(
            "flex items-center justify-end gap-2 border-t border-moon-green/10 p-4"
          )}
        >
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSend}>
            {sending ? <Loader2 className="animate-spin" /> : <Send />}
            Send template
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
