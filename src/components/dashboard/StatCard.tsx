"use client";

import * as React from "react";
import { animate, motion, useReducedMotion } from "motion/react";
import type { LucideIcon } from "lucide-react";

import { fadeInUp } from "@/lib/motion";
import { cn } from "@/lib/utils";

function useCountUp(value: number) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = React.useState(reduce ? value : 0);

  React.useEffect(() => {
    if (reduce) {
      setDisplay(value);
      return;
    }
    const controls = animate(0, value, {
      duration: 0.9,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => setDisplay(Math.round(latest))
    });
    return () => controls.stop();
  }, [value, reduce]);

  return display;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  tone,
  hint
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: string;
  hint?: string;
}) {
  const display = useCountUp(value);

  return (
    <motion.div
      variants={fadeInUp}
      whileHover={{ y: -3 }}
      transition={{ type: "spring", stiffness: 320, damping: 26 }}
      className="group relative overflow-hidden rounded-xl border border-moon-green/12 bg-card p-5 shadow-card"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full opacity-[0.12] blur-xl transition-opacity group-hover:opacity-20"
        style={{ backgroundColor: tone }}
      />
      <div className="flex items-center justify-between">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm"
          style={{ backgroundColor: tone }}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-4 text-3xl font-semibold tabular-nums tracking-tight text-moon-ink">
        {display.toLocaleString()}
      </p>
      <p className="mt-1 text-sm font-medium text-muted-foreground">{label}</p>
      {hint ? (
        <p className={cn("mt-2 text-xs text-moon-ink/45")}>{hint}</p>
      ) : null}
    </motion.div>
  );
}
