"use client";

import * as React from "react";
import {
  Clock,
  Loader2,
  Megaphone,
  Pause,
  Play,
  Plus,
  Repeat2,
  Save,
  Trash2,
  Zap,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  parseXPostId,
} from "@/lib/format";
import type { CtaAutomation, RepostRule, XPostPreview } from "@/lib/types";

export default function AutomationsPage() {
  const { account, online } = useAccount();

  return (
    <div>
      <PageHeader
        icon={Zap}
        title="Automations"
        description="Set-and-forget rules: plug your CTA when a post lands, and recycle evergreen posts."
      />
      <div className="mx-auto max-w-3xl px-5 py-6 sm:px-7">
        {online === false ? (
          <OfflineState />
        ) : online && !account ? (
          <ConnectPrompt feature="automations" />
        ) : (
          <Tabs defaultValue="cta">
            <TabsList>
              <TabsTrigger value="cta">
                <Megaphone /> CTA auto-plug
              </TabsTrigger>
              <TabsTrigger value="repost">
                <Repeat2 /> Auto-repost
              </TabsTrigger>
            </TabsList>
            <TabsContent value="cta">
              <CtaPanel />
            </TabsContent>
            <TabsContent value="repost">
              <RepostPanel />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------- CTA ---------------------------------- */

function CtaPanel() {
  const cta = useAsync(() => api.getCta().then((r) => r.cta), []);
  const automations = useAsync(
    () => api.listCtaAutomations().then((r) => r.automations),
    [],
  );
  const [defaultText, setDefaultText] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const seeded = React.useRef(false);

  React.useEffect(() => {
    if (!seeded.current && cta.data !== null) {
      setDefaultText(cta.data?.text ?? "");
      seeded.current = true;
    }
  }, [cta.data]);

  async function saveDefault() {
    setSaving(true);
    try {
      await api.saveCta(defaultText);
      toast.success("Default CTA saved");
      void cta.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-[15px]">Default CTA</CardTitle>
          <CardDescription>
            Your go-to reply — a link, an offer, a follow nudge.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {cta.loading ? (
            <LoadingRow />
          ) : (
            <>
              <Input
                value={defaultText}
                onChange={(e) => setDefaultText(e.target.value)}
                placeholder="If this resonated, I write about shipping daily → [link]"
              />
              <div className="flex justify-end">
                <Button size="sm" onClick={saveDefault} disabled={saving}>
                  {saving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  Save default
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <NewCtaAutomation
        defaultText={defaultText}
        onCreated={() => automations.reload()}
      />

      <div className="space-y-3">
        <h2 className="text-sm font-medium">Active automations</h2>
        {automations.loading ? (
          <LoadingRow />
        ) : automations.data && automations.data.length > 0 ? (
          automations.data.map((a) => (
            <CtaRow key={a.id} automation={a} onDeleted={() => automations.reload()} />
          ))
        ) : (
          <EmptyState
            icon={Megaphone}
            title="No automations yet"
            description="Pick a post that's gaining traction and let your CTA fire once it crosses your like threshold."
          />
        )}
      </div>
    </div>
  );
}

function NewCtaAutomation({
  defaultText,
  onCreated,
}: {
  defaultText: string;
  onCreated: () => void;
}) {
  const [url, setUrl] = React.useState("");
  const [text, setText] = React.useState("");
  const [threshold, setThreshold] = React.useState(50);
  const [busy, setBusy] = React.useState(false);
  const effectiveText = text.trim() || defaultText;

  async function create() {
    const sourceXPostId = parseXPostId(url);
    if (!sourceXPostId) return toast.error("Enter a valid X post URL or id.");
    if (!effectiveText.trim())
      return toast.error("Add CTA text (or save a default first).");
    setBusy(true);
    try {
      await api.createCtaAutomation({
        sourceXPostId,
        ctaText: effectiveText,
        likeThreshold: threshold,
      });
      toast.success("Automation created");
      setUrl("");
      setText("");
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[15px]">Auto-plug a post</CardTitle>
        <CardDescription>
          When this post crosses the like threshold, reply once with your CTA.
          Duplicate-prevented · 7-day window.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="cta-url">Post URL</Label>
          <Input
            id="cta-url"
            placeholder="https://x.com/you/status/123…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div className="space-y-2">
            <Label htmlFor="cta-text">CTA reply</Label>
            <Input
              id="cta-text"
              placeholder={defaultText || "Your call-to-action…"}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cta-threshold">Likes</Label>
            <Input
              id="cta-threshold"
              type="number"
              min={1}
              value={threshold}
              onChange={(e) =>
                setThreshold(Math.max(1, Number(e.target.value) || 0))
              }
              className="w-24"
            />
          </div>
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Fires at most once per post.
          </p>
          <Button size="sm" onClick={create} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Create
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CtaRow({
  automation,
  onDeleted,
}: {
  automation: CtaAutomation;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  async function remove() {
    setBusy(true);
    try {
      await api.deleteCtaAutomation(automation.id);
      toast.success("Automation removed");
      onDeleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <AutomationStatusBadge status={automation.status} />
            <span className="text-xs text-muted-foreground">
              ≥ {automation.likeThreshold} likes · expires{" "}
              {formatRelative(automation.expiresAt)}
            </span>
          </div>
          <p className="line-clamp-2 text-sm">{automation.ctaText}</p>
          <p className="font-mono text-[11px] text-muted-foreground">
            post {automation.sourceXPostId}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={remove}
          disabled={busy}
          className="text-muted-foreground hover:text-destructive"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
        </Button>
      </div>
    </Card>
  );
}

/* -------------------------------- Repost --------------------------------- */

function defaultNextRun(cadenceHours: number): string {
  const d = new Date(Date.now() + cadenceHours * 3600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function RepostPanel() {
  const rules = useAsync(() => api.listRepostRules().then((r) => r.rules), []);
  return (
    <div className="space-y-5">
      <NewRepostRule onCreated={() => rules.reload()} />
      <div className="space-y-3">
        <h2 className="text-sm font-medium">Rules</h2>
        {rules.loading ? (
          <LoadingRow />
        ) : rules.data && rules.data.length > 0 ? (
          rules.data.map((rule) => (
            <RepostRow key={rule.id} rule={rule} onChanged={() => rules.reload()} />
          ))
        ) : (
          <EmptyState
            icon={Repeat2}
            title="No repost rules yet"
            description="Got a post that always lands? Put it on a cadence so new followers keep seeing it."
          />
        )}
      </div>
    </div>
  );
}

function NewRepostRule({ onCreated }: { onCreated: () => void }) {
  const [url, setUrl] = React.useState("");
  const [cadence, setCadence] = React.useState(72);
  const [nextRun, setNextRun] = React.useState(() => defaultNextRun(72));
  const [preview, setPreview] = React.useState<XPostPreview | null>(null);
  const [validated, setValidated] = React.useState(false);
  const [validating, setValidating] = React.useState(false);
  const [creating, setCreating] = React.useState(false);

  async function validate() {
    if (!url.trim()) return toast.error("Paste an X post URL.");
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
    if (!validated) return toast.error("Validate the URL first.");
    const iso = datetimeLocalToISO(nextRun);
    if (!iso) return toast.error("Pick a valid first-run time.");
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
          Re-posts the same post every N hours, starting at your chosen time.
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
            {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Create rule
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RepostRow({
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
      await api.updateRepostRule(rule.id, { status: paused ? "ACTIVE" : "PAUSED" });
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
            className="block truncate text-sm hover:underline"
          >
            {rule.sourceUrl}
          </a>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-3.5" /> next {formatDateTime(rule.nextRunAt)} ·{" "}
              {formatRelative(rule.nextRunAt)}
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
