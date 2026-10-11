import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
  {
    variants: {
      variant: {
        neutral:
          "border-[var(--color-border)] bg-[var(--color-panel-2)] text-[var(--color-muted)]",
        a: "border-[var(--color-agent-a)] bg-[var(--color-agent-a-soft)] text-[var(--color-agent-a)]",
        b: "border-[var(--color-agent-b)] bg-[var(--color-agent-b-soft)] text-[var(--color-agent-b)]",
      },
    },
    defaultVariants: { variant: "neutral" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
