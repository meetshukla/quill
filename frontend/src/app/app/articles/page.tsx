"use client";

import * as React from "react";
import { Bold, CalendarCheck, Code2, ExternalLink, FilePlus2, FileText, Italic, Link2, Plus, RefreshCw, Trash2, Underline } from "lucide-react";
import { toast } from "sonner";
import { ArticleDocument } from "@/components/article-document";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, LoadingRow } from "@/components/states";
import { api } from "@/lib/api";
import { useAccount } from "@/lib/account-context";
import { datetimeLocalToISO, formatDateTime, localTimezone } from "@/lib/format";
import type { ArticleBlock, ArticleContentState, ArticleEntity, ArticleEntityRange, ScheduledArticle } from "@/lib/types";
import { useAsync } from "@/lib/use-async";

type BlockType = "unstyled" | "header-one" | "header-two" | "header-three" | "blockquote" | "unordered-list-item" | "ordered-list-item" | "code-block";
type Selection = { index: number; start: number; end: number } | null;

function blankBlock(type: BlockType = "unstyled"): ArticleBlock {
  return { key: crypto.randomUUID().replaceAll("-", "").slice(0, 8), text: "", type, depth: 0, inlineStyleRanges: [], entityRanges: [], data: {} };
}

function initialState(): ArticleContentState { return { blocks: [blankBlock()], entities: [] }; }
function cloneState(value: ArticleContentState): ArticleContentState { return structuredClone(value); }
function previewText(state: ArticleContentState) { return state.blocks.map((block) => block.text ?? "").filter(Boolean).slice(0, 3).join(" "); }
function toLocal(value: string | null) { if (!value) return ""; const d = new Date(value); const pad = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }

export default function ArticlesPage() {
  const { selectedAccount } = useAccount();
  const data = useAsync(async () => {
    if (!selectedAccount) return { articles: [], assets: [] };
    const [articles, assets] = await Promise.all([api.listArticles(), api.listMediaAssets()]);
    return { articles: articles.articles, assets: assets.assets };
  }, [selectedAccount?.id]);
  const [editing, setEditing] = React.useState<ScheduledArticle | null | "new">(null);
  const [viewing, setViewing] = React.useState<ScheduledArticle | null>(null);
  const [scheduling, setScheduling] = React.useState<ScheduledArticle | null>(null);
  const reload = () => void data.reload();
  return <div>
    <PageHeader icon={FileText} title="Articles" description={selectedAccount ? `Native X Articles for @${selectedAccount.username}. Quill renders the same DraftJS structure that X receives.` : "Choose a connected X account."} actions={<><Button size="sm" variant="outline" onClick={reload}><RefreshCw className="size-4" /> Refresh</Button><Button size="sm" onClick={() => setEditing("new")}><FilePlus2 className="size-4" /> New article</Button></>} />
    <div className="mx-auto max-w-5xl space-y-3 px-5 py-6 sm:px-7">
      {data.loading ? <LoadingRow label="Loading Articles…" /> : !data.data?.articles.length ? <EmptyState icon={FileText} title="No Articles yet" description="Write the canonical DraftJS document here, preview it in Quill, then create an X draft only when it is ready." /> : data.data.articles.map((article) => <ArticleCard key={article.id} article={article} onOpen={() => setViewing(article)} onEdit={() => setEditing(article)} onSchedule={() => setScheduling(article)} onChanged={reload} />)}
    </div>
    <ArticleReader open={Boolean(viewing)} article={viewing} onClose={() => setViewing(null)} />
    <ArticleEditor open={editing !== null} article={editing === "new" ? null : editing} assets={data.data?.assets ?? []} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
    <ScheduleArticle open={Boolean(scheduling)} article={scheduling} onClose={() => setScheduling(null)} onSaved={() => { setScheduling(null); reload(); }} />
  </div>;
}

