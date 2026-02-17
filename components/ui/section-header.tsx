import * as React from "react";

type SectionHeaderProps = React.HTMLAttributes<HTMLDivElement> & {
  title: string;
  description?: string;
  trailing?: React.ReactNode;
};

export function SectionHeader({
  title,
  description,
  trailing,
  className,
  ...props
}: SectionHeaderProps) {
  return (
    <div
      className={`flex flex-wrap items-start justify-between gap-3 ${
        className ?? ""
      }`}
      {...props}
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {title}
        </p>
        {description ? (
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}
