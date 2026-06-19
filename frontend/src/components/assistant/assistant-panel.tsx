"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowUp,
  History,
  Loader2,
  PanelRightClose,
  PenLine,
  Plus,
  Sparkles,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { useComposerStore } from "@/lib/store";
import { useUiStore } from "@/lib/ui-store";
import { useAsync } from "@/lib/use-async";
import { formatRelative } from "@/lib/format";
import type { AssistantAction } from "@/lib/types";
import { cn } from "@/lib/utils";

type LocalMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  options?: string[];
  actions?: AssistantAction[];
};

const QUICK = [
  { key: "punchier", label: "Punchier" },
  { key: "shorter", label: "Shorter" },
  { key: "hook", label: "Hook" },
  { key: "ideas", label: "Ideas" },
];

let seq = 0;
const nextId = () => `m${++seq}-${performance.now().toFixed(0)}`;

export function AssistantPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const loadDraft = useComposerStore((s) => s.loadDraft);
  const setOpen = useUiStore((s) => s.setAssistantOpen);
  const focusTick = useUiStore((s) => s.assistantFocusTick);
  const draftRef = React.useRef<HTMLTextAreaElement>(null);

  // Focus the draft box whenever the assistant is summoned (⌘K / sidebar /
  // "Improve with assistant"), seeding it with any pending text first.
  React.useEffect(() => {
    const id = window.setTimeout(() => {
      const seed = useUiStore.getState().pendingSeed;
      if (seed != null) {
        setDraft(seed);
        useUiStore.getState().clearSeed();
      }
      draftRef.current?.focus();
    }, 30);
    return () => window.clearTimeout(id);
  }, [focusTick]);

  const chats = useAsync(() => api.listChats().then((r) => r.chats), []);
  const [chatId, setChatId] = React.useState<string | undefined>(undefined);
  const [messages, setMessages] = React.useState<LocalMessage[]>([]);
  const [draft, setDraft] = React.useState("");
  const [instruction, setInstruction] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function ensureChat(): Promise<string | undefined> {
    if (chatId) return chatId;
    try {
      const { chat } = await api.createChat();
      setChatId(chat.id);
      void chats.reload();
      return chat.id;
    } catch {
      return undefined;
    }
  }

  async function run(rawInstruction: string) {
    const text = draft.trim();
    if (!text) {
      toast.error("Write a draft first.");
      return;
    }
    const instr = rawInstruction.trim() || "punchier";
    setBusy(true);
    setMessages((m) => [
      ...m,
      { id: nextId(), role: "user", content: `${labelFor(instr)} · “${truncate(text)}”` },
    ]);
    try {
      const activeChat = await ensureChat();
      const res = await api.draftRewrite({ draft: text, instruction: instr, chatId: activeChat });
      setMessages((m) => [
        ...m,
        {
          id: nextId(),
          role: "assistant",
          content: res.options.length > 1 ? "A few directions:" : "Here's a revision:",
          options: res.options,
          actions: res.actions,
        },
      ]);
      setInstruction("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Assistant failed");
      setMessages((m) => m.slice(0, -1));
    } finally {
      setBusy(false);
    }
  }

  function openInComposer(text: string, scheduledAt?: string) {
    loadDraft({
      text,
      mode: "original",
      scheduledAt: scheduledAt ? toLocalInput(scheduledAt) : undefined,
    });
    toast.success("Sent to composer");
    if (pathname !== "/app/composer") router.push("/app/composer");
  }

  function newThread() {
    setChatId(undefined);
    setMessages([]);
    setDraft("");
    setInstruction("");
  }

  return (
    <div className="flex h-full flex-col bg-card/40">
      {/* Header */}
      <div className="flex h-12 items-center gap-2 border-b border-border px-3">
        <Sparkles className="size-4 text-brand" />
        <span className="text-[13px] font-semibold">Assistant</span>
        <div className="ml-auto flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={newThread}>
                <Plus className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>New thread</TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm">
                <History className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Recent threads</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {chats.data && chats.data.length > 0 ? (
                chats.data.slice(0, 8).map((c) => (
                  <DropdownMenuItem
                    key={c.id}
                    onSelect={() => {
                      setChatId(c.id);
                      setMessages([]);
                    }}
                  >
                    <span className="truncate">{c.title || "Untitled"}</span>
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      {formatRelative(c.updatedAt)}
                    </span>
                  </DropdownMenuItem>
                ))
              ) : (
                <div className="px-2 py-2 text-xs text-muted-foreground">
                  No saved threads yet.
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setOpen(false)}
              >
                <PanelRightClose className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Hide panel</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div className="space-y-3 p-3">
          {messages.length === 0 ? (
            <Welcome onPick={(s) => setDraft(s)} />
          ) : (
            messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[90%] rounded-xl rounded-br-sm bg-secondary px-3 py-2 text-[13px] leading-relaxed">
                    {m.content}
                  </div>
                </div>
              ) : (
                <div key={m.id} className="space-y-2">
                  <p className="px-0.5 text-xs text-muted-foreground">{m.content}</p>
                  {m.options?.map((opt, i) => (
                    <OptionCard
                      key={i}
                      text={opt}
                      action={m.actions?.[i]}
                      onUseAsDraft={() => setDraft(opt)}
                      onOpenComposer={openInComposer}
                    />
                  ))}
                </div>
              ),
            )
          )}
          {busy ? (
            <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Thinking…
            </div>
          ) : null}
          <div ref={endRef} />
        </div>
      </ScrollArea>

      {/* Dock */}
      <div className="border-t border-border p-3">
        <div className="rounded-lg border border-border bg-background focus-within:border-ring/60 focus-within:ring-2 focus-within:ring-ring/25">
          <Textarea
            ref={draftRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Paste or write a draft…"
            className="min-h-[60px] border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
          <div className="flex items-center gap-1.5 border-t border-border/70 p-1.5">
            <input
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !busy) run(instruction);
              }}
              placeholder="Custom instruction…"
              className="h-7 min-w-0 flex-1 bg-transparent px-1.5 text-[13px] outline-none placeholder:text-muted-foreground/70"
            />
            <Button
              size="icon-sm"
              className="size-7"
              disabled={busy || !draft.trim()}
              onClick={() => run(instruction)}
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <ArrowUp className="size-3.5" />
              )}
            </Button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {QUICK.map((q) => (
            <button
              key={q.key}
              disabled={busy || !draft.trim()}
              onClick={() => run(q.key)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
            >
              <Wand2 className="size-3" />
              {q.label}
            </button>
          ))}
        </div>
        <p className="mt-2 px-0.5 text-[11px] text-muted-foreground">
          Suggests only — you publish. Works with analytics off.
        </p>
      </div>
    </div>
  );
}

