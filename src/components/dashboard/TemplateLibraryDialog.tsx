"use client";

import * as React from "react";
import { Search, Sparkles } from "lucide-react";

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
import { LIBRARY_TEMPLATES, type LibraryTemplate } from "./templateLibraryData";

const CATEGORIES: Array<{ key: LibraryTemplate["category"]; label: string }> = [
  { key: "MARKETING", label: "Marketing" },
  { key: "UTILITY", label: "Utility" }
];

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

function toTemplate(item: LibraryTemplate): MessageTemplate {
  const vars = Array.from(item.body.matchAll(/{{\s*([^{}\s]+)\s*}}/g))
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
    language: "en_US",
    category: item.category,
    body: item.body,
    headerFormat: item.header ? "TEXT" : undefined,
    headerText: item.header,
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
  onPick
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (template: MessageTemplate) => void;
}) {
  const [category, setCategory] =
    React.useState<LibraryTemplate["category"]>("MARKETING");
  const [query, setQuery] = React.useState("");

  const visible = React.useMemo(() => {
    const term = query.toLowerCase().trim();
    return LIBRARY_TEMPLATES.filter((item) => {
      if (item.category !== category) return false;
      if (!term) return true;
      return `${item.name} ${item.body} ${item.description}`
        .toLowerCase()
        .includes(term);
    });
  }, [category, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-moon-green/10 p-5">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-moon-rust" />
            Template library
          </DialogTitle>
          <DialogDescription>
            Start from a ready-made template, then customize and submit it as your
            own.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-3 border-b border-moon-green/10 p-4">
          <div className="flex items-center gap-1 rounded-lg border border-moon-green/12 bg-muted/60 p-1">
            {CATEGORIES.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setCategory(option.key)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  category === option.key
                    ? "bg-card text-moon-ink shadow-sm"
                    : "text-muted-foreground hover:text-moon-ink"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-moon-ink/40" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search templates"
              className="pl-9"
            />
          </div>
        </div>

        <div className="max-h-[calc(92vh-13rem)] overflow-y-auto p-4 moon-scrollbar">
          {visible.length ? (
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
                    <Badge variant="secondary">{item.category}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.description}
                  </p>
                  {item.header ? (
                    <p className="mt-2 text-xs font-semibold text-moon-ink/80">
                      {item.header}
                    </p>
                  ) : null}
                  <p className="mt-1 line-clamp-4 flex-1 whitespace-pre-line text-xs text-muted-foreground">
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
              No templates match your search.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
