import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-8 w-full min-w-0 rounded-md border border-input bg-card/40 px-2.5 py-1 text-[13px] shadow-sm transition-[color,box-shadow,border-color] outline-none",
        "placeholder:text-muted-foreground/60 selection:bg-brand selection:text-brand-foreground",
        "focus-visible:border-ring/70 focus-visible:ring-2 focus-visible:ring-ring/30",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "file:inline-flex file:border-0 file:bg-transparent file:text-sm file:font-medium",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