function ArticleCard({ article, onOpen, onEdit, onSchedule, onChanged }: { article: ScheduledArticle; onOpen(): void; onEdit(): void; onSchedule(): void; onChanged(): void }) {
  const [busy, setBusy] = React.useState(false);
  async function review() { setBusy(true); try { const result = await api.createArticleReview(article.id); window.open(result.article.reviewUrl ?? "", "_blank", "noopener,noreferrer"); toast.success("X Article draft created for review"); onChanged(); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not create X review"); } finally { setBusy(false); } }
  async function remove() { if (!confirm("Delete this unpublished Article?")) return; setBusy(true); try { await api.deleteArticle(article.id); onChanged(); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not delete Article"); } finally { setBusy(false); } }
  const canEdit = !["PUBLISHED", "PUBLISHING"].includes(article.status);
  return <Card className="overflow-hidden p-0"><div className="p-5"><div className="flex flex-wrap items-center gap-2"><Badge variant={article.status === "FAILED" ? "destructive" : article.status === "SCHEDULED" ? "brand" : article.status === "PUBLISHED" ? "success" : "outline"}>{article.status}</Badge>{article.scheduledAt ? <span className="text-xs text-muted-foreground">{formatDateTime(article.scheduledAt)} · {article.timezone}</span> : null}</div><h2 className="mt-3 text-xl font-semibold tracking-tight">{article.title}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{previewText(article.contentState).slice(0, 330)}</p>{article.errorMessage ? <p className="mt-3 rounded border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">{article.errorMessage}</p> : null}</div><div className="flex flex-wrap gap-2 border-t border-border bg-muted/20 px-5 py-3"><Button size="sm" variant="outline" onClick={onOpen}>Open article</Button>{canEdit ? <Button size="sm" variant="outline" onClick={onEdit}>Edit</Button> : null}{article.status === "DRAFT" || article.status === "FAILED" ? <Button size="sm" onClick={review} disabled={busy}>Create X draft</Button> : null}{article.reviewUrl ? <Button size="sm" variant="outline" asChild><a href={article.reviewUrl} target="_blank" rel="noreferrer">Review on X <ExternalLink className="size-3.5" /></a></Button> : null}{article.status === "REVIEW" ? <Button size="sm" onClick={onSchedule}><CalendarCheck className="size-3.5" /> Schedule</Button> : null}{canEdit ? <Button size="sm" variant="ghost" onClick={remove} disabled={busy}><Trash2 className="size-3.5" /> Delete</Button> : null}</div></Card>;
}

function ArticleReader({ open, article, onClose }: { open: boolean; article: ScheduledArticle | null; onClose(): void }) {
  return <Dialog open={open} onOpenChange={(value) => !value && onClose()}><DialogContent className="max-h-[94vh] max-w-4xl overflow-y-auto p-0"><div className="sticky top-0 z-10 border-b border-border bg-card/95 px-6 py-4 backdrop-blur"><DialogHeader><DialogTitle>{article?.title}</DialogTitle><DialogDescription>Quill preview — this is the DraftJS article structure, not a flattened text export.</DialogDescription></DialogHeader></div>{article ? <div className="px-6 py-8 sm:px-12"><ArticleDocument contentState={article.contentState} /></div> : null}</DialogContent></Dialog>;
}

function ArticleEditor({ open, article, assets, onClose, onSaved }: { open: boolean; article: ScheduledArticle | null; assets: { id: string; filename: string }[]; onClose(): void; onSaved(): void }) {
  const [title, setTitle] = React.useState("");
  const [contentState, setContentState] = React.useState<ArticleContentState>(initialState());
  const [coverAssetId, setCoverAssetId] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => { if (!open) return; setTitle(article?.title ?? ""); setContentState(article ? cloneState(article.contentState) : initialState()); setCoverAssetId(article?.coverAssetId ?? ""); }, [open, article]);
  async function save() {
    if (!title.trim() || !contentState.blocks.some((block) => block.text?.trim())) return toast.error("Add a title and article body");
    setSaving(true);
    try { const payload = { title: title.trim(), contentState, coverAssetId: coverAssetId || null }; if (article) await api.updateArticle(article.id, payload); else await api.createArticle(payload); toast.success(article ? "Article updated — create a fresh X review before scheduling." : "Article saved as a Quill draft."); onSaved(); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save Article"); } finally { setSaving(false); }
  }
  return <Dialog open={open} onOpenChange={(value) => !value && onClose()}><DialogContent className="max-h-[94vh] max-w-6xl overflow-y-auto"><DialogHeader><DialogTitle>{article ? "Edit Article" : "New Article"}</DialogTitle><DialogDescription>Use semantic blocks and inline formatting. Quill keeps the DraftJS document intact; any edit requires a fresh X review before scheduling.</DialogDescription></DialogHeader><div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]"><div className="space-y-4"><div><Label htmlFor="article-title">Title</Label><Input id="article-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={400} /></div><BlockEditor value={contentState} onChange={setContentState} /><div><Label htmlFor="article-cover">Cover asset</Label><select id="article-cover" value={coverAssetId} onChange={(event) => setCoverAssetId(event.target.value)} className="mt-1 flex h-8 w-full rounded-md border border-input bg-card/40 px-2.5 text-[13px]"><option value="">No cover</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.filename}</option>)}</select></div></div><div className="min-w-0 rounded-xl border border-border bg-muted/15 p-5"><p className="mb-4 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Live article preview</p><h1 className="text-2xl font-bold tracking-tight">{title || "Untitled Article"}</h1><ArticleDocument contentState={contentState} className="mt-6" /></div></div><DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Article"}</Button></DialogFooter></DialogContent></Dialog>;
}

