"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  LayoutDashboard,
  PenLine,
  PlugZap,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useAccount } from "@/lib/account-context";
import { useAsync } from "@/lib/use-async";
import { formatRelative } from "@/lib/format";

export default function OverviewPage() {
  const { account, online, loading } = useAccount();
  const queue = useAsync(async () => {
    try {
      const { scheduledPosts } = await api.listScheduled();
      return scheduledPosts;
    } catch {
      return [];
    }
  }, []);

  const nextPost = queue.data?.[0];

  return (
    <div>
      <PageHeader
        icon={LayoutDashboard}
        title="Your workspace"
        description="A focused home for staying consistent and shipping better posts on X."
        actions={
          <Button asChild>
            <Link href="/app/composer">
              <PenLine className="size-4" /> New post
            </Link>
          </Button>
        }
      />
      <div className="mx-auto max-w-5xl space-y-7 px-5 py-7 sm:px-7">
        {/* Greeting */}
        <div className="space-y-1">
          <p className="text-[13px] text-muted-foreground">{today()}</p>
          <h2 className="text-2xl font-semibold tracking-tight">
            {account
              ? `Let's ship something, ${(account.displayName || account.username).split(" ")[0]}.`
              : "Let's ship something today."}
          </h2>
        </div>

        {/* Status row */}
        <div className="grid gap-3 sm:grid-cols-3">
          <StatusCard
            loading={loading}
            icon={online === false ? PlugZap : CheckCircle2}
            tone={online === false ? "warning" : account ? "success" : "muted"}
            label="Connection"
            value={
              online === false
                ? "Backend offline"
                : account
                  ? `@${account.username}`
                  : "Not connected"
            }
            href="/app/settings"
            cta={account ? "Manage" : "Connect X"}
          />
          <StatusCard
            loading={queue.loading}
            icon={CalendarClock}
            tone={queue.data && queue.data.length > 0 ? "brand" : "muted"}
            label="Scheduled"
            value={`${queue.data?.length ?? 0} in queue`}
            href="/app/queue"
            cta="View queue"
          />
          <StatusCard
            loading={loading}
            icon={account?.writeEnabled ? CheckCircle2 : Sparkles}
            tone={account?.writeEnabled ? "success" : "muted"}
            label="Posting"
            value={account?.writeEnabled ? "Write enabled" : "Read-only"}
            href="/app/settings"
            cta="Permissions"
          />
        </div>

        {/* Context: next scheduled post, or a single state-aware next step */}
        {nextPost ? (
          <Card>
            <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <Badge variant="brand" className="mb-2">
                  Next up · {formatRelative(nextPost.scheduledAt)}
                </Badge>
                <p className="line-clamp-2 text-sm">
                  {nextPost.text ||
                    nextPost.threadParts?.parts?.[0] ||
                    "Scheduled post"}
                </p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/app/queue">
                  Open queue <ArrowRight className="size-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : !loading && !queue.loading ? (
          <NextStep connected={Boolean(account)} />
        ) : null}
      </div>
    </div>
  );
}

function NextStep({ connected }: { connected: boolean }) {
  const { title, body, href, cta, Icon } = connected
    ? {
        title: "Your queue is quiet",
        body: "Consistency compounds. Draft a post or two so your feed keeps moving on busy days.",
        href: "/app/composer",
        cta: "Write a post",
        Icon: PenLine,
      }
    : {
        title: "Connect your X account",
        body: "Link X to compose, schedule, and automate. One account, confidential OAuth — never DMs or email.",
        href: "/app/settings",
        cta: "Connect X",
        Icon: PlugZap,
      };

  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-4 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary text-brand">
            <Icon className="size-5" />
          </div>
          <div>
            <p className="text-sm font-medium">{title}</p>
            <p className="mt-0.5 max-w-md text-[13px] text-muted-foreground">
              {body}
            </p>
          </div>
        </div>
        <Button asChild className="shrink-0">
          <Link href={href}>
            <Icon className="size-4" /> {cta}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function today(): string {
  return new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());
}

function StatusCard({
  loading,
  icon: Icon,
  tone,
  label,
  value,
  href,
  cta,
}: {
  loading: boolean;
  icon: LucideIcon;
  tone: "success" | "warning" | "brand" | "muted";
  label: string;
  value: string;
  href: string;
  cta: string;
}) {
  const toneClass = {
    success: "text-success",
    warning: "text-warning",
    brand: "text-brand",
    muted: "text-muted-foreground",
  }[tone];

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className={`size-4 ${toneClass}`} />
        {label}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-6 w-28" />
      ) : (
        <p className="mt-2 truncate text-lg font-semibold tracking-tight">
          {value}
        </p>
      )}
      <Link
        href={href}
        className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        {cta} <ArrowRight className="size-3" />
      </Link>
    </Card>
  );
}
