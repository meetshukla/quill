"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PenLine, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { isActive, primaryNav } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { useUiStore } from "@/lib/ui-store";
import { AccountMenu } from "./account-menu";
import { BrandMark } from "./brand-mark";

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      <Icon
        className={cn(
          "size-4 shrink-0 transition-colors",
          active ? "text-brand" : "text-muted-foreground group-hover:text-foreground",
        )}
      />
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const focusAssistant = useUiStore((s) => s.focusAssistant);

  return (
    <div className="flex h-full flex-col gap-1 p-2.5">
      <div className="flex items-center gap-2.5 px-1.5 py-2.5">
        <BrandMark className="size-7" />
        <span className="text-[14px] font-semibold tracking-tight">Quill</span>
      </div>

      <button
        onClick={() => focusAssistant()}
        className="mb-1 flex h-8 items-center gap-2 rounded-md border border-border bg-card/40 px-2.5 text-[13px] text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"
      >
        <Sparkles className="size-3.5 text-brand" />
        <span>Ask the assistant</span>
        <kbd className="ml-auto rounded border border-border bg-background px-1.5 py-0.5 font-sans text-[10px] tracking-wide text-muted-foreground">
          ⌘K
        </kbd>
      </button>

      <div className="px-0.5 pb-1.5 pt-0.5">
        <Button asChild className="w-full justify-center font-medium shadow-sm">
          <Link href="/app/composer" onClick={onNavigate}>
            <PenLine className="size-4" />
            New post
          </Link>
        </Button>
      </div>

      <p className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
        Workspace
      </p>
      <nav className="flex flex-col gap-0.5">
        {primaryNav.map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            active={isActive(pathname, item)}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <div className="mt-auto border-t border-border pt-2">
        <AccountMenu />
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden w-[228px] shrink-0 border-r border-border bg-card/30 lg:block">
      <div className="sticky top-0 h-svh">
        <SidebarContent />
      </div>
    </aside>
  );
}
