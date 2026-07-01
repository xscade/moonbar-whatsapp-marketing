"use client";

import * as React from "react";
import { motion } from "motion/react";

import { fadeInUp } from "@/lib/motion";
import { cn } from "@/lib/utils";

export function Section({
  title,
  description,
  action,
  children,
  className,
  bodyClassName
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <motion.section
      variants={fadeInUp}
      className={cn(
        "rounded-xl border border-moon-green/12 bg-card p-5 shadow-card",
        className
      )}
    >
      {title || action ? (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-0.5">
            {title ? (
              <h2 className="text-base font-semibold tracking-tight text-moon-ink">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {action ? <div className="flex items-center gap-2">{action}</div> : null}
        </div>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </motion.section>
  );
}
