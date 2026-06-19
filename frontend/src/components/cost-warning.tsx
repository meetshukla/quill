import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export function CostWarning({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border border-warning/30 bg-[color-mix(in_oklch,var(--warning)_7%,transparent)] px-3.5 py-2.5",
        className,
      )}
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
      <p className="text-xs leading-relaxed text-muted-foreground">
        Reading your post metrics uses X{" "}
        <span className="font-medium text-foreground">Owned Reads</span>, billed
        at{" "}
        <span className="font-mono font-medium text-foreground">
          $0.001/resource
        </span>
        . Budget guardrails apply. Keep analytics off if you only care about
        shipping consistently.
      </p>
    </div>
  );
}
