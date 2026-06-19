"use client";

import * as React from "react";
import {
  CalendarClock,
  Loader2,
  Plus,
  Quote,
  Reply,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PostPreviewCard } from "@/components/post-preview";
import { api, ApiError } from "@/lib/api";
import { useAccount } from "@/lib/account-context";
import { useComposerStore } from "@/lib/store";
import type { ComposerMode, XPostPreview } from "@/lib/types";
import {
  datetimeLocalToISO,
  localTimezone,
  parseXPostId,
  tweetLength,
  TWEET_MAX,
} from "@/lib/format";
import { useUiStore } from "@/lib/ui-store";
import { cn } from "@/lib/utils";
import { CharCounter } from "./char-counter";

const MODES: { value: ComposerMode; label: string; icon: typeof Quote }[] = [
  { value: "original", label: "Post", icon: Send },
  { value: "quote", label: "Quote", icon: Quote },
  { value: "reply", label: "Reply", icon: Reply },
  { value: "thread", label: "Thread", icon: Plus },
];

export function Composer() {
  const { account, online } = useAccount();
  const store = useComposerStore();
  const seedAssistant = useUiStore((s) => s.seedAssistant);
  const [submitting, setSubmitting] = React.useState(false);
  const [quotePreview, setQuotePreview] = React.useState<XPostPreview | null>(
    null,
  );
  const [previewing, setPreviewing] = React.useState(false);

  const tz = React.useMemo(() => localTimezone(), []);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // React to assistant-driven hydration (focus + nudge).
  React.useEffect(() => {
    if (store.hydrationToken > 0) {
      textareaRef.current?.focus();
    }
  }, [store.hydrationToken]);

  const canWrite = Boolean(account?.writeEnabled);
  const count = tweetLength(store.text);
  const overLimit = count > TWEET_MAX;

  const threadParts = store.threadParts.length
    ? store.threadParts
    : ["", ""];
  const threadOverLimit = threadParts.some(
    (p) => tweetLength(p) > TWEET_MAX,
  );
  const threadFilled = threadParts.filter((p) => p.trim().length > 0);

  const isThread = store.mode === "thread";
  const readyText = isThread
    ? threadFilled.length > 0 && !threadOverLimit
    : store.text.trim().length > 0 && !overLimit;

  function setMode(mode: ComposerMode) {
    store.setMode(mode);
    if (mode !== "quote") setQuotePreview(null);
  }

  function buildPayload() {
    const quotePostId =
      store.mode === "quote" ? parseXPostId(store.quotePostId) : null;
    const replyToPostId =
      store.mode === "reply" ? parseXPostId(store.replyToPostId) : null;

    if (store.mode === "quote" && !quotePostId) {
      throw new Error("Enter a valid X post URL or id to quote.");
    }
    if (store.mode === "reply" && !replyToPostId) {
      throw new Error("Enter a valid X post URL or id to reply to.");
    }

    if (isThread) {
      return {
        threadParts: threadFilled,
        ...(quotePostId ? { quotePostId } : {}),
      };
    }
    return {
      text: store.text.trim(),
      ...(quotePostId ? { quotePostId } : {}),
      ...(replyToPostId ? { replyToPostId } : {}),
    };
  }

  async function handlePreview() {
    const id = parseXPostId(store.quotePostId);
    if (!id) {
      toast.error("Enter a valid X post URL or id.");
      return;
    }
    setPreviewing(true);
    try {
      const { post } = await api.quotePreview(id);
      if (post) {
        setQuotePreview(post);
      } else {
        toast.error("Couldn't find that post.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setPreviewing(false);
    }
  }

  async function handleSubmit() {
    try {
      const payload = buildPayload();

      if (store.scheduleEnabled) {
        if (!store.scheduledAt) {
          toast.error("Pick a date and time to schedule.");
          return;
        }
        const iso = datetimeLocalToISO(store.scheduledAt);
        if (new Date(iso).getTime() <= Date.now()) {
          toast.error("Schedule a time in the future.");
          return;
        }
        setSubmitting(true);
        await api.schedulePost({ ...payload, scheduledAt: iso, timezone: tz });
        toast.success("Scheduled", {
          description: "Added to your queue.",
        });
      } else {
        setSubmitting(true);
        await api.publishPost(payload);
        toast.success(isThread ? "Thread posted" : "Posted to X");
      }
      store.reset();
      setQuotePreview(null);
    } catch (err) {
      const msg =
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Something went wrong";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Connection gate */}
      {online === false ? (
        <Notice tone="warning">
          Backend offline — connect the API server to publish.
        </Notice>
      ) : !account ? (
        <Notice tone="warning">
          No X account connected. Go to Settings to connect before posting.
        </Notice>
      ) : !canWrite ? (
        <Notice tone="warning">
          This account is read-only. Reconnect with write permission to publish.
        </Notice>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-[15px]">Composer</CardTitle>
            <Tabs
              value={store.mode}
              onValueChange={(v) => setMode(v as ComposerMode)}
            >
              <TabsList>
                {MODES.map((m) => (
                  <TabsTrigger key={m.value} value={m.value}>
                    <m.icon className="size-3.5" />
                    {m.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Quote / reply target inputs */}
          {store.mode === "quote" ? (
            <div className="space-y-2">
              <Label htmlFor="quote-url">Quote this post</Label>
              <div className="flex gap-2">
                <Input
                  id="quote-url"
                  placeholder="https://x.com/user/status/123…"
                  value={store.quotePostId}
                  onChange={(e) => store.setQuotePostId(e.target.value)}
                />
                <Button
                  variant="outline"
                  onClick={handlePreview}
                  disabled={previewing || !store.quotePostId.trim()}
                >
                  {previewing ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  Preview
                </Button>
              </div>
              {quotePreview ? (
                <PostPreviewCard post={quotePreview} />
              ) : null}
            </div>
          ) : null}

          {store.mode === "reply" ? (
            <div className="space-y-2">
              <Label htmlFor="reply-url">Reply to post</Label>
              <Input
                id="reply-url"
                placeholder="https://x.com/user/status/123…"
                value={store.replyToPostId}
                onChange={(e) => store.setReplyToPostId(e.target.value)}
              />
            </div>
          ) : null}

          {/* Body */}
          {isThread ? (
            <ThreadEditor
              parts={threadParts}
              onChange={store.setThreadParts}
            />
          ) : (
            <div className="space-y-2">
              <Textarea
                ref={textareaRef}
                value={store.text}
                onChange={(e) => store.setText(e.target.value)}
                placeholder={
                  store.mode === "reply"
                    ? "Write your reply…"
                    : "What are you shipping today?"
                }
                className="min-h-[160px] text-[15px] leading-relaxed"
              />
              <div className="flex items-center justify-end">
                <CharCounter count={count} />
              </div>
            </div>
          )}

          {/* Schedule */}
          <div className="rounded-lg border border-border bg-secondary/30 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <CalendarClock className="size-4 text-muted-foreground" />
                <div>
                  <Label htmlFor="schedule" className="cursor-pointer">
                    Schedule for later
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Queue it instead of posting now.
                  </p>
                </div>
              </div>
              <Switch
                id="schedule"
                checked={store.scheduleEnabled}
                onCheckedChange={store.setScheduleEnabled}
              />
            </div>
            {store.scheduleEnabled ? (
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="scheduled-at" className="text-xs">
                    When
                  </Label>
                  <Input
                    id="scheduled-at"
                    type="datetime-local"
                    value={store.scheduledAt}
                    onChange={(e) => store.setScheduledAt(e.target.value)}
                    className="w-[15rem]"
                  />
                </div>
                <p className="pb-2 text-xs text-muted-foreground">
                  Timezone: <span className="text-foreground">{tz}</span>
                </p>
              </div>
            ) : null}
          </div>
        </CardContent>

        <div className="flex flex-col gap-3 border-t border-border p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                seedAssistant(
                  isThread ? threadFilled[0] ?? "" : store.text.trim(),
                )
              }
              disabled={isThread ? !threadFilled.length : !store.text.trim()}
            >
              <Sparkles className="size-4 text-brand" />
              Improve with assistant
            </Button>
            {(store.text || threadFilled.length > 0) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  store.reset();
                  setQuotePreview(null);
                }}
              >
                <X className="size-4" /> Clear
              </Button>
            )}
          </div>

          <Button
            size="lg"
            onClick={handleSubmit}
            disabled={
              submitting || !readyText || (!canWrite && online !== null)
            }
            className="font-semibold"
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : store.scheduleEnabled ? (
              <CalendarClock className="size-4" />
            ) : (
              <Send className="size-4" />
            )}
            {store.scheduleEnabled ? "Schedule" : "Post now"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function ThreadEditor({
  parts,
  onChange,
}: {
  parts: string[];
  onChange: (parts: string[]) => void;
}) {
  function update(i: number, value: string) {
    const next = [...parts];
    next[i] = value;
    onChange(next);
  }
  function add() {
    onChange([...parts, ""]);
  }
  function remove(i: number) {
    if (parts.length <= 1) return;
    onChange(parts.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-3">
      {parts.map((part, i) => {
        const c = tweetLength(part);
        return (
          <div key={i} className="relative">
            <div className="flex items-center justify-between pb-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {i + 1}/{parts.length}
              </span>
              <div className="flex items-center gap-2">
                <CharCounter count={c} />
                {parts.length > 1 ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => remove(i)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                ) : null}
              </div>
            </div>
            <Textarea
              value={part}
              onChange={(e) => update(i, e.target.value)}
              placeholder={i === 0 ? "Start the thread…" : "Continue…"}
              className={cn(
                "min-h-[96px]",
                c > TWEET_MAX && "border-destructive/60",
              )}
            />
          </div>
        );
      })}
      <Button variant="outline" size="sm" onClick={add}>
        <Plus className="size-4" /> Add post
      </Button>
    </div>
  );
}

function Notice({
  children,
  tone = "warning",
}: {
  children: React.ReactNode;
  tone?: "warning" | "info";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3.5 py-2.5 text-sm",
        tone === "warning"
          ? "border-warning/30 bg-[color-mix(in_oklch,var(--warning)_8%,transparent)] text-warning"
          : "border-border bg-secondary/40 text-muted-foreground",
      )}
    >
      {children}
    </div>
  );
}
