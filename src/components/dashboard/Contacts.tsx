"use client";

import type { FormEvent } from "react";
import { motion } from "motion/react";
import { Loader2, Plus, Search, Trash2, X } from "lucide-react";

import type { Contact, ContactList } from "@/types/entities";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { staggerContainer } from "@/lib/motion";
import { Section } from "./Section";

const nativeSelect =
  "flex h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-moon-ink shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

export function Contacts(props: {
  contacts: Contact[];
  lists: ContactList[];
  search: string;
  setSearch: (value: string) => void;
  busy: string;
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
  onDelete: (id: string) => void;
  onRemoveTag: (contact: Contact, tag: string) => void;
}) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="grid gap-6 xl:grid-cols-[0.68fr_1.32fr]"
    >
      <Section title="Add contact" description="Grow your subscriber base">
        <form onSubmit={props.onCreate} className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="c-name">Name</Label>
            <Input id="c-name" name="name" required placeholder="Namballa Ravikiran" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="c-phone">WhatsApp number</Label>
            <Input id="c-phone" name="phone" required placeholder="919381167516" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="c-list">List</Label>
            <select id="c-list" name="listIds" className={nativeSelect} defaultValue="">
              <option value="">No list yet</option>
              {props.lists.map((list) => (
                <option key={list._id} value={list._id}>
                  {list.name}
                </option>
              ))}
            </select>
          </div>
          <details className="rounded-lg border border-moon-green/12 bg-muted/40 p-3">
            <summary className="cursor-pointer text-sm font-medium text-moon-green">
              Optional details
            </summary>
            <div className="mt-3 grid gap-3">
              <div className="grid gap-2">
                <Label htmlFor="c-source">Source</Label>
                <Input id="c-source" name="source" placeholder="Walk-in, Instagram, event" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="c-tags">Tags</Label>
                <Input id="c-tags" name="tags" placeholder="friday, vip, regular" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="c-notes">Notes</Label>
                <Textarea id="c-notes" name="notes" placeholder="Optional note" />
              </div>
            </div>
          </details>
          <Button
            type="submit"
            className="justify-center"
            disabled={props.busy === "contact"}
          >
            {props.busy === "contact" ? <Loader2 className="animate-spin" /> : <Plus />}
            Save contact
          </Button>
        </form>
      </Section>

      <Section
        title="Contacts"
        description={`${props.contacts.length.toLocaleString()} shown`}
      >
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-moon-ink/40" />
          <Input
            value={props.search}
            onChange={(event) => props.setSearch(event.target.value)}
            placeholder="Search by name, tag, or phone"
            className="pl-9"
          />
        </div>
        <div className="overflow-hidden rounded-xl border border-moon-green/12">
          <Table>
            <TableHeader className="bg-moon-green">
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {props.contacts.map((contact) => (
                <TableRow key={contact._id}>
                  <TableCell className="font-medium text-moon-ink">
                    {contact.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    +{contact.phone}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      {contact.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="gap-1">
                          {tag}
                          <button
                            type="button"
                            onClick={() => props.onRemoveTag(contact, tag)}
                            className="text-moon-red transition-colors hover:text-moon-ink"
                            title={`Remove ${tag}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                      {!contact.tags.length ? (
                        <span className="text-muted-foreground">—</span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        contact.consentStatus === "subscribed"
                          ? "success"
                          : "muted"
                      }
                    >
                      {contact.consentStatus}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-moon-red hover:bg-moon-red/10 hover:text-moon-red"
                      onClick={() => props.onDelete(contact._id)}
                      disabled={props.busy === `delete-${contact._id}`}
                      title="Delete contact"
                    >
                      {props.busy === `delete-${contact._id}` ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Trash2 />
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!props.contacts.length ? (
            <p className="p-4 text-sm text-muted-foreground">No contacts yet</p>
          ) : null}
        </div>
      </Section>
    </motion.div>
  );
}
