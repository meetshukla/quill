"use client";

import * as React from "react";
import { CalendarCheck, ExternalLink, FilePlus2, FileText, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, LoadingRow } from "@/components/states";
import { api } from "@/lib/api";
import { useAccount } from "@/lib/account-context";
import { useAsync } from "@/lib/use-async";
import { datetimeLocalToISO, formatDateTime, localTimezone } from "@/lib/format";
import type { ArticleBlock, ArticleContentState, ScheduledArticle } from "@/lib/types";

function initialState(): ArticleContentState { return { blocks: [{ key: crypto.randomUUID(), text: "", type: "unstyled", depth: 0, inlineStyleRanges: [], entityRanges: [], data: {} }], entities: [] }; }
function blocksToText(state: ArticleContentState) { return state.blocks.map((block) => block.text ?? "").join("\n\n"); }
function textToState(text: string): ArticleContentState { return { blocks: text.split(/\n{2,}/).map((value) => ({ key: crypto.randomUUID(), text: value, type: "unstyled", depth: 0, inlineStyleRanges: [], entityRanges: [], data: {} })), entities: [] }; }
function toLocal(value: string | null) { if (!value) return ""; const d = new Date(value); const pad = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }

export default function ArticlesPage() {
  const { selectedAccount } = useAccount();
  const data = useAsync(async () => {
    if (!selectedAccount) return { articles: [], assets: [] };
    const [articles, assets] = await Promise.all([api.listArticles(), api.listMediaAssets()]);
    return { articles: articles.articles, assets: assets.assets };
  }, [selectedAccount?.id]);
  const [editing, setEditing] = React.useState<ScheduledArticle | null | "new">(null);
  const [scheduling, setScheduling] = React.useState<ScheduledArticle | null>(null);
  const reload = () => void data.reload();
  return <div>
    <PageHeader icon={FileText} title="Articles" description={selectedAccount ? `Native X Articles for @${selectedAccount.username}` : "Choose a connected X account."} actions={<><Button size="sm" variant="outline" onClick={reload}><RefreshCw className="size-4" /> Refresh</Button><Button size="sm" onClick={() => setEditing("new")}><FilePlus2 className="size-4" /> New article</Button></>} />
    <div className="mx-auto max-w-4xl space-y-3 px-5 py-6 sm:px-7">
      {data.loading ? <LoadingRow label="Loading Articles…" /> : !data.data?.articles.length ? <EmptyState icon={FileText} title="No Articles yet" description="Create the canonical document here, then generate an X draft to review before scheduling." /> : data.data.articles.map((article) => <ArticleCard key={article.id} article={article} onEdit={() => setEditing(article)} onSchedule={() => setScheduling(article)} onChanged={reload} />)}
    </div>
    <ArticleEditor open={editing !== null} article={editing === "new" ? null : editing} assets={data.data?.assets ?? []} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
    <ScheduleArticle open={Boolean(scheduling)} article={scheduling} onClose={() => setScheduling(null)} onSaved={() => { setScheduling(null); reload(); }} />
  </div>;
}

