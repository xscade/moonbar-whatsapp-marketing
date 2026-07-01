"use client";

import * as React from "react";
import { motion } from "motion/react";
import {
  Copy,
  Loader2,
  MessageSquarePlus,
  Pencil,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  Trash2
} from "lucide-react";

import type { MessageTemplate, TemplateBuilderPayload } from "@/types/entities";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { staggerContainer } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Section } from "./Section";
import { TemplateBuilder } from "./TemplateBuilder";
import { TemplateLibraryDialog } from "./TemplateLibraryDialog";
import { TemplatePreview, type TemplatePreviewData } from "./TemplatePreview";

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "approved", label: "Approved" },
  { key: "pending", label: "Pending" },
  { key: "rejected", label: "Rejected" }
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]["key"];

const EDITABLE = ["APPROVED", "REJECTED", "PAUSED"];

function statusVariant(
  status?: string
): "success" | "warning" | "destructive" | "muted" {
  const value = (status || "").toUpperCase();
  if (value === "APPROVED") return "success";
  if (value === "PENDING" || value === "IN_APPEAL" || value === "PENDING_DELETION")
    return "warning";
  if (["REJECTED", "DISABLED", "PAUSED"].includes(value)) return "destructive";
  return "muted";
}

function statusGroup(status?: string): StatusFilter {
  const value = (status || "").toUpperCase();
  if (value === "APPROVED") return "approved";
  if (["REJECTED", "DISABLED", "PAUSED"].includes(value)) return "rejected";
  if (value === "PENDING" || value === "IN_APPEAL") return "pending";
  return "all";
}

function toPreview(template: MessageTemplate): TemplatePreviewData {
  const samples: Record<string, string> = {};
  for (const param of template.parameters ?? []) {
    if (param.example) samples[param.name] = param.example;
  }
  const headerType = !template.headerFormat
    ? "none"
    : template.headerFormat === "TEXT"
      ? "text"
      : (template.headerFormat.toLowerCase() as TemplatePreviewData["headerType"]);
  return {
    headerType,
    headerText: template.headerText,
    body: template.body,
    footer: template.footer,
    buttons: template.buttons,
    samples
  };
}

export function Templates({
  templates,
  busy,
  onSync,
  onSubmitTemplate,
  onDeleteTemplate,
  onUploadTemplateMedia
}: {
  templates: MessageTemplate[];
  busy: string;
  onSync: () => void;
  onSubmitTemplate: (
    payload: TemplateBuilderPayload,
    id?: string
  ) => Promise<boolean>;
  onDeleteTemplate: (template: MessageTemplate) => void;
  onUploadTemplateMedia: (
    file: File
  ) => Promise<{ handle: string; filename: string } | null>;
}) {
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<StatusFilter>("all");
  const [builderOpen, setBuilderOpen] = React.useState(false);
  const [libraryOpen, setLibraryOpen] = React.useState(false);
  const [mode, setMode] = React.useState<"create" | "edit">("create");
  const [editing, setEditing] = React.useState<MessageTemplate | null>(null);
  const [initial, setInitial] = React.useState<MessageTemplate | null>(null);

  const filtered = React.useMemo(() => {
    const term = query.toLowerCase().trim();
    return templates.filter((template) => {
      if (filter !== "all" && statusGroup(template.status) !== filter) return false;
      if (!term) return true;
      return [template.name, template.body, template.category]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [templates, query, filter]);

  function openCreate() {
    setMode("create");
    setEditing(null);
    setInitial(null);
    setBuilderOpen(true);
  }

  function openEdit(template: MessageTemplate) {
    setMode("edit");
    setEditing(template);
    setInitial(template);
    setBuilderOpen(true);
  }

  function openDuplicate(template: MessageTemplate) {
    setMode("create");
    setEditing(null);
    setInitial({ ...template, name: `${template.name}_copy`, metaId: undefined });
    setBuilderOpen(true);
  }

  function useLibraryTemplate(template: MessageTemplate) {
    setMode("create");
    setEditing(null);
    setInitial(template);
    setBuilderOpen(true);
  }

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      <Section
        title="Templates"
        description="Browse, create, edit and submit templates to Meta — no WhatsApp Manager needed"
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onSync} disabled={busy === "sync"}>
              <RefreshCw className={busy === "sync" ? "animate-spin" : ""} />
              Sync
            </Button>
            <Button variant="outline" size="sm" onClick={() => setLibraryOpen(true)}>
              <Sparkles />
              Library
            </Button>
            <Button size="sm" onClick={openCreate}>
              <MessageSquarePlus />
              New template
            </Button>
          </div>
        }
      >
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-moon-ink/40" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search templates"
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-moon-green/12 bg-muted/60 p-1">
            {STATUS_FILTERS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setFilter(option.key)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  filter === option.key
                    ? "bg-card text-moon-ink shadow-sm"
                    : "text-muted-foreground hover:text-moon-ink"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4">
          {filtered.map((template) => {
            const editable =
              !template.metaId ||
              !template.status ||
              EDITABLE.includes(template.status.toUpperCase());
            const deleting = busy === `delete-template-${template._id}`;
            return (
              <div
                key={template._id}
                className="grid gap-4 rounded-xl border border-moon-green/12 bg-card p-4 lg:grid-cols-[1.5fr_1fr]"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-moon-ink">{template.name}</h3>
                    <Badge variant={statusVariant(template.status)}>
                      {template.status || "LOCAL"}
                    </Badge>
                    {template.category ? (
                      <Badge variant="secondary">{template.category}</Badge>
                    ) : null}
                    <Badge variant="outline">{template.language}</Badge>
                  </div>

                  <p className="mt-3 line-clamp-3 whitespace-pre-line text-sm text-muted-foreground">
                    {template.body}
                  </p>

                  {template.parameters?.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {template.parameters.map((param) => (
                        <span
                          key={param.name}
                          className="inline-flex items-center gap-1 rounded-md border border-moon-green/15 px-2 py-1 text-xs text-moon-green"
                        >
                          <Tag className="h-3 w-3" />
                          {param.name}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEdit(template)}
                      disabled={!editable}
                      title={
                        editable
                          ? "Edit template"
                          : "Templates can only be edited while Approved, Rejected or Paused"
                      }
                    >
                      <Pencil />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openDuplicate(template)}
                    >
                      <Copy />
                      Duplicate
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-moon-red hover:bg-moon-red/10 hover:text-moon-red"
                      onClick={() => onDeleteTemplate(template)}
                      disabled={deleting}
                    >
                      {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
                      Delete
                    </Button>
                  </div>
                </div>

                <div className="hidden justify-end lg:flex">
                  <TemplatePreview data={toPreview(template)} className="w-full" />
                </div>
              </div>
            );
          })}

          {!filtered.length ? (
            <div className="grid place-items-center rounded-xl border border-dashed border-moon-green/20 bg-muted/40 p-10 text-center">
              <MessageSquarePlus className="mb-2 h-7 w-7 text-moon-green/50" />
              <p className="text-sm text-muted-foreground">
                {templates.length
                  ? "No templates match your filter."
                  : "No templates yet — create one or sync from Meta."}
              </p>
            </div>
          ) : null}
        </div>
      </Section>

      <TemplateBuilder
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        mode={mode}
        initial={initial}
        submitting={busy === "template"}
        onSubmit={(payload) => onSubmitTemplate(payload, editing?._id)}
        onUploadMedia={onUploadTemplateMedia}
      />

      <TemplateLibraryDialog
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        onPick={useLibraryTemplate}
      />
    </motion.div>
  );
}
