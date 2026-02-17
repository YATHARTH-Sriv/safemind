import * as React from "react";

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "default" | "accent" | "muted";
};

const toneStyles: Record<NonNullable<BadgeProps["tone"]>, string> = {
  default: "bg-surface-muted text-foreground",
  accent: "bg-accent text-accent-foreground",
  muted: "bg-transparent text-muted-foreground border border-border/70",
};

export function Badge({ tone = "default", className, ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
        toneStyles[tone]
      } ${className ?? ""}`}
      {...props}
    />
  );
}
