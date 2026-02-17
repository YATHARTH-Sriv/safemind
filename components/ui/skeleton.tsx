import * as React from "react";

type SkeletonProps = React.HTMLAttributes<HTMLDivElement> & {
  tone?: "surface" | "muted";
};

const toneStyles: Record<NonNullable<SkeletonProps["tone"]>, string> = {
  surface: "bg-surface-muted",
  muted: "bg-border/60",
};

export function Skeleton({ tone = "surface", className, ...props }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-sm ${
        toneStyles[tone]
      } ${className ?? ""}`}
      {...props}
    />
  );
}
