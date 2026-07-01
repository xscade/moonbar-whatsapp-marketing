"use client";

import {
  Bell,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Search,
  Settings as SettingsIcon
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import type { AdminUser } from "@/types/entities";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { tabs, type DashboardNotification, type TabKey } from "./types";

const notificationTone: Record<DashboardNotification["kind"], string> = {
  inbound: "#414C2F",
  template: "#BB5524",
  failed: "#BA401D",
  info: "#7F6F34"
};

function initials(name: string) {
  return (
    name
      .split(" ")
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "MB"
  );
}

export function Topbar({
  user,
  activeTab,
  search,
  setSearch,
  onRefresh,
  busy,
  collapsed,
  onToggleCollapse,
  onOpenMobile,
  onSelect,
  onLogout,
  notifications,
  unreadCount,
  onMarkNotificationsRead,
  onNotificationClick
}: {
  user: AdminUser;
  activeTab: TabKey;
  search: string;
  setSearch: (value: string) => void;
  onRefresh: () => void;
  busy: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenMobile: () => void;
  onSelect: (tab: TabKey) => void;
  onLogout: () => void;
  notifications: DashboardNotification[];
  unreadCount: number;
  onMarkNotificationsRead: () => void;
  onNotificationClick: (notification: DashboardNotification) => void;
}) {
  const current = tabs.find((tab) => tab.key === activeTab);
  const loading = busy === "loading";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-moon-green/12 bg-moon-paper/80 px-4 backdrop-blur-md lg:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onOpenMobile}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="hidden lg:inline-flex"
        onClick={onToggleCollapse}
        aria-label="Toggle sidebar"
      >
        {collapsed ? (
          <PanelLeftOpen className="h-5 w-5" />
        ) : (
          <PanelLeftClose className="h-5 w-5" />
        )}
      </Button>

      <div className="min-w-0">
        <h1 className="truncate text-base font-semibold leading-tight text-moon-ink">
          {current?.label}
        </h1>
        <p className="hidden truncate text-xs text-muted-foreground sm:block">
          {current?.description}
        </p>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <div className="relative hidden md:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-moon-ink/40" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search contacts…"
            className="h-9 w-56 pl-9"
          />
        </div>

        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9"
          onClick={onRefresh}
          disabled={loading}
          aria-label="Refresh data"
          title="Refresh data"
        >
          <RefreshCw className={loading ? "animate-spin" : ""} />
        </Button>

        <DropdownMenu
          onOpenChange={(open) => {
            if (open) onMarkNotificationsRead();
          }}
        >
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="relative h-9 w-9"
              aria-label="Notifications"
            >
              <Bell />
              {unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-moon-red px-1 text-[10px] font-semibold leading-none text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              ) : null}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 p-0">
            <div className="px-3 py-2.5 text-sm font-semibold text-moon-ink">
              Notifications
            </div>
            <DropdownMenuSeparator className="my-0" />
            <div className="max-h-80 overflow-y-auto p-1 moon-scrollbar">
              {notifications.length ? (
                notifications.slice(0, 15).map((notification) => (
                  <DropdownMenuItem
                    key={notification.id}
                    onSelect={() => onNotificationClick(notification)}
                    className="items-start gap-2.5"
                  >
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: notificationTone[notification.kind] }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-moon-ink">
                        {notification.title}
                      </span>
                      {notification.description ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {notification.description}
                        </span>
                      ) : null}
                      <span className="mt-0.5 block text-[11px] text-moon-ink/40">
                        {formatDistanceToNow(new Date(notification.createdAt))} ago
                      </span>
                    </span>
                  </DropdownMenuItem>
                ))
              ) : (
                <div className="grid place-items-center gap-1 px-3 py-8 text-center text-sm text-muted-foreground">
                  <Bell className="h-5 w-5 text-moon-green/40" />
                  You&apos;re all caught up
                </div>
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-full border border-moon-green/15 bg-card py-1 pl-1 pr-2.5 text-sm font-medium text-moon-ink shadow-sm transition-colors hover:bg-moon-cream/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="text-xs">
                  {initials(user.name)}
                </AvatarFallback>
              </Avatar>
              <span className="hidden max-w-[10rem] truncate sm:block">
                {user.name}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="text-sm font-semibold normal-case text-moon-ink">
                  {user.name}
                </span>
                <span className="text-xs font-normal normal-case text-muted-foreground">
                  {user.email || "Administrator"}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onSelect("settings")}>
              <SettingsIcon />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={onLogout}
              className="text-moon-red focus:text-moon-red"
            >
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
