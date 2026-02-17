import * as React from "react";

type CardProps = React.HTMLAttributes<HTMLDivElement>;

type CardHeaderProps = React.HTMLAttributes<HTMLDivElement>;

type CardTitleProps = React.HTMLAttributes<HTMLHeadingElement>;

type CardDescriptionProps = React.HTMLAttributes<HTMLParagraphElement>;

type CardContentProps = React.HTMLAttributes<HTMLDivElement>;

type CardFooterProps = React.HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: CardProps) {
  return (
    <div
      className={`rounded-md border border-border/70 bg-card text-card-foreground shadow-sm dark:border-white/10 dark:bg-zinc-900/80 ${
        className ?? ""
      }`}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: CardHeaderProps) {
  return (
    <div className={`px-6 pb-2 pt-5 ${className ?? ""}`} {...props} />
  );
}

export function CardTitle({ className, ...props }: CardTitleProps) {
  return (
    <h3
      className={`text-lg font-semibold tracking-tight text-foreground ${
        className ?? ""
      }`}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: CardDescriptionProps) {
  return (
    <p
      className={`text-sm text-muted-foreground ${className ?? ""}`}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: CardContentProps) {
  return (
    <div className={`px-6 pb-5 pt-3 ${className ?? ""}`} {...props} />
  );
}

export function CardFooter({ className, ...props }: CardFooterProps) {
  return (
    <div
      className={`flex items-center gap-3 border-t border-border/70 px-6 py-4 ${
        className ?? ""
      }`}
      {...props}
    />
  );
}
