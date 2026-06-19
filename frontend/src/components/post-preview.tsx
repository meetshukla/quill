import { Heart, MessageCircle, Repeat2 } from "lucide-react";
import type { XPostPreview } from "@/lib/types";
import { compactNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export function PostPreviewCard({
  post,
  className,
}: {
  post: XPostPreview;
  className?: string;
}) {
  const m = post.public_metrics;
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-background/60 p-3 text-sm",
        className,
      )}
    >
      <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/90">
        {post.text}
      </p>
      {m ? (
        <div className="mt-2.5 flex items-center gap-4 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Heart className="size-3" /> {compactNumber(m.like_count ?? 0)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Repeat2 className="size-3" /> {compactNumber(m.retweet_count ?? 0)}
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageCircle className="size-3" /> {compactNumber(m.reply_count ?? 0)}
          </span>
        </div>
      ) : null}
    </div>
  );
}
