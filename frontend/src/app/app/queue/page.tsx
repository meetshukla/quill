"use client";

import * as React from "react";
import {
  CalendarCheck,
  CalendarClock,
  Clock,
  FileText,
  Film,
  Globe,
  Loader2,
  RefreshCw,
  Trash2,
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
import type { ScheduledPost } from "@/lib/types";

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

export default function QueuePage() {
  const { online } = useAccount();
  const drafts = useAsync(() => api.listDrafts().then((r) => r.drafts), []);
  const scheduled = useAsync(
    () => api.listScheduled().then((r) => r.scheduledPosts),
    [],
  );

  function reloadAll() {
    void drafts.reload();
    void scheduled.reload();
  }

  const loading = drafts.loading || scheduled.loading;
  const empty =
    (drafts.data?.length ?? 0) === 0 && (scheduled.data?.length ?? 0) === 0;

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
            {/* Drafts — awaiting your approval */}
            {drafts.data && drafts.data.length > 0 ? (
              <section className="space-y-3">
                <SectionTitle
                  label="Drafts"
                  count={drafts.data.length}
                  hint="proposed by your agent · approve to queue"
                />
                {drafts.data.map((d) => (
                  <DraftItem key={d.id} draft={d} onChanged={reloadAll} />
                ))}
              </section>
            ) : null}

            {/* Scheduled — the worker will post these */}
            {scheduled.data && scheduled.data.length > 0 ? (
              <section className="space-y-3">
                <SectionTitle
                  label="Scheduled"
                  count={scheduled.data.length}
                  hint="will post automatically"
                />
                {scheduled.data.map((post) => (
                  <ScheduledItem
                    key={post.id}
                    post={post}
                    onCanceled={reloadAll}
                  />
                ))}
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
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
    <Card className="p-4">
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
    <Card className="p-4">
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
