"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { Sidebar } from "./sidebar";
import { MobileTopBar } from "./mobile-nav";
import { AssistantPanel } from "@/components/assistant/assistant-panel";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useUiStore } from "@/lib/ui-store";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const assistantOpen = useUiStore((s) => s.assistantOpen);
  const setAssistantOpen = useUiStore((s) => s.setAssistantOpen);
  const focusAssistant = useUiStore((s) => s.focusAssistant);
  const toggleAssistant = useUiStore((s) => s.toggleAssistant);

  // ⌘K / Ctrl-K opens + focuses the assistant chat. ⌘J toggles the panel.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        focusAssistant();
      }
      if (meta && e.key.toLowerCase() === "j") {
        e.preventDefault();
        toggleAssistant();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [focusAssistant, toggleAssistant]);

  // Avoid hydration mismatch: render the persisted-default (open) on the server
  // and first client paint, then reconcile with localStorage after mount.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const open = mounted ? assistantOpen : true;

  return (
    <div className="flex h-svh overflow-hidden bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar />
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>

      <aside
        className={cn(
          "hidden shrink-0 border-l border-border transition-[width] duration-200 md:block",
          open ? "w-[360px]" : "w-12",
        )}
      >
        <div className="sticky top-0 h-svh">
          {open ? (
            <AssistantPanel />
          ) : (
            <div className="flex h-full flex-col items-center gap-3 py-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setAssistantOpen(true)}
                    className="flex size-9 items-center justify-center rounded-lg border border-border bg-card text-brand transition-colors hover:bg-accent"
                    aria-label="Open assistant"
                  >
                    <Sparkles className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left">Open assistant · ⌘K</TooltipContent>
              </Tooltip>
              <button
                onClick={() => setAssistantOpen(true)}
                className="mt-1 text-[11px] font-medium uppercase tracking-widest text-muted-foreground [writing-mode:vertical-rl]"
              >
                Assistant
              </button>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
