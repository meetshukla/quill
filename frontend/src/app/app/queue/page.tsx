"use client";

import * as React from "react";
import {
  CalendarCheck,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Film,
  Globe,
  Loader2,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState, LoadingRow, OfflineState } from "@/components/states";
import { api, ApiError } from "@/lib/api";
import { useAccount } from "@/lib/account-context";
import { useAsync } from "@/lib/use-async";
import {
  datetimeLocalToISO,
  formatDateTime,
  formatRelative,
  localTimezone,
} from "@/lib/format";
import type { QueueSnapshot, ScheduledPost } from "@/lib/types";

function postPreview(post: ScheduledPost): string {
  const parts = post.threadParts?.parts;
  return post.text ?? (parts && parts.length ? parts[0] : "") ?? "";
}
function postKind(post: ScheduledPost): string {
  const parts = post.threadParts?.parts;
  return parts && parts.length > 1 ? `Thread · ${parts.length}` : "Post";
}

function attachedAssetIds(post: ScheduledPost) {
  return post.media?.assetIds ?? [];
}
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

type CalendarPost = {
  post: ScheduledPost;
  status: "SCHEDULED" | "POSTING" | "FAILED" | "POSTED";
};

function calendarDateKey(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function postTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function calendarPosts(queue: QueueSnapshot): CalendarPost[] {
  return [
    ...queue.scheduled.map((post) => ({ post, status: "SCHEDULED" as const })),
    ...queue.posting.map((post) => ({ post, status: "POSTING" as const })),
    ...queue.failed.map((post) => ({ post, status: "FAILED" as const })),
    ...queue.posted.map((post) => ({ post, status: "POSTED" as const })),
  ];
}

export default function QueuePage() {
  const { online } = useAccount();
  const queue = useAsync(() => api.getQueue(), []);

  function reloadAll() {
    void queue.reload();
  }

  const loading = queue.loading;
  const sections = queue.data;
  const empty = !sections || Object.values(sections).every((items) => items.length === 0);

  return (
    <div>
      <PageHeader
        icon={CalendarClock}
        title="Queue"
        description="Drafts your agent proposed, and everything lined up to post."
        actions={
          <Button variant="outline" size="sm" onClick={reloadAll}>
            <RefreshCw className="size-4" /> Refresh
          </Button>
        }
      />
      <div className="mx-auto max-w-3xl space-y-7 px-5 py-6 sm:px-7">
        {online === false ? (
          <OfflineState onRetry={reloadAll} />
        ) : loading ? (
          <LoadingRow label="Loading queue…" />
        ) : empty ? (
          <EmptyState
            icon={FileText}
            title="Nothing here yet"
            description="Drafts from your agent show up here for review. Open Quill in Claude or Codex and ask it to draft a few posts in your voice."
          />
        ) : (
          <>
            {sections ? <ScheduleCalendar queue={sections} /> : null}

            {/* Drafts — awaiting your approval */}
            {sections?.drafts.length ? (
              <section className="space-y-3">
                <SectionTitle
                  label="Drafts"
                  count={sections.drafts.length}
                  hint="proposed by your agent · approve to queue"
                />
                {sections.drafts.map((d) => (
                  <DraftItem key={d.id} draft={d} onChanged={reloadAll} />
                ))}
              </section>
            ) : null}

            {/* Scheduled — the worker will post these */}
            {sections?.scheduled.length ? (
              <section className="space-y-3">
                <SectionTitle
                  label="Scheduled"
                  count={sections.scheduled.length}
                  hint="will post automatically"
                />
                {sections.scheduled.map((post) => (
                  <ScheduledItem
                    key={post.id}
                    post={post}
                    onCanceled={reloadAll}
                  />
                ))}
              </section>
            ) : null}

            {sections?.posting.length ? <LifecycleSection label="Publishing" hint="Quill is sending these to X" posts={sections.posting} onChanged={reloadAll} /> : null}
            {sections?.failed.length ? <LifecycleSection label="Failed" hint="not posted · retry after fixing the issue" posts={sections.failed} status="FAILED" onChanged={reloadAll} /> : null}
            {sections?.posted.length ? <LifecycleSection label="Posted" hint="published on X" posts={sections.posted} status="POSTED" onChanged={reloadAll} /> : null}
          </>
        )}
      </div>
    </div>
  );
}

function ScheduleCalendar({ queue }: { queue: QueueSnapshot }) {
  const [month, setMonth] = React.useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const events = React.useMemo(() => calendarPosts(queue), [queue]);
  const eventsByDay = React.useMemo(() => {
    const result = new Map<string, CalendarPost[]>();
    for (const event of events) {
      const key = calendarDateKey(event.post.scheduledAt);
      result.set(key, [...(result.get(key) ?? []), event]);
    }
    return result;
  }, [events]);

  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  end.setDate(end.getDate() + (6 - end.getDay()));
  const days: Date[] = [];
  for (let day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
    days.push(new Date(day));
  }
  const today = calendarDateKey(new Date());
  const monthLabel = new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(month);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">Schedule</h2>
          <p className="text-xs text-muted-foreground">
            Every scheduled, publishing, failed, and posted item. Select an item to jump to its record.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
          >
            Today
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            aria-label="Next month"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden py-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-medium">{monthLabel}</p>
          <span className="text-xs text-muted-foreground">{events.length} tracked item{events.length === 1 ? "" : "s"}</span>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-7 border-b border-border bg-muted/25">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div key={day} className="px-3 py-2 text-xs font-medium text-muted-foreground">{day}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day) => {
                const key = calendarDateKey(day);
                const dayEvents = eventsByDay.get(key) ?? [];
                const isCurrentMonth = day.getMonth() === month.getMonth();
                return (
                  <div
                    key={key}
                    className={`min-h-28 border-b border-r border-border p-2 last:border-r-0 ${isCurrentMonth ? "bg-background" : "bg-muted/20"}`}
                  >
                    <span className={`mb-2 inline-flex size-6 items-center justify-center rounded-full text-xs ${key === today ? "bg-primary text-primary-foreground" : isCurrentMonth ? "text-foreground" : "text-muted-foreground"}`}>
                      {day.getDate()}
                    </span>
                    <div className="space-y-1">
                      {dayEvents.map(({ post, status }) => (
                        <a
                          key={post.id}
                          href={`#post-${post.id}`}
                          title={postPreview(post) || "Untitled post"}
                          className={`block rounded px-1.5 py-1 text-[11px] leading-snug transition-colors hover:brightness-125 ${calendarStatusClass(status)}`}
                        >
                          <span className="mr-1 font-medium">{postTime(post.scheduledAt)}</span>
                          <span className="line-clamp-2">{postPreview(post) || "Untitled post"}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Card>
    </section>
  );
}

function calendarStatusClass(status: CalendarPost["status"]): string {
  switch (status) {
    case "POSTED":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "FAILED":
      return "bg-destructive/10 text-destructive";
    case "POSTING":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
    default:
      return "bg-primary/15 text-primary";
  }
}

function SectionTitle({
  label,
  count,
  hint,
}: {
  label: string;
  count: number;
  hint: string;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <h2 className="text-sm font-medium">{label}</h2>
      <span className="text-xs text-muted-foreground">
        {count} · {hint}
      </span>
    </div>
  );
}

function DraftItem({
  draft,
  onChanged,
}: {
  draft: ScheduledPost;
  onChanged: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [when, setWhen] = React.useState(
    () => toLocalInput(draft.scheduledAt) || "",
  );
  const tz = React.useMemo(() => localTimezone(), []);

  async function approve() {
    if (!when) {
      toast.error("Pick a date and time.");
      return;
    }
    const iso = datetimeLocalToISO(when);
    if (new Date(iso).getTime() <= Date.now()) {
      toast.error("Pick a time in the future.");
      return;
    }
    setBusy(true);
    try {
      await api.scheduleDraft(draft.id, iso, tz);
      toast.success("Approved — added to the queue");
      setOpen(false);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not schedule");
    } finally {
      setBusy(false);
    }
  }

  async function discard() {
    setBusy(true);
    try {
      await api.deleteDraft(draft.id);
      toast.success("Draft discarded");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not discard");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card id={`post-${draft.id}`} className="p-4">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline">{postKind(draft)}</Badge>
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">
          {postPreview(draft) || (
            <span className="text-muted-foreground">No text</span>
          )}
        </p>
        <PostMediaPreview post={draft} />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            suggested {formatRelative(draft.scheduledAt)}
          </span>
          <div className="flex items-center gap-1.5">
            <Button size="sm" onClick={() => setOpen(true)} disabled={busy}>
              <CalendarCheck className="size-3.5" /> Approve &amp; schedule
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={discard}
              disabled={busy}
              aria-label="Discard draft"
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule this post</DialogTitle>
            <DialogDescription>
              It joins the queue and posts automatically at the time you pick.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="when">When</Label>
            <Input
              id="when"
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Timezone: {tz}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={approve} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ScheduledItem({
  post,
  onCanceled,
}: {
  post: ScheduledPost;
  onCanceled: () => void;
}) {
  const [busy, setBusy] = React.useState(false);

  async function cancel() {
    setBusy(true);
    try {
      await api.cancelScheduled(post.id);
      toast.success("Scheduled post canceled");
      onCanceled();
    } catch (err) {
      toast.error(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Cancel failed",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card id={`post-${post.id}`} className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="brand">Scheduled</Badge>
            <Badge variant="outline">{postKind(post)}</Badge>
          </div>
          <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed">
            {postPreview(post) || (
              <span className="text-muted-foreground">No text</span>
            )}
          </p>
          <PostMediaPreview post={post} compact />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-3.5" />
              {formatDateTime(post.scheduledAt)} ·{" "}
              {formatRelative(post.scheduledAt)}
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
          onClick={cancel}
          disabled={busy}
          aria-label="Cancel scheduled post"
          className="text-muted-foreground hover:text-destructive"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Trash2 className="size-4" />
          )}
        </Button>
      </div>
    </Card>
  );
}

function LifecycleSection({
  label,
  hint,
  posts,
  onChanged,
  status = "POSTING",
}: {
  label: string;
  hint: string;
  posts: ScheduledPost[];
  onChanged: () => void;
  status?: "POSTING" | "FAILED" | "POSTED";
}) {
  return (
    <section className="space-y-3">
      <SectionTitle label={label} count={posts.length} hint={hint} />
      {posts.map((post) => <LifecycleItem key={post.id} post={post} status={status} onChanged={onChanged} />)}
    </section>
  );
}

function LifecycleItem({ post, status, onChanged }: { post: ScheduledPost; status: "POSTING" | "FAILED" | "POSTED"; onChanged: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const meta = status === "POSTED"
    ? { badge: "Posted", variant: "success" as const, icon: CheckCircle2, detail: "Published" }
    : status === "FAILED"
      ? { badge: "Failed", variant: "destructive" as const, icon: XCircle, detail: "Not posted" }
      : { badge: "Publishing", variant: "warning" as const, icon: Loader2, detail: "Publishing" };
  const Icon = meta.icon;

  async function retry() {
    setBusy(true);
    try {
      await api.retryScheduled(post.id);
      toast.success("Retry queued — Quill will try this post again shortly.");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not retry this post.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card id={`post-${post.id}`} className={status === "FAILED" ? "border-destructive/35 p-4" : "p-4"}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={meta.variant}><Icon className={status === "POSTING" ? "animate-spin" : undefined} /> {meta.badge}</Badge>
          <Badge variant="outline">{postKind(post)}</Badge>
        </div>
        <p className="line-clamp-4 whitespace-pre-wrap text-sm leading-relaxed">{postPreview(post) || <span className="text-muted-foreground">No text</span>}</p>
        <PostMediaPreview post={post} compact />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><Clock className="size-3.5" /> {meta.detail} {formatRelative(post.updatedAt)}</span>
          <span className="inline-flex items-center gap-1.5"><Globe className="size-3.5" /> {post.timezone}</span>
          {status === "POSTED" && post.postedXPostId ? <a className="inline-flex items-center gap-1 text-foreground underline underline-offset-2" href={`https://x.com/i/web/status/${post.postedXPostId}`} target="_blank" rel="noreferrer">Open on X <ExternalLink className="size-3" /></a> : null}
        </div>
        {status === "FAILED" ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2"><p className="text-xs leading-relaxed text-destructive">{post.errorMessage || "Quill could not publish this post."}</p><Button size="sm" variant="outline" onClick={retry} disabled={busy} className="border-destructive/35 text-destructive hover:bg-destructive/10 hover:text-destructive">{busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Retry now</Button></div> : null}
      </div>
    </Card>
  );
}

function PostMediaPreview({ post, compact = false }: { post: ScheduledPost; compact?: boolean }) {
  const assetIds = attachedAssetIds(post);
  const legacyMediaCount = post.media?.mediaIds?.length ?? 0;
  if (!assetIds.length && !legacyMediaCount) return null;

  return (
    <div className={compact ? "space-y-2" : "space-y-2.5"}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Film className="size-3.5" />
        {assetIds.length + legacyMediaCount} attached {assetIds.length + legacyMediaCount === 1 ? "asset" : "assets"}
      </div>
      {assetIds.length ? <div className="grid gap-2 sm:grid-cols-2">{assetIds.map((id) => <MediaAssetPreview key={id} assetId={id} />)}</div> : null}
      {legacyMediaCount ? <p className="text-xs text-muted-foreground">{legacyMediaCount} legacy X media attachment{legacyMediaCount === 1 ? "" : "s"} will publish, but cannot be previewed because Quill does not hold their original files.</p> : null}
    </div>
  );
}

function MediaAssetPreview({ assetId }: { assetId: string }) {
  const [state, setState] = React.useState<{ url: string; type: string } | "loading" | "error">("loading");

  React.useEffect(() => {
    let active = true;
    let url: string | null = null;
    api.getMediaAssetBlob(assetId)
      .then((blob) => {
        const objectUrl = URL.createObjectURL(blob);
        if (!active) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        url = objectUrl;
        setState({ url: objectUrl, type: blob.type });
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [assetId]);

  if (state === "loading") return <div className="flex aspect-video items-center justify-center rounded-md border border-border bg-muted/30 text-xs text-muted-foreground"><Loader2 className="mr-2 size-3.5 animate-spin" /> Loading media…</div>;
  if (state === "error") return <div className="flex aspect-video items-center justify-center rounded-md border border-destructive/30 bg-destructive/5 px-3 text-center text-xs text-destructive">Attached media could not be loaded.</div>;
  if (state.type.startsWith("video/")) return <video className="block h-auto w-auto max-h-[520px] max-w-full rounded-md border border-border bg-black" controls preload="metadata"><source src={state.url} type={state.type} />Your browser cannot preview this video.</video>;
  return <img className="block h-auto w-auto max-h-[520px] max-w-full rounded-md border border-border" src={state.url} alt="Attached post media" />;
}
