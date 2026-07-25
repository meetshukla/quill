"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, FileText, LayoutDashboard, Send, XCircle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/use-async";
import { useAccount } from "@/lib/account-context";

type Filter = "all" | string;

export default function AppIndex() {
  const { accounts } = useAccount();
  const [filter, setFilter] = React.useState<Filter>("all");
  const workspace = useAsync(() => api.getWorkspace(), []);
  const visible = (workspace.data?.accounts ?? []).filter((entry) => filter === "all" || entry.account.id === filter);
  const posts = visible.flatMap((entry) => Object.values(entry.queue).flat().map((post) => ({ post, account: entry.account })));
  const articles = visible.flatMap((entry) => entry.articles.map((article) => ({ article, account: entry.account })));
  const scheduled = [...posts.filter(({ post }) => post.status === "SCHEDULED"), ...articles.filter(({ article }) => article.status === "SCHEDULED")]
    .map((item) => "post" in item ? ({ id: item.post.id, account: item.account, title: item.post.text || item.post.threadParts?.parts?.[0] || "Untitled post", when: item.post.scheduledAt, href: "/app/posts", kind: "Post" }) : ({ id: item.article.id, account: item.account, title: item.article.title, when: item.article.scheduledAt!, href: "/app/articles", kind: "Article" }))
    .sort((a, b) => new Date(a.when).getTime() - new Date(b.when).getTime());
  const failed = posts.filter(({ post }) => post.status === "FAILED").length + articles.filter(({ article }) => article.status === "FAILED").length;

  return <div>
    <PageHeader icon={LayoutDashboard} title="Overview" description="Shared publishing workspace for both X accounts." />
    <div className="mx-auto max-w-5xl space-y-6 px-5 py-6 sm:px-7">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>Both accounts</Button>
        {accounts.map((account) => <Button key={account.id} size="sm" variant={filter === account.id ? "default" : "outline"} onClick={() => setFilter(account.id)}>@{account.username}{account.isOwner ? " · Mine" : ""}</Button>)}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric icon={CalendarDays} label="Scheduled" value={scheduled.length} href="/app/posts" />
        <Metric icon={FileText} label="Active articles" value={articles.filter(({ article }) => !["PUBLISHED", "FAILED"].includes(article.status)).length} href="/app/articles" />
        <Metric icon={XCircle} label="Needs attention" value={failed} href="/app/posts" />
      </div>
      <Calendar events={scheduled} />
      <div className="grid gap-3 sm:grid-cols-2"><Quick href="/app/posts" icon={Send} title="Manage posts" text="Edit drafts, media, timing, retries, and published posts." /><Quick href="/app/articles" icon={FileText} title="Manage articles" text="Write, review on X, schedule, and adjust Article timing." /></div>
    </div>
  </div>;
}

function Metric({ icon: Icon, label, value, href }: { icon: typeof CalendarDays; label: string; value: number; href: string }) { return <Link href={href}><Card className="p-4 transition-colors hover:bg-accent/40"><Icon className="mb-3 size-4 text-brand" /><p className="text-2xl font-semibold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></Card></Link>; }
function Quick({ href, icon: Icon, title, text }: { href: string; icon: typeof Send; title: string; text: string }) { return <Link href={href}><Card className="p-4 transition-colors hover:bg-accent/40"><Icon className="mb-3 size-4 text-brand" /><h2 className="text-sm font-semibold">{title}</h2><p className="mt-1 text-xs text-muted-foreground">{text}</p></Card></Link>; }

function Calendar({ events }: { events: { id: string; account: { username: string }; title: string; when: string; href: string; kind: string }[] }) {
  const [month, setMonth] = React.useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const key = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const byDay = new Map<string, typeof events>(); for (const event of events) { const day = key(new Date(event.when)); byDay.set(day, [...(byDay.get(day) ?? []), event]); }
  const first = new Date(month.getFullYear(), month.getMonth(), 1); first.setDate(first.getDate() - first.getDay()); const last = new Date(month.getFullYear(), month.getMonth()+1, 0); last.setDate(last.getDate() + (6-last.getDay())); const days: Date[] = []; for (let date = new Date(first); date <= last; date.setDate(date.getDate()+1)) days.push(new Date(date));
  return <Card className="overflow-hidden"><div className="flex items-center justify-between border-b border-border p-4"><div><h2 className="text-sm font-semibold">Calendar</h2><p className="text-xs text-muted-foreground">Posts and Articles across the selected accounts.</p></div><div className="flex items-center gap-1"><Button variant="ghost" size="icon-sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth()-1, 1))}><ChevronLeft className="size-4" /></Button><span className="w-28 text-center text-sm font-medium">{month.toLocaleDateString(undefined, { month: "short", year: "numeric" })}</span><Button variant="ghost" size="icon-sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth()+1, 1))}><ChevronRight className="size-4" /></Button></div></div><div className="grid grid-cols-7 border-l border-t border-border">{"SMTWTFS".split("").map((day, index) => <div key={`${day}${index}`} className="border-b border-r border-border px-2 py-1 text-[10px] font-medium text-muted-foreground">{day}</div>)}{days.map((date) => <div key={key(date)} className={`min-h-28 border-b border-r border-border p-1.5 ${date.getMonth() !== month.getMonth() ? "bg-muted/20" : ""}`}><p className="mb-1 text-[11px] text-muted-foreground">{date.getDate()}</p><div className="space-y-1">{(byDay.get(key(date)) ?? []).slice(0, 3).map((event) => <Link key={event.id} href={event.href} className="block rounded bg-accent px-1.5 py-1 text-[10px] leading-tight hover:bg-brand/20"><span className="font-medium">@{event.account.username}</span> · {event.kind}<br /><span className="line-clamp-1">{event.title}</span></Link>)}</div></div>)}</div></Card>;
}
