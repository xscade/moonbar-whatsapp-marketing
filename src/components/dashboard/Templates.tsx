"use client";

import type { FormEvent } from "react";
import { motion } from "motion/react";
import { Loader2, Plus, RefreshCw, Tag } from "lucide-react";

import type { MessageTemplate } from "@/types/entities";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { staggerContainer } from "@/lib/motion";
import { Section } from "./Section";

const nativeSelect =
  "flex h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-moon-ink shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

export function Templates({
  templates,
  busy,
  onSync,
  onCreate
}: {
  templates: MessageTemplate[];
  busy: string;
  onSync: () => void;
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="grid gap-6 xl:grid-cols-[1.22fr_0.78fr]"
    >
      <Section
        title="Template library"
        description="Synced from Meta WhatsApp Manager"
        action={
          <Button size="sm" onClick={onSync} disabled={busy === "sync"}>
            <RefreshCw className={busy === "sync" ? "animate-spin" : ""} />
            Sync Meta
          </Button>
        }
      >
        <div className="grid gap-3">
          {templates.map((template) => (
            <div
              key={`${template.name}-${template.language}`}
              className="rounded-xl border border-moon-green/12 bg-card p-4 transition-colors hover:border-moon-green/25"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-semibold text-moon-ink">{template.name}</h3>
                <div className="flex gap-2">
                  <Badge variant="secondary">{template.language}</Badge>
                  <Badge variant="warning">{template.status || "LOCAL"}</Badge>
                </div>
              </div>
              <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">
                {template.body}
              </p>
              {template.parameters.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {template.parameters.map((parameter) => (
                    <span
                      key={parameter.name}
                      className="inline-flex items-center gap-1 rounded-md border border-moon-green/15 px-2 py-1 text-xs text-moon-green"
                    >
                      <Tag className="h-3 w-3" />
                      {parameter.name}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          {!templates.length ? (
            <p className="rounded-xl border border-dashed border-moon-green/20 bg-muted/40 p-4 text-sm text-muted-foreground">
              No templates yet — sync from Meta to import them.
            </p>
          ) : null}
        </div>
      </Section>

      <Section title="Save manual template" description="Store a local reference">
        <form onSubmit={onCreate} className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="t-name">Name</Label>
            <Input id="t-name" name="name" required placeholder="template_name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="t-language">Language</Label>
              <Input id="t-language" name="language" defaultValue="en_US" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="t-category">Category</Label>
              <select id="t-category" name="category" className={nativeSelect} defaultValue="UTILITY">
                <option value="UTILITY">Utility</option>
                <option value="MARKETING">Marketing</option>
                <option value="AUTHENTICATION">Authentication</option>
              </select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="t-body">Body</Label>
            <Textarea
              id="t-body"
              name="body"
              className="min-h-32"
              placeholder="Template body with {{parameter}} values"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="t-params">Parameters</Label>
            <Input id="t-params" name="parameters" placeholder="djname, day, date, time" />
          </div>
          <Button
            type="submit"
            className="justify-center"
            disabled={busy === "template"}
          >
            {busy === "template" ? <Loader2 className="animate-spin" /> : <Plus />}
            Save template
          </Button>
        </form>
      </Section>
    </motion.div>
  );
}