function BlockEditor({ value, onChange }: { value: ArticleContentState; onChange(value: ArticleContentState): void }) {
  const [selection, setSelection] = React.useState<Selection>(null);
  const [linkUrl, setLinkUrl] = React.useState("");
  const update = (mutate: (next: ArticleContentState) => void) => { const next = cloneState(value); mutate(next); onChange(next); };
  function toggleStyle(style: string) {
    if (!selection || selection.start === selection.end) return toast.error("Select text in a block first");
    update((next) => { const block = next.blocks[selection.index]; const range = { offset: selection.start, length: selection.end - selection.start, style }; const styles = block.inlineStyleRanges ?? []; const exact = styles.findIndex((item) => item.style === style && item.offset === range.offset && item.length === range.length); block.inlineStyleRanges = exact >= 0 ? styles.filter((_, index) => index !== exact) : [...styles, range]; });
  }
  function addLink() {
    if (!selection || selection.start === selection.end || !/^https?:\/\//.test(linkUrl)) return toast.error("Select text and enter a valid https URL");
    update((next) => { const key = String(next.entities.length); next.entities.push({ key, value: { type: "LINK", mutability: "MUTABLE", data: { url: linkUrl } } } as ArticleEntity); const block = next.blocks[selection.index]; block.entityRanges = [...(block.entityRanges ?? []), { key, offset: selection.start, length: selection.end - selection.start } as ArticleEntityRange]; });
    setLinkUrl("");
  }
  return <div className="space-y-3"><div className="rounded-lg border border-border bg-muted/25 p-2"><div className="flex flex-wrap items-center gap-1"><FormatButton label="Bold" icon={<Bold />} onClick={() => toggleStyle("BOLD")} /><FormatButton label="Italic" icon={<Italic />} onClick={() => toggleStyle("ITALIC")} /><FormatButton label="Underline" icon={<Underline />} onClick={() => toggleStyle("UNDERLINE")} /><FormatButton label="Code" icon={<Code2 />} onClick={() => toggleStyle("CODE")} /><div className="mx-1 hidden h-5 w-px bg-border sm:block" /><Input value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https:// link for selected text" className="h-7 min-w-[180px] flex-1 text-xs" /><Button size="sm" variant="outline" onClick={addLink}><Link2 className="size-3.5" /> Link</Button></div><p className="mt-2 text-xs text-muted-foreground">Select text in a block, then apply formatting. Existing ranges are preserved when you open and save an Article.</p></div>{value.blocks.map((block, index) => <div key={block.key ?? index} className="rounded-lg border border-border bg-card p-2"><div className="mb-2 flex items-center gap-2"><select value={block.type ?? "unstyled"} onChange={(event) => update((next) => { next.blocks[index].type = event.target.value; })} className="h-7 rounded-md border border-input bg-muted/20 px-2 text-xs"><option value="unstyled">Paragraph</option><option value="header-one">Title</option><option value="header-two">Heading</option><option value="header-three">Subheading</option><option value="blockquote">Quote</option><option value="unordered-list-item">Bullets</option><option value="ordered-list-item">Numbered list</option><option value="code-block">Code</option></select><span className="ml-auto text-xs text-muted-foreground">Block {index + 1}</span><Button size="icon-sm" variant="ghost" title="Delete block" onClick={() => update((next) => { next.blocks.splice(index, 1); if (!next.blocks.length) next.blocks.push(blankBlock()); })}><Trash2 className="size-3.5" /></Button></div><Textarea value={block.text ?? ""} onChange={(event) => update((next) => { next.blocks[index].text = event.target.value; })} onSelect={(event) => setSelection({ index, start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd })} className="min-h-20 resize-y border-0 bg-transparent p-1 text-sm shadow-none focus-visible:ring-0" placeholder="Write this block…" /></div>)}<Button size="sm" variant="outline" onClick={() => update((next) => next.blocks.push(blankBlock()))}><Plus className="size-3.5" /> Add block</Button></div>;
}

function FormatButton({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick(): void }) { return <Button size="icon-sm" variant="ghost" title={label} onClick={onClick}>{icon}</Button>; }

function ScheduleArticle({ open, article, onClose, onSaved }: { open: boolean; article: ScheduledArticle | null; onClose(): void; onSaved(): void }) {
  const [value, setValue] = React.useState(""); const [saving, setSaving] = React.useState(false);
  React.useEffect(() => setValue(toLocal(article?.scheduledAt ?? null)), [article]);
  async function save() { if (!article || !value) return; setSaving(true); try { await api.scheduleArticle(article.id, datetimeLocalToISO(value), localTimezone()); toast.success("Article scheduled"); onSaved(); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not schedule Article"); } finally { setSaving(false); } }
  return <Dialog open={open} onOpenChange={(value) => !value && onClose()}><DialogContent><DialogHeader><DialogTitle>Schedule Article</DialogTitle><DialogDescription>Only the reviewed X draft will be published.</DialogDescription></DialogHeader><div><Label htmlFor="article-time">Publish time</Label><Input id="article-time" type="datetime-local" value={value} onChange={(event) => setValue(event.target.value)} /></div><DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={!value || saving}>Schedule</Button></DialogFooter></DialogContent></Dialog>;
}
