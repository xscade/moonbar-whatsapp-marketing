"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";

import type { AdminUser } from "@/types/entities";
import { pageTransition } from "@/lib/motion";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import type { DashboardNotification, TabKey } from "./types";

export function DashboardShell({
  user,
  activeTab,
  onSelect,
  search,
  setSearch,
  onRefresh,
  busy,
  onLogout,
  notifications,
  unreadCount,
  onMarkNotificationsRead,
  onNotificationClick,
  children
}: {
  user: AdminUser;
  activeTab: TabKey;
  onSelect: (tab: TabKey) => void;
  search: string;
  setSearch: (value: string) => void;
  onRefresh: () => void;
  busy: string;
  onLogout: () => void;
  notifications: DashboardNotification[];
  unreadCount: number;
  onMarkNotificationsRead: () => void;
  onNotificationClick: (notification: DashboardNotification) => void;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <motion.aside
        className="sticky top-0 hidden h-screen shrink-0 overflow-hidden border-r border-sidebar-border lg:block"
        animate={{ width: collapsed ? 76 : 264 }}
        initial={false}
        transition={{ type: "spring", stiffness: 300, damping: 34 }}
      >
        <Sidebar
          activeTab={activeTab}
          onSelect={onSelect}
          collapsed={collapsed}
        />
      </motion.aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen ? (
          <>
            <motion.div
              key="overlay"
              className="fixed inset-0 z-40 bg-moon-ink/40 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              key="drawer"
              className="fixed inset-y-0 left-0 z-50 w-64 border-r border-sidebar-border shadow-soft lg:hidden"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
            >
              <Sidebar
                activeTab={activeTab}
                onSelect={onSelect}
                onNavigate={() => setMobileOpen(false)}
                indicatorId="sidebar-active-mobile"
              />
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          user={user}
          activeTab={activeTab}
          search={search}
          setSearch={setSearch}
          onRefresh={onRefresh}
          busy={busy}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((value) => !value)}
          onOpenMobile={() => setMobileOpen(true)}
          onSelect={onSelect}
          onLogout={onLogout}
          notifications={notifications}
          unreadCount={unreadCount}
          onMarkNotificationsRead={onMarkNotificationsRead}
          onNotificationClick={onNotificationClick}
        />

        <main className="flex-1 px-4 py-6 lg:px-6">
          <div className="mx-auto w-full max-w-[1440px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={pageTransition.initial}
                animate={pageTransition.animate}
                exit={pageTransition.exit}
                transition={pageTransition.transition}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}
