"use client";

import * as React from "react";
import {
  BarChart3,
  Bookmark,
  Eye,
  Heart,
  Info,
  Loader2,
  MessageCircle,
  Percent,
  RefreshCw,
  Repeat2,
  ScrollText,
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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState, LoadingRow, OfflineState } from "@/components/states";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/use-async";
import { compactNumber, formatPercent } from "@/lib/format";
import type { AnalyticsSettings, AnalyticsSummary } from "@/lib/types";
import { CostWarning } from "@/components/cost-warning";

export default function AnalyticsPage() {
  const settings = useAsync(() => api.getAnalyticsSettings(), []);
  const [summary, setSummary] = React.useState<AnalyticsSummary | null>(null);
  const [syncing, setSyncing] = React.useState(false);

  const enabled = settings.data?.analyticsEnabled ?? false;

  const loadSummary = React.useCallback(async () => {
    try {
      const res = await api.getAnalyticsSummary();
      setSummary(res.disabled ? null : res.summary);
    } catch {
      setSummary(null);
    }
  }, []);

  React.useEffect(() => {
    if (enabled) void loadSummary();
  }, [enabled, loadSummary]);

  async function sync() {
    setSyncing(true);
    try {
      const res = await api.syncAnalytics();
      if (res.skipped) {
        toast.message("Sync skipped", { description: res.skipped });
      } else {
        toast.success(`Synced ${res.synced ?? 0} posts`);
        await loadSummary();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  const offline = settings.error?.toLowerCase().includes("reach");

  return (
    <div>
      <PageHeader
        icon={BarChart3}
        title="Analytics"
        description="Optional and off by default. A light, last-7-days read — not the point of the product."
        actions={
          enabled ? (
            <Button
              variant="outline"
              size="sm"
              onClick={sync}
              disabled={syncing}
            >
              {syncing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Sync last 7 days
            </Button>
          ) : null
        }
      />
      <div className="mx-auto max-w-4xl space-y-5 px-5 py-6 sm:px-7">
        {settings.loading ? (
          <LoadingRow />
        ) : offline ? (
          <OfflineState onRetry={settings.reload} />
        ) : (
          <>
            <SettingsCard
              settings={settings.data}
              onSaved={() => settings.reload()}
            />

            {enabled ? (
              <SummaryGrid summary={summary} />
            ) : (
              <EmptyState
                icon={BarChart3}
                title="Analytics are off"
                description="This product is about consistency and post quality, not dashboards. Turn analytics on only if you want a light last-7-days read — it uses paid Owned Reads."
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SettingsCard({
  settings,
  onSaved,
}: {
  settings: AnalyticsSettings | null;
  onSaved: () => void;
}) {
  const [enabled, setEnabled] = React.useState(false);
  const [windowDays, setWindowDays] = React.useState(7);
  const [retentionDays, setRetentionDays] = React.useState(14);
  const [saving, setSaving] = React.useState(false);
  const seeded = React.useRef(false);

  React.useEffect(() => {
    if (settings && !seeded.current) {
      setEnabled(settings.analyticsEnabled);
      setWindowDays(settings.analyticsWindowDays);
      setRetentionDays(settings.analyticsRetentionDays);
      seeded.current = true;
    }
  }, [settings]);

  async function save(nextEnabled = enabled) {
    setSaving(true);
    try {
      await api.saveAnalyticsSettings({
        analyticsEnabled: nextEnabled,
        analyticsWindowDays: windowDays,
        analyticsRetentionDays: retentionDays,
      });
      toast.success("Analytics settings saved");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
      setEnabled(!nextEnabled); // revert the optimistic toggle
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-[15px]">Analytics settings</CardTitle>
            <CardDescription>
              Disabled by default. When on, only the last 7 days are tracked.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2.5">
            <Label htmlFor="analytics-enabled" className="text-sm">
              {enabled ? "On" : "Off"}
            </Label>
            <Switch
              id="analytics-enabled"
              checked={enabled}
              onCheckedChange={(v) => {
                setEnabled(v);
                void save(v);
              }}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <CostWarning />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="window-days">Window (days, max 7)</Label>
            <Input
              id="window-days"
              type="number"
              min={1}
              max={7}
              value={windowDays}
              disabled={!enabled}
              onChange={(e) =>
                setWindowDays(clamp(Number(e.target.value), 1, 7))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="retention-days">Retention (days, max 30)</Label>
            <Input
              id="retention-days"
              type="number"
              min={1}
              max={30}
              value={retentionDays}
              disabled={!enabled}
              onChange={(e) =>
                setRetentionDays(clamp(Number(e.target.value), 1, 30))
              }
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={() => save()}
            disabled={saving || !enabled}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Save window
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryGrid({ summary }: { summary: AnalyticsSummary | null }) {
  if (!summary) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No data synced yet"
        description="Run a sync to pull your last-7-days metrics."
      />
    );
  }
  const cards = [
    { label: "Posts", value: compactNumber(summary.posts), icon: ScrollText },
    { label: "Views", value: compactNumber(summary.views), icon: Eye },
    { label: "Likes", value: compactNumber(summary.likes), icon: Heart },
    { label: "Reposts", value: compactNumber(summary.reposts), icon: Repeat2 },
    { label: "Replies", value: compactNumber(summary.replies), icon: MessageCircle },
    { label: "Bookmarks", value: compactNumber(summary.bookmarks), icon: Bookmark },
    {
      label: "Engagement",
      value: formatPercent(summary.engagementRate),
      icon: Percent,
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.label} className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <c.icon className="size-4" />
            <span className="text-xs">{c.label}</span>
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
            {c.value}
          </p>
        </Card>
      ))}
      <Card className="flex items-center justify-center p-4 text-center">
        <Badge variant="outline" className="gap-1.5">
          <Info className="size-3" /> Last 7 days
        </Badge>
      </Card>
    </div>
  );
}

function clamp(n: number, min: number, max: number) {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}
