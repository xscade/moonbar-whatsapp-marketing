"use client";

import type { FormEvent } from "react";
import { motion } from "motion/react";
import { Loader2, Plus, Trash2 } from "lucide-react";

import type { Contact, ContactList } from "@/types/entities";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  selectedListId,
  selectedListContacts,
  busy,
  onCreate,
  onSelect,
  onDelete
}: {
  lists: ContactList[];
  selectedListId: string;
  selectedListContacts: Contact[];
  busy: string;
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const selectedList = lists.find((list) => list._id === selectedListId);

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
          <div className="mt-5 overflow-hidden rounded-xl border border-moon-green/12 bg-card">
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
        ) : (
          <p className="mt-5 rounded-xl border border-dashed border-moon-green/20 bg-muted/40 p-4 text-sm text-muted-foreground">
            Select a list to view its contacts.
          </p>
        )}
      </Section>
    </motion.div>
  );
}
