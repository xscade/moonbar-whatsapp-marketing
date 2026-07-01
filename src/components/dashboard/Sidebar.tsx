"use client";

import Image from "next/image";
import { motion } from "motion/react";

import { cn } from "@/lib/utils";
import { tabs, type TabKey } from "./types";

export const MOON_LOGO =
  "https://moon-bar-kitchen-new.vercel.app/images/moon%20logo%20(2).png";

export function Sidebar({
  activeTab,
  onSelect,
  collapsed = false,
  onNavigate,
  indicatorId = "sidebar-active"
}: {
  activeTab: TabKey;
  onSelect: (tab: TabKey) => void;
  collapsed?: boolean;
  onNavigate?: () => void;
  indicatorId?: string;
}) {
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div
        className={cn(
          "flex h-16 items-center gap-3 border-b border-sidebar-border px-4",
          collapsed && "justify-center px-0"
        )}
      >
        <Image
          src={MOON_LOGO}
          alt="Moon Bar and Kitchen"
          width={40}
          height={40}
          className="h-10 w-10 shrink-0 rounded-lg bg-moon-red object-contain p-1.5 ring-1 ring-white/10"
          priority
        />
        {!collapsed ? (
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-moon-yellow">
              Moonbar
            </p>
            <p className="truncate text-sm font-semibold text-white">
              WhatsApp Suite
            </p>
          </div>
        ) : null}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3 moon-scrollbar">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                onSelect(tab.key);
                onNavigate?.();
              }}
              title={collapsed ? tab.label : undefined}
              className={cn(
                "group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "text-white"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-white",
                collapsed && "justify-center px-0"
              )}
            >
              {active ? (
                <motion.span
                  layoutId={indicatorId}
                  className="absolute inset-0 rounded-lg bg-sidebar-accent shadow-sm"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              ) : null}
              <Icon className="relative z-10 h-[18px] w-[18px] shrink-0" />
              {!collapsed ? (
                <span className="relative z-10 truncate">{tab.label}</span>
              ) : null}
              {active && !collapsed ? (
                <span className="relative z-10 ml-auto h-1.5 w-1.5 rounded-full bg-moon-yellow" />
              ) : null}
            </button>
          );
        })}
      </nav>

      {!collapsed ? (
        <div className="border-t border-sidebar-border p-4">
          <div className="flex items-center gap-2 rounded-lg bg-sidebar-accent/40 px-3 py-2.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-moon-yellow opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-moon-yellow" />
            </span>
            <p className="text-xs text-sidebar-foreground/80">
              Connected to Meta Cloud API
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
