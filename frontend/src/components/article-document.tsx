"use client";

import * as React from "react";
import { ExternalLink, ImageIcon, Play, Quote } from "lucide-react";
import type { ArticleBlock, ArticleContentState, ArticleEntity, ArticleEntityRange, ArticleInlineStyleRange } from "@/lib/types";
import { cn } from "@/lib/utils";

type ArticleDocumentProps = {
  contentState: ArticleContentState;
  className?: string;
  compact?: boolean;
};

type SourceNote = { author?: string; url?: string; notice?: string };

const mediaExtensions = /\.(avif|gif|jpe?g|png|webp)(?:[?#].*)?$/i;
const videoExtensions = /\.(m4v|mov|mp4|webm)(?:[?#].*)?$/i;

function entityMap(entities: ArticleEntity[] | undefined) {
  const values = new Map<string, ArticleEntity>();
  for (const [index, entity] of (entities ?? []).entries()) values.set(String(entity.key ?? index), entity);
  return values;
}

function ranges<T extends { offset: number; length: number }>(items: T[] | undefined, index: number) {
  return (items ?? []).filter((item) => item.offset <= index && index < item.offset + item.length);
}

function InlineText({ block, entities }: { block: ArticleBlock; entities: Map<string, ArticleEntity> }) {
  const text = block.text ?? "";
  const styles = block.inlineStyleRanges ?? [];
  const entityRanges = block.entityRanges ?? [];
  if (!text) return <br />;

  const segments: React.ReactNode[] = [];
  let start = 0;
  while (start < text.length) {
    const styleKey = ranges<ArticleInlineStyleRange>(styles, start).map((range) => range.style ?? "").sort().join("|");
    const entity = ranges<ArticleEntityRange>(entityRanges, start)[0];
    let end = start + 1;
    while (end < text.length) {
      const nextStyleKey = ranges<ArticleInlineStyleRange>(styles, end).map((range) => range.style ?? "").sort().join("|");
      const nextEntity = ranges<ArticleEntityRange>(entityRanges, end)[0];
      if (nextStyleKey !== styleKey || nextEntity?.key !== entity?.key) break;
      end += 1;
    }
    let node: React.ReactNode = text.slice(start, end);
    const active = new Set(styleKey.split("|").filter(Boolean));
    if (active.has("BOLD")) node = <strong>{node}</strong>;
    if (active.has("ITALIC")) node = <em>{node}</em>;
    if (active.has("UNDERLINE")) node = <span className="underline decoration-foreground/50 underline-offset-2">{node}</span>;
    if (active.has("CODE")) node = <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.88em]">{node}</code>;
    const href = entity ? entityHref(entities.get(String(entity.key))) : null;
    if (href) node = <a href={href} target="_blank" rel="noreferrer" className="text-brand underline decoration-brand/40 underline-offset-4 hover:decoration-brand">{node}</a>;
    segments.push(<React.Fragment key={`${start}-${end}`}>{node}</React.Fragment>);
    start = end;
  }
  return <>{segments}</>;
}

function entityHref(entity?: ArticleEntity) {
  const value = entity?.value?.data?.url;
  return typeof value === "string" && /^https?:\/\//.test(value) ? value : null;
}

function externalHref(value: string) {
  if (/^https?:\/\//.test(value)) return value;
  if (value.startsWith("/")) return `https://ghostfeed.ai${value}`;
  return value;
}

function readSourceNote(blocks: ArticleBlock[]) {
  const first = blocks[0]?.text;
  if (first !== "[Ghostfeed source import — private working draft]") return { blocks, source: null as SourceNote | null };
  const author = blocks[1]?.text?.replace(/^Original source:\s*/, "");
  const url = blocks[2]?.text;
  const notice = blocks[3]?.text;
  return { blocks: blocks.slice(4), source: { author, url, notice } };
}

function ExternalMedia({ label, url }: { label: string; url: string }) {
  const href = externalHref(url);
  if (!/^https?:\/\//.test(href)) return null;
  if (/youtube\.com\/watch\?v=|youtu\.be\//.test(href)) {
    const videoId = href.match(/[?&]v=([^&]+)/)?.[1] ?? href.split("/").pop();
    return <figure className="my-7 overflow-hidden rounded-xl border border-border bg-black shadow-sm"><div className="aspect-video"><iframe className="h-full w-full" src={`https://www.youtube-nocookie.com/embed/${videoId}`} title={label || "Embedded video"} allowFullScreen /></div><MediaCaption label={label} href={href} /></figure>;
  }
  if (videoExtensions.test(href)) return <figure className="my-7 overflow-hidden rounded-xl border border-border bg-black shadow-sm"><video controls className="max-h-[620px] w-full" src={href} /><MediaCaption label={label} href={href} /></figure>;
  if (mediaExtensions.test(href)) return <figure className="my-7 overflow-hidden rounded-xl border border-border bg-muted shadow-sm"><img src={href} alt={label || "Article media"} className="max-h-[720px] w-full object-contain" /><MediaCaption label={label} href={href} /></figure>;
  return <a href={href} target="_blank" rel="noreferrer" className="my-5 flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-brand hover:bg-muted"><ImageIcon className="size-4" /> {label || "Open linked media"}<ExternalLink className="ml-auto size-3.5" /></a>;
}

function MediaCaption({ label, href }: { label: string; href: string }) {
  return <figcaption className="flex items-center gap-2 border-t border-border bg-card px-3 py-2 text-xs text-muted-foreground"><Play className="size-3" />{label || "Article media"}<a className="ml-auto text-brand hover:underline" href={href} target="_blank" rel="noreferrer">Source</a></figcaption>;
}

function blockElement(block: ArticleBlock, entities: Map<string, ArticleEntity>) {
  const children = <InlineText block={block} entities={entities} />;
  switch (block.type) {
    case "header-one": return <h1 className="mt-11 text-3xl font-bold tracking-tight sm:text-4xl">{children}</h1>;
    case "header-two": return <h2 className="mt-10 text-2xl font-bold tracking-tight">{children}</h2>;
    case "header-three": return <h3 className="mt-8 text-xl font-semibold">{children}</h3>;
    case "blockquote": return <blockquote className="my-6 border-l-2 border-brand/70 pl-5 text-lg leading-8 text-foreground/85">{children}</blockquote>;
    case "code-block": return <pre className="my-5 overflow-x-auto rounded-lg border border-border bg-muted/55 p-4 font-mono text-[13px] leading-6 text-foreground"><code>{block.text}</code></pre>;
    default: return <p className="my-5 text-[16px] leading-7 text-foreground/95 sm:text-[17px] sm:leading-8">{children}</p>;
  }
}

function DocumentBlocks({ blocks, entities }: { blocks: ArticleBlock[]; entities: Map<string, ArticleEntity> }) {
  const output: React.ReactNode[] = [];
  let index = 0;
  while (index < blocks.length) {
    const block = blocks[index];
    const mediaLabel = block.text?.match(/^(?:Image|Embedded video):?\s*(.*)$/i);
    const next = blocks[index + 1]?.text?.match(/^(?:Media source:|Poster:)\s*(.+)$/i);
    if (mediaLabel && next) {
      output.push(<ExternalMedia key={`media-${index}`} label={mediaLabel[1]} url={next[1]} />);
      index += 2;
      continue;
    }
    const listType = block.type === "unordered-list-item" ? "ul" : block.type === "ordered-list-item" ? "ol" : null;
    if (listType) {
      const list: ArticleBlock[] = [];
      while (blocks[index]?.type === block.type) list.push(blocks[index++]);
      const List = listType;
      output.push(<List key={`list-${index}`} className={cn("my-5 space-y-2 pl-6 text-[16px] leading-7 sm:text-[17px] sm:leading-8", listType === "ul" ? "list-disc" : "list-decimal")}>{list.map((item, itemIndex) => <li key={item.key ?? itemIndex}><InlineText block={item} entities={entities} /></li>)}</List>);
      continue;
    }
    output.push(<React.Fragment key={block.key ?? index}>{blockElement(block, entities)}</React.Fragment>);
    index += 1;
  }
  return <>{output}</>;
}

export function ArticleDocument({ contentState, className, compact = false }: ArticleDocumentProps) {
  const { blocks, source } = readSourceNote(contentState.blocks ?? []);
  const entities = React.useMemo(() => entityMap(contentState.entities), [contentState.entities]);
  return <article className={cn("mx-auto max-w-2xl", compact ? "text-sm" : "", className)}>
    {source ? <aside className="mb-8 rounded-lg border border-brand/25 bg-brand/5 p-3 text-sm"><div className="flex items-center gap-2 font-medium text-foreground"><Quote className="size-4 text-brand" />Private source draft</div><p className="mt-1 text-muted-foreground">{source.author}</p>{source.url ? <a href={source.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-brand hover:underline">Open original X Article <ExternalLink className="size-3" /></a> : null}{source.notice ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{source.notice}</p> : null}</aside> : null}
    <DocumentBlocks blocks={blocks} entities={entities} />
  </article>;
}
