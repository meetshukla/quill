"use client";

import * as React from "react";
import Link from "next/link";
import {
  CalendarClock,
  Clock,
  Globe,
  Loader2,
  PenLine,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  EmptyState,
  ErrorState,
  LoadingRow,
  OfflineState,
} from "@/components/states";
import { api, ApiError } from "@/lib/api";
import { useAsync } from "@/lib/use-async";
import { formatDateTime, formatRelative } from "@/lib/format";
import type { ScheduledPost } from "@/lib/types";

export default function QueuePage() {
  const { data, loading, error, reload, setData } = useAsync(
    () => api.listScheduled().then((r) => r.scheduledPosts),
    [],
  );
  const offline = error && error.toLowerCase().includes("reach");
  const [cancelingId, setCancelingId] = React.useState<string | null>(null);

  async function cancel(post: ScheduledPost) {
    setCancelingId(post.id);
    try {
      await api.cancelScheduled(post.id);
      setData((data ?? []).filter((p) => p.id !== post.id));
      toast.success("Scheduled post canceled");
    } catch (err) {
      toast.error(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Cancel failed",
      );
    } finally {
      setCancelingId(null);
    }
  }

  return (
    <div>
      <PageHeader
        icon={CalendarClock}
        title="Queue"
        description="Everything you've lined up. A full queue is a consistent feed."
        actions={
          <Button variant="outline" size="sm" onClick={reload}>
            <RefreshCw className="size-4" /> Refresh
          </Button>
        }
      />
      <div className="mx-auto max-w-3xl px-5 py-6 sm:px-7">
        {loading ? (
          <LoadingRow label="Loading queue…" />
        ) : offline ? (
          <OfflineState onRetry={reload} />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="Your queue is empty"
            description="Consistency compounds. Schedule a few posts so your feed keeps moving even on busy days."
            action={
              <Button asChild size="sm">
                <Link href="/app/composer">
                  <PenLine className="size-4" /> Compose a post
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {data.length} post{data.length === 1 ? "" : "s"} scheduled
            </p>
            {data.map((post) => (
              <QueueItem
                key={post.id}
                post={post}
                canceling={cancelingId === post.id}
                onCancel={() => cancel(post)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function QueueItem({
  post,
  canceling,
  onCancel,
}: {
  post: ScheduledPost;
  canceling: boolean;
  onCancel: () => void;
}) {
  const parts = post.threadParts?.parts;
  const preview =
    post.text ?? (parts && parts.length ? parts[0] : "") ?? "";
  const kind = parts && parts.length > 1 ? `Thread · ${parts.length}` : "Post";

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={post.status} />
            <Badge variant="outline">{kind}</Badge>
          </div>
          <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed">
            {preview || (
              <span className="text-muted-foreground">No text</span>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-3.5" />
              {formatDateTime(post.scheduledAt)} · {formatRelative(post.scheduledAt)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Globe className="size-3.5" /> {post.timezone}
            </span>
          </div>
          {post.errorMessage ? (
            <p className="text-xs text-destructive">{post.errorMessage}</p>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onCancel}
          disabled={canceling}
          aria-label="Cancel scheduled post"
          className="text-muted-foreground hover:text-destructive"
        >
          {canceling ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Trash2 className="size-4" />
          )}
        </Button>
      </div>
    </Card>
  );
}

function StatusBadge({ status }: { status: ScheduledPost["status"] }) {
  const map: Record<
    ScheduledPost["status"],
    { variant: "brand" | "success" | "warning" | "destructive" | "outline"; label: string }
  > = {
    SCHEDULED: { variant: "brand", label: "Scheduled" },
    POSTING: { variant: "warning", label: "Posting" },
    POSTED: { variant: "success", label: "Posted" },
    FAILED: { variant: "destructive", label: "Failed" },
    CANCELED: { variant: "outline", label: "Canceled" },
    DRAFT: { variant: "outline", label: "Draft" },
  };
  const cfg = map[status];
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}
