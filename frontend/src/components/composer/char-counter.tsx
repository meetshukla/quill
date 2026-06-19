import { TWEET_MAX } from "@/lib/format";
import { cn } from "@/lib/utils";

export function CharCounter({ count }: { count: number }) {
  const remaining = TWEET_MAX - count;
  const over = remaining < 0;
  const close = remaining <= 20 && remaining >= 0;
  const pct = Math.min(count / TWEET_MAX, 1);
  const circumference = 2 * Math.PI * 9;

  return (
    <div className="flex items-center gap-2">
      <svg viewBox="0 0 24 24" className="size-5 -rotate-90">
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke="var(--border)"
          strokeWidth="2.5"
        />
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke={
            over
              ? "var(--destructive)"
              : close
                ? "var(--warning)"
                : "var(--brand)"
          }
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct)}
        />
      </svg>
      <span
        className={cn(
          "tabular-nums text-xs",
          over
            ? "font-medium text-destructive"
            : close
              ? "text-warning"
              : "text-muted-foreground",
        )}
      >
        {over ? remaining : `${count} / ${TWEET_MAX}`}
      </span>
    </div>
  );
}