function OptionCard({
  text,
  action,
  onUseAsDraft,
  onOpenComposer,
}: {
  text: string;
  action?: AssistantAction;
  onUseAsDraft: () => void;
  onOpenComposer: (text: string, scheduledAt?: string) => void;
}) {
  const scheduledAt =
    action && action.type === "open_composer" ? action.suggestedScheduledAt : undefined;
  return (
    <div className="rounded-lg border border-border bg-card p-2.5 ring-hairline">
      <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{text}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button size="sm" className="h-7 text-xs" onClick={() => onOpenComposer(text, scheduledAt)}>
          <PenLine className="size-3" /> Composer
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={onUseAsDraft}
        >
          Use as draft
        </Button>
      </div>
    </div>
  );
}

function Welcome({ onPick }: { onPick: (s: string) => void }) {
  const seeds = [
    "Three things I learned shipping every day for a month.",
    "A hot take about building in public I actually believe.",
    "The one habit that improved my writing most.",
  ];
  return (
    <div className="space-y-3 px-0.5 py-2">
      <div className="flex size-9 items-center justify-center rounded-lg border border-border bg-card">
        <Sparkles className="size-4 text-brand" />
      </div>
      <div>
        <p className="text-sm font-medium">Writing assistant</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          Drop a draft below, then ask for a punchier take, a stronger hook, or
          fresh angles — and open the best one in the composer.
        </p>
      </div>
      <div className="space-y-1.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Try a seed
        </p>
        {seeds.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="block w-full rounded-md border border-border bg-card/60 px-2.5 py-2 text-left text-[12px] text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function labelFor(instruction: string): string {
  const map: Record<string, string> = {
    punchier: "Punchier",
    shorter: "Shorter",
    hook: "Stronger hook",
    ideas: "More ideas",
  };
  return map[instruction] ?? instruction;
}

function truncate(text: string, n = 60): string {
  return text.length > n ? `${text.slice(0, n)}…` : text;
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}
