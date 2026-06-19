import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative flex items-center justify-center rounded-full border border-border bg-gradient-to-b from-secondary to-background shadow-inner",
        className,
      )}
      aria-hidden
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="size-1/2 text-foreground"
        strokeWidth={2.25}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 5l7 14 2-6 6-2L4 5z" />
      </svg>
    </span>
  );
}
