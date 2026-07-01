"use client";

import * as React from "react";
import { Info, Loader2, Search, Sparkles } from "lucide-react";

import type {
  MessageTemplate,
  TemplateButton,
  TemplateButtonType
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
import { cn } from "@/lib/utils";

type LibraryItem = {
  name: string;
  category?: string;
  language?: string;
  header?: string;
  body: string;
  footer?: string;
  buttons: Array<{ type: string; text?: string; url?: string; phone_number?: string }>;
  topic?: string;
  usecase?: string;
};

const BUTTON_TYPES: TemplateButtonType[] = [
  "QUICK_REPLY",
  "URL",
  "PHONE_NUMBER",
  "COPY_CODE"
];

function buttonType(value?: string): TemplateButtonType {
  const upper = (value || "").toUpperCase() as TemplateButtonType;
  return BUTTON_TYPES.includes(upper) ? upper : "QUICK_REPLY";
}

// Meta library placeholders can contain spaces (e.g. {{business name}}) which
// are invalid as custom named params — normalize them so the builder produces a
// valid, submittable template.
function sanitizeVars(text: string) {
  return text.replace(/{{\s*([^{}]+?)\s*}}/g, (_match, raw: string) => {
    const clean =
      String(raw)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "") || "value";
    return `{{${clean}}}`;
  });
}

function toTemplate(item: LibraryItem): MessageTemplate {
  const body = sanitizeVars(item.body || "");
  const headerText = item.header ? sanitizeVars(item.header) : undefined;
  const vars = Array.from(body.matchAll(/{{\s*([^{}\s]+)\s*}}/g))
    .map((match) => match[1])
    .filter((name, index, all) => all.indexOf(name) === index);
  const buttons: TemplateButton[] = (item.buttons ?? []).map((button) => ({
    type: buttonType(button.type),
    text: button.text || "",
    url: button.url,
    phoneNumber: button.phone_number
  }));

  return {
    _id: "",
    name: item.name,
    language: item.language || "en_US",
    category: item.category || "UTILITY",
    body,
    headerFormat: headerText ? "TEXT" : undefined,
    headerText,
    footer: item.footer,
    buttons,
    parameterFormat: "NAMED",
    parameters: vars.map((name) => ({ name, example: "" })),
    createdAt: new Date().toISOString()
  };
}

export function TemplateLibraryDialog({
  open,
  onOpenChange,
  language = "en_US",
  onPick
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  language?: string;
  onPick: (template: MessageTemplate) => void;
}) {
  const [category, setCategory] = React.useState("UTILITY");
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [items, setItems] = React.useState<LibraryItem[]>([]);
  const [note, setNote] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setNote("");
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ category, language });
        if (query) params.set("search", query);
        const response = await fetch(`/api/templates/library?${params.toString()}`);
        const body = await response.json();
        if (cancelled) return;
        setItems(Array.isArray(body.data) ? body.data : []);
        setNote(body.note || "");
      } catch {
        if (!cancelled) {
          setItems([]);
          setNote("Couldn't reach Meta's template library.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, category, query, language]);

  const visible = React.useMemo(() => {
    const term = query.toLowerCase().trim();
    if (!term) return items;
    return items.filter((item) =>
      `${item.name} ${item.body} ${item.topic || ""} ${item.usecase || ""}`
        .toLowerCase()
        .includes(term)
    );
  }, [items, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-moon-green/10 p-5">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-moon-rust" />
            Meta template library
          </DialogTitle>
          <DialogDescription>
            Start from a Meta-approved template, then customize and submit it as
            your own.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-3 border-b border-moon-green/10 p-4">
          <div className="flex items-center gap-1 rounded-lg border border-moon-green/12 bg-muted/60 p-1">
            {["UTILITY", "AUTHENTICATION"].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setCategory(option)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors",
                  category === option
                    ? "bg-card text-moon-ink shadow-sm"
                    : "text-muted-foreground hover:text-moon-ink"
                )}
              >
                {option.toLowerCase()}
              </button>
            ))}
          </div>
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-moon-ink/40" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the library"
              className="pl-9"
            />
          </div>
        </div>

        <div className="max-h-[calc(92vh-13rem)] overflow-y-auto p-4 moon-scrollbar">
          {note ? (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-moon-gold/25 bg-moon-yellow/25 px-3 py-2 text-xs text-moon-ink/75">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{note}</span>
            </div>
          ) : null}

          {loading ? (
            <div className="grid place-items-center py-16 text-sm text-muted-foreground">
              <Loader2 className="mb-2 h-6 w-6 animate-spin" />
              Loading Meta&apos;s library…
            </div>
          ) : visible.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {visible.map((item) => (
                <div
                  key={item.name}
                  className="flex flex-col rounded-xl border border-moon-green/12 bg-card p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="truncate text-sm font-semibold text-moon-ink">
                      {item.name}
                    </h4>
                    <Badge variant="secondary">{item.category || category}</Badge>
                  </div>
                  {item.header ? (
                    <p className="mt-2 text-xs font-semibold text-moon-ink/80">
                      {item.header}
                    </p>
                  ) : null}
                  <p className="mt-1 line-clamp-4 whitespace-pre-line text-xs text-muted-foreground">
                    {item.body}
                  </p>
                  <div className="mt-3 flex items-center justify-between">
                    {item.buttons?.length ? (
                      <span className="text-[11px] text-moon-ink/45">
                        {item.buttons.length} button
                        {item.buttons.length > 1 ? "s" : ""}
                      </span>
                    ) : (
                      <span />
                    )}
                    <Button
                      size="sm"
                      onClick={() => {
                        onPick(toTemplate(item));
                        onOpenChange(false);
                      }}
                    >
                      Use as starting point
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid place-items-center py-16 text-center text-sm text-muted-foreground">
              <Sparkles className="mb-2 h-6 w-6 text-moon-green/40" />
              {note
                ? "Create a template from scratch instead."
                : "No library templates match your search."}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