function ArticleCard({ article, onEdit, onSchedule, onChanged }: { article: ScheduledArticle; onEdit(): void; onSchedule(): void; onChanged(): void }) {
  const [busy, setBusy] = React.useState(false);
  async function review() { setBusy(true); try { const result = await api.createArticleReview(article.id); window.open(result.article.reviewUrl ?? "", "_blank", "noopener,noreferrer"); toast.success("X Article draft created for review"); onChanged(); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not create X review"); } finally { setBusy(false); } }
  async function remove() { if (!confirm("Delete this unpublished Article?")) return; setBusy(true); try { await api.deleteArticle(article.id); onChanged(); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not delete Article"); } finally { setBusy(false); } }
  const canEdit = !["PUBLISHED", "PUBLISHING"].includes(article.status);
  return <Card className="p-4"><div className="flex flex-wrap items-center gap-2"><Badge variant={article.status === "FAILED" ? "destructive" : article.status === "SCHEDULED" ? "brand" : article.status === "PUBLISHED" ? "success" : "outline"}>{article.status}</Badge>{article.scheduledAt ? <span className="text-xs text-muted-foreground">{formatDateTime(article.scheduledAt)} · {article.timezone}</span> : null}</div><h2 className="mt-3 text-lg font-semibold">{article.title}</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{blocksToText(article.contentState).slice(0, 700)}</p>{article.errorMessage ? <p className="mt-3 rounded border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">{article.errorMessage}</p> : null}<div className="mt-4 flex flex-wrap gap-2">{canEdit ? <Button size="sm" variant="outline" onClick={onEdit}>Edit</Button> : null}{article.status === "DRAFT" || article.status === "FAILED" ? <Button size="sm" onClick={review} disabled={busy}>Create X draft</Button> : null}{article.reviewUrl ? <Button size="sm" variant="outline" asChild><a href={article.reviewUrl} target="_blank" rel="noreferrer">Review on X <ExternalLink className="size-3.5" /></a></Button> : null}{article.status === "REVIEW" ? <Button size="sm" onClick={onSchedule}><CalendarCheck className="size-3.5" /> Schedule</Button> : null}{canEdit ? <Button size="sm" variant="ghost" onClick={remove} disabled={busy}><Trash2 className="size-3.5" /> Delete</Button> : null}</div></Card>;
}

function ArticleEditor({ open, article, assets, onClose, onSaved }: { open: boolean; article: ScheduledArticle | null; assets: { id: string; filename: string }[]; onClose(): void; onSaved(): void }) {
  const [title, setTitle] = React.useState(""); const [body, setBody] = React.useState(""); const [coverAssetId, setCoverAssetId] = React.useState(""); const [saving, setSaving] = React.useState(false);
  React.useEffect(() => { if (!open) return; setTitle(article?.title ?? ""); setBody(article ? blocksToText(article.contentState) : ""); setCoverAssetId(article?.coverAssetId ?? ""); }, [open, article]);
  async function save() { if (!title.trim() || !body.trim()) return toast.error("Add a title and article body"); setSaving(true); try { const payload = { title: title.trim(), contentState: textToState(body), coverAssetId: coverAssetId || null }; if (article) await api.updateArticle(article.id, payload); else await api.createArticle(payload); toast.success(article ? "Article updated — create a fresh X review before scheduling." : "Article saved as a Quill draft."); onSaved(); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save Article"); } finally { setSaving(false); } }
  return <Dialog open={open} onOpenChange={(value) => !value && onClose()}><DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>{article ? "Edit Article" : "New Article"}</DialogTitle><DialogDescription>Quill stores the canonical DraftJS-compatible document. Any edit requires a fresh X review before scheduling.</DialogDescription></DialogHeader><div className="space-y-4"><div><Label htmlFor="article-title">Title</Label><Input id="article-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={400} /></div><div><Label htmlFor="article-body">Article body</Label><Textarea id="article-body" value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[360px] font-serif text-base leading-7" placeholder="Write the article. Blank lines create DraftJS paragraphs." /></div><div><Label htmlFor="article-cover">Cover asset</Label><select id="article-cover" value={coverAssetId} onChange={(e) => setCoverAssetId(e.target.value)} className="mt-1 flex h-8 w-full rounded-md border border-input bg-card/40 px-2.5 text-[13px]"><option value="">No cover</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.filename}</option>)}</select></div></div><DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Article"}</Button></DialogFooter></DialogContent></Dialog>;
}

function ScheduleArticle({ open, article, onClose, onSaved }: { open: boolean; article: ScheduledArticle | null; onClose(): void; onSaved(): void }) { const [value, setValue] = React.useState(""); const [saving, setSaving] = React.useState(false); React.useEffect(() => setValue(toLocal(article?.scheduledAt ?? null)), [article]); async function save() { if (!article || !value) return; setSaving(true); try { await api.scheduleArticle(article.id, datetimeLocalToISO(value), localTimezone()); toast.success("Article scheduled"); onSaved(); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not schedule Article"); } finally { setSaving(false); } } return <Dialog open={open} onOpenChange={(value) => !value && onClose()}><DialogContent><DialogHeader><DialogTitle>Schedule Article</DialogTitle><DialogDescription>Only the reviewed X draft will be published.</DialogDescription></DialogHeader><div><Label htmlFor="article-time">Publish time</Label><Input id="article-time" type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} /></div><DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={!value || saving}>Schedule</Button></DialogFooter></DialogContent></Dialog>; }
