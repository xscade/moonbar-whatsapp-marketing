"use client";

import { type FormEvent, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";

import type { Contact, ContactList } from "@/types/entities";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { cn } from "@/lib/utils";
import { Section } from "./Section";
import { palette } from "./types";

export function Lists({
  lists,
  contacts,
  selectedListId,
  selectedListContacts,
  busy,
  onCreate,
  onUpdate,
  onSelect,
  onDelete,
  onAddContacts,
  onRemoveContact
}: {
  lists: ContactList[];
  contacts: Contact[];
  selectedListId: string;
  selectedListContacts: Contact[];
  busy: string;
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
  onUpdate: (list: ContactList, formData: FormData) => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onAddContacts: (listId: string, contactIds: string[]) => void;
  onRemoveContact: (listId: string, contact: Contact) => void;
}) {
  const selectedList = lists.find((list) => list._id === selectedListId);
  const [addSearch, setAddSearch] = useState("");
  const [pendingContactIds, setPendingContactIds] = useState<Set<string>>(new Set());
  const availableContacts = useMemo(() => {
    const term = addSearch.toLowerCase().trim();
    return contacts
      .filter((contact) => !contact.listIds.includes(selectedListId))
      .filter((contact) => {
        if (!term) return true;
        return [contact.name, contact.phone, contact.source, contact.tags.join(" ")]
          .join(" ")
          .toLowerCase()
          .includes(term);
      })
      .slice(0, 20);
  }, [addSearch, contacts, selectedListId]);

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="grid gap-6 xl:grid-cols-[0.7fr_1.3fr]"
    >
      <Section title="New list" description="Group contacts into an audience">
        <form onSubmit={onCreate} className="grid gap-3">
          <Input name="name" required placeholder="Friday regulars" />
          <Textarea name="description" placeholder="Audience note" />
          <div className="grid grid-cols-5 gap-2">
            {palette.map((color, index) => (
              <label key={color} className="cursor-pointer">
                <input
                  type="radio"
                  name="color"
                  value={color}
                  defaultChecked={index === 0}
                  className="peer sr-only"
                />
                <span
                  className="block h-10 rounded-lg border border-moon-green/15 ring-offset-2 transition-all peer-checked:ring-2 peer-checked:ring-moon-ink"
                  style={{ backgroundColor: color }}
                />
              </label>
            ))}
          </div>
          <Button
            type="submit"
            className="justify-center"
            disabled={busy === "list"}
          >
            {busy === "list" ? <Loader2 className="animate-spin" /> : <Plus />}
            Create list
          </Button>
        </form>
      </Section>

      <Section title="Contact lists" description={`${lists.length} segments`}>
        <div className="grid gap-3 sm:grid-cols-2">
          {lists.map((list) => (
            <div
              key={list._id}
              className={cn(
                "relative rounded-xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-card",
                selectedListId === list._id
                  ? "border-moon-red/55 ring-2 ring-moon-red/10"
                  : "border-moon-green/12"
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(list._id)}
                className="block w-full text-left"
              >
                <div
                  className="mb-4 h-2 rounded-full"
                  style={{ backgroundColor: list.color }}
                />
                <h3 className="pr-10 font-semibold text-moon-ink">{list.name}</h3>
                <p className="mt-2 line-clamp-2 min-h-10 text-sm text-muted-foreground">
                  {list.description || "No note"}
                </p>
                <p className="mt-4 text-sm font-semibold text-moon-red">
                  {list.memberCount || 0} contacts
                </p>
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-2 h-8 w-8 text-moon-red hover:bg-moon-red/10 hover:text-moon-red"
                onClick={() => onDelete(list._id)}
                disabled={busy === `delete-list-${list._id}`}
                title="Delete list"
              >
                {busy === `delete-list-${list._id}` ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Trash2 />
                )}
              </Button>
            </div>
          ))}
          {!lists.length ? (
            <p className="rounded-xl border border-dashed border-moon-green/20 bg-muted/40 p-4 text-sm text-muted-foreground">
              No lists yet
            </p>
          ) : null}
        </div>

        {selectedList ? (
          <div className="mt-5 grid gap-4">
            <div className="rounded-xl border border-moon-green/12 bg-card p-4">
              <form
                className="grid gap-3 md:grid-cols-[1fr_1.3fr_auto]"
                onSubmit={(event) => {
                  event.preventDefault();
                  onUpdate(selectedList, new FormData(event.currentTarget));
                }}
              >
                <div className="grid gap-2">
                  <Label htmlFor="list-edit-name">List name</Label>
                  <Input
                    id="list-edit-name"
                    name="name"
                    defaultValue={selectedList.name}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="list-edit-description">Description</Label>
                  <Input
                    id="list-edit-description"
                    name="description"
                    defaultValue={selectedList.description || ""}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Color</Label>
                  <select
                    name="color"
                    defaultValue={selectedList.color}
                    className="h-10 rounded-lg border border-input bg-card px-3 text-sm"
                  >
                    {palette.map((color) => (
                      <option key={color} value={color}>
                        {color}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  type="submit"
                  className="md:col-span-3"
                  disabled={busy === `edit-list-${selectedList._id}`}
                >
                  {busy === `edit-list-${selectedList._id}` ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Plus />
                  )}
                  Save list changes
                </Button>
              </form>
            </div>

            <div className="rounded-xl border border-moon-green/12 bg-card p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-moon-ink">Add contacts</h3>
                  <p className="text-sm text-muted-foreground">
                    Search existing contacts and add them to this list.
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={() => {
                    onAddContacts(selectedList._id, Array.from(pendingContactIds));
                    setPendingContactIds(new Set());
                  }}
                  disabled={
                    !pendingContactIds.size ||
                    busy === `add-list-contacts-${selectedList._id}`
                  }
                >
                  {busy === `add-list-contacts-${selectedList._id}` ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Plus />
                  )}
                  Add {pendingContactIds.size || ""}
                </Button>
              </div>
              <div className="relative mb-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-moon-ink/40" />
                <Input
                  value={addSearch}
                  onChange={(event) => setAddSearch(event.target.value)}
                  placeholder="Search contacts to add"
                  className="pl-9"
                />
              </div>
              <div className="rounded-lg border border-moon-green/12">
                <ScrollArea className="h-48">
                  {availableContacts.map((contact) => {
                    const selected = pendingContactIds.has(contact._id);
                    return (
                      <label
                        key={contact._id}
                        className="flex cursor-pointer items-center gap-3 border-b border-moon-green/8 px-3 py-2 last:border-0 hover:bg-moon-cream/30"
                      >
                        <Checkbox
                          checked={selected}
                          onCheckedChange={() => {
                            const next = new Set(pendingContactIds);
                            if (selected) next.delete(contact._id);
                            else next.add(contact._id);
                            setPendingContactIds(next);
                          }}
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-moon-ink">
                            {contact.name}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            +{contact.phone}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                  {!availableContacts.length ? (
                    <p className="p-3 text-sm text-muted-foreground">
                      No available contacts match.
                    </p>
                  ) : null}
                </ScrollArea>
              </div>
            </div>

          <div className="overflow-hidden rounded-xl border border-moon-green/12 bg-card">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-moon-green/10 p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Selected list
                </p>
                <h3 className="mt-1 text-lg font-semibold text-moon-ink">
                  {selectedList.name}
                </h3>
              </div>
              <Badge variant="secondary">
                {selectedListContacts.length} loaded
              </Badge>
            </div>
            {busy === "list-detail" ? (
              <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading contacts
              </div>
            ) : selectedListContacts.length ? (
              <Table>
                <TableHeader className="bg-moon-green">
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedListContacts.map((contact) => (
                    <TableRow key={contact._id}>
                      <TableCell className="font-medium text-moon-ink">
                        {contact.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        +{contact.phone}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {contact.source || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-moon-red hover:bg-moon-red/10 hover:text-moon-red"
                          onClick={() => onRemoveContact(selectedList._id, contact)}
                          disabled={busy === `remove-list-contact-${contact._id}`}
                          title="Remove from list"
                        >
                          {busy === `remove-list-contact-${contact._id}` ? (
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
            ) : (
              <p className="p-4 text-sm text-muted-foreground">
                No contacts in this list
              </p>
            )}
          </div>
          </div>
        ) : (
          <p className="mt-5 rounded-xl border border-dashed border-moon-green/20 bg-muted/40 p-4 text-sm text-muted-foreground">
            Select a list to view its contacts.
          </p>
        )}
      </Section>
    </motion.div>
  );
}
