import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({
  icon: Icon,
  title,
  description,
  actions,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "sticky top-0 z-20 flex items-center gap-4 border-b border-border bg-background/80 px-5 py-3 backdrop-blur-md sm:px-7",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon ? (
          <Icon className="size-4 shrink-0 text-muted-foreground" />
        ) : null}
        <h1 className="truncate text-[15px] font-semibold tracking-tight">
          {title}
        </h1>
        {description ? (
          <>
            <span className="hidden h-3.5 w-px shrink-0 bg-border sm:block" />
            <p className="hidden truncate text-[13px] text-muted-foreground sm:block">
              {description}
            </p>
          </>
        ) : null}
      </div>
      {actions ? (
        <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
