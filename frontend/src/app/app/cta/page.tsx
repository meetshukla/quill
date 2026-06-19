"use client";

import * as React from "react";
import {
  Loader2,
  Megaphone,
  Plus,
  Save,
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
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  ConnectPrompt,
  EmptyState,
  LoadingRow,
  OfflineState,
} from "@/components/states";
import { AutomationStatusBadge } from "@/components/automation-status-badge";
import { api } from "@/lib/api";
import { useAccount } from "@/lib/account-context";
import { useAsync } from "@/lib/use-async";
import { parseXPostId, formatRelative } from "@/lib/format";
import type { CtaAutomation } from "@/lib/types";

export default function CtaPage() {
  const { account, online } = useAccount();
  const cta = useAsync(() => api.getCta().then((r) => r.cta), []);
  const automations = useAsync(
    () => api.listCtaAutomations().then((r) => r.automations),
    [],
  );

  const [defaultText, setDefaultText] = React.useState("");
  const [savingDefault, setSavingDefault] = React.useState(false);
  const seeded = React.useRef(false);

  React.useEffect(() => {
    if (!seeded.current && cta.data !== null) {
      setDefaultText(cta.data?.text ?? "");
      seeded.current = true;
    }
  }, [cta.data]);

  async function saveDefault() {
    setSavingDefault(true);
    try {
      await api.saveCta(defaultText);
      toast.success("Default CTA saved");
      void cta.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingDefault(false);
    }
  }

  return (
    <div>
      <PageHeader
        icon={Megaphone}
        title="CTA auto-plug"
        description="When a post takes off, drop your call-to-action as a reply — automatically, and only once."
      />
      <div className="mx-auto max-w-3xl space-y-5 px-5 py-6 sm:px-7">
        {online === false ? (
          <OfflineState onRetry={cta.reload} />
        ) : online && !account ? (
          <ConnectPrompt feature="CTA auto-plug" />
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-[15px]">Default CTA</CardTitle>
                <CardDescription>
                  Your go-to reply — a link, an offer, a follow nudge. Used as
                  the default when you auto-plug a post.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {cta.loading ? (
                  <LoadingRow />
                ) : (
                  <>
                    <Textarea
                      value={defaultText}
                      onChange={(e) => setDefaultText(e.target.value)}
                      placeholder="e.g. If this resonated, I write about shipping daily → [link]"
                      className="min-h-[88px]"
                    />
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        onClick={saveDefault}
                        disabled={savingDefault}
                      >
                        {savingDefault ? (
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

            <NewAutomationCard
              defaultText={defaultText}
              onCreated={() => automations.reload()}
            />

            <div className="space-y-3">
              <h2 className="text-sm font-medium">Active automations</h2>
              {automations.loading ? (
                <LoadingRow />
              ) : automations.data && automations.data.length > 0 ? (
                automations.data.map((a) => (
                  <AutomationRow
                    key={a.id}
                    automation={a}
                    onDeleted={() => automations.reload()}
                  />
                ))
              ) : (
                <EmptyState
                  icon={Megaphone}
                  title="No automations yet"
                  description="Pick a post that's gaining traction and let your CTA fire when it crosses your like threshold."
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function NewAutomationCard({
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
    if (!sourceXPostId) {
      toast.error("Enter a valid X post URL or id.");
      return;
    }
    if (!effectiveText.trim()) {
      toast.error("Add CTA text (or save a default first).");
      return;
    }
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
          When this post crosses your like threshold, the backend replies once
          with your CTA. Duplicate replies are prevented. Window: 7 days.
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
            <Label htmlFor="cta-text">CTA reply text</Label>
            <Textarea
              id="cta-text"
              placeholder={defaultText || "Your call-to-action reply…"}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="min-h-[64px]"
            />
            {!text.trim() && defaultText ? (
              <p className="text-xs text-muted-foreground">
                Using your default CTA.
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="cta-threshold">Like threshold</Label>
            <Input
              id="cta-threshold"
              type="number"
              min={1}
              value={threshold}
              onChange={(e) =>
                setThreshold(Math.max(1, Number(e.target.value) || 0))
              }
              className="w-28"
            />
          </div>
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Fires at most once per post.
          </p>
          <Button size="sm" onClick={create} disabled={busy}>
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Create automation
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AutomationRow({
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
