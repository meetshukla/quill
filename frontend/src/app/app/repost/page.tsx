"use client";

import * as React from "react";
import {
  Clock,
  Loader2,
  Pause,
  Play,
  Plus,
  Repeat2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { PostPreviewCard } from "@/components/post-preview";
import { AutomationStatusBadge } from "@/components/automation-status-badge";
import {
  ConnectPrompt,
  EmptyState,
  LoadingRow,
  OfflineState,
} from "@/components/states";
import { api } from "@/lib/api";
import { useAccount } from "@/lib/account-context";
import { useAsync } from "@/lib/use-async";
import {
  datetimeLocalToISO,
  formatDateTime,
  formatRelative,
} from "@/lib/format";
import type { RepostRule, XPostPreview } from "@/lib/types";

function defaultNextRun(cadenceHours: number): string {
  const d = new Date(Date.now() + cadenceHours * 3600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export default function RepostPage() {
  const { account, online } = useAccount();
  const rules = useAsync(
    () => api.listRepostRules().then((r) => r.rules),
    [],
  );

  return (
    <div>
      <PageHeader
        icon={Repeat2}
        title="Auto-repost"
        description="Keep an evergreen post in rotation. Paste a URL, set a cadence, and it reposts on schedule."
      />
      <div className="mx-auto max-w-3xl space-y-5 px-5 py-6 sm:px-7">
        {online === false ? (
          <OfflineState onRetry={rules.reload} />
        ) : online && !account ? (
          <ConnectPrompt feature="auto-repost" />
        ) : (
          <>
            <NewRuleCard onCreated={() => rules.reload()} />

            <div className="space-y-3">
              <h2 className="text-sm font-medium">Rules</h2>
              {rules.loading ? (
                <LoadingRow />
              ) : rules.data && rules.data.length > 0 ? (
                rules.data.map((rule) => (
                  <RuleRow
                    key={rule.id}
                    rule={rule}
                    onChanged={() => rules.reload()}
                  />
                ))
              ) : (
                <EmptyState
                  icon={Repeat2}
                  title="No repost rules yet"
                  description="Got a post that always lands? Put it on a cadence so new followers keep seeing it."
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function NewRuleCard({ onCreated }: { onCreated: () => void }) {
  const [url, setUrl] = React.useState("");
  const [cadence, setCadence] = React.useState(72);
  const [nextRun, setNextRun] = React.useState(() => defaultNextRun(72));
  const [preview, setPreview] = React.useState<XPostPreview | null>(null);
  const [validated, setValidated] = React.useState(false);
  const [validating, setValidating] = React.useState(false);
  const [creating, setCreating] = React.useState(false);

  async function validate() {
    if (!url.trim()) {
      toast.error("Paste an X post URL.");
      return;
    }
    setValidating(true);
    setPreview(null);
    try {
      const res = await api.validateRepost(url.trim());
      setPreview(res.post);
      setValidated(true);
      if (!res.post) toast.message("URL looks valid, but no preview available.");
    } catch (err) {
      setValidated(false);
      toast.error(err instanceof Error ? err.message : "Validation failed");
    } finally {
      setValidating(false);
    }
  }

  async function create() {
    if (!validated) {
      toast.error("Validate the URL first.");
      return;
    }
    const iso = datetimeLocalToISO(nextRun);
    if (!iso) {
      toast.error("Pick a valid next-run time.");
      return;
    }
    setCreating(true);
    try {
      await api.createRepost({
        sourceUrl: url.trim(),
        cadenceHours: cadence,
        nextRunAt: iso,
      });
      toast.success("Repost rule created");
      setUrl("");
      setPreview(null);
      setValidated(false);
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[15px]">New repost rule</CardTitle>
        <CardDescription>
          Reposts the same post every N hours starting at your chosen time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="repost-url">Post URL</Label>
          <div className="flex gap-2">
            <Input
              id="repost-url"
              placeholder="https://x.com/you/status/123…"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setValidated(false);
                setPreview(null);
              }}
            />
            <Button
              variant="outline"
              onClick={validate}
              disabled={validating || !url.trim()}
            >
              {validating ? <Loader2 className="size-4 animate-spin" /> : null}
              Validate
            </Button>
          </div>
          {preview ? <PostPreviewCard post={preview} /> : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="cadence">Cadence (hours)</Label>
            <Input
              id="cadence"
              type="number"
              min={1}
              value={cadence}
              onChange={(e) => {
                const v = Math.max(1, Number(e.target.value) || 0);
                setCadence(v);
                setNextRun(defaultNextRun(v));
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="next-run">First run</Label>
            <Input
              id="next-run"
              type="datetime-local"
              value={nextRun}
              onChange={(e) => setNextRun(e.target.value)}
            />
          </div>
        </div>

        <Separator />
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Every {cadence}h · next {formatRelative(datetimeLocalToISO(nextRun))}
          </p>
          <Button size="sm" onClick={create} disabled={creating || !validated}>
            {creating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Create rule
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RuleRow({
  rule,
  onChanged,
}: {
  rule: RepostRule;
  onChanged: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const paused = rule.status === "PAUSED";

  async function toggle() {
    setBusy(true);
    try {
      await api.updateRepostRule(rule.id, {
        status: paused ? "ACTIVE" : "PAUSED",
      });
      toast.success(paused ? "Rule resumed" : "Rule paused");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.deleteRepostRule(rule.id);
      toast.success("Rule deleted");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <AutomationStatusBadge status={rule.status} />
            <span className="text-xs text-muted-foreground">
              every {rule.cadenceHours}h
            </span>
          </div>
          <a
            href={rule.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-sm text-foreground hover:underline"
          >
            {rule.sourceUrl}
          </a>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-3.5" /> next {formatDateTime(rule.nextRunAt)}{" "}
              · {formatRelative(rule.nextRunAt)}
            </span>
            {rule.lastRunAt ? (
              <span>last {formatRelative(rule.lastRunAt)}</span>
            ) : null}
          </div>
          {rule.errorMessage ? (
            <p className="text-xs text-destructive">{rule.errorMessage}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggle}
            disabled={busy}
            aria-label={paused ? "Resume" : "Pause"}
          >
            {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={remove}
            disabled={busy}
            aria-label="Delete rule"
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
