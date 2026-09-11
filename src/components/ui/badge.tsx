import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/10 text-primary",
        secondary: "border-transparent bg-moon-green/10 text-moon-green",
        success: "border-transparent bg-moon-green/12 text-moon-green",
        warning: "border-transparent bg-moon-yellow/60 text-moon-ink",
        destructive: "border-transparent bg-moon-red/12 text-moon-red",
        muted: "border-transparent bg-muted text-muted-foreground",
        outline: "border-moon-green/25 text-moon-ink"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
