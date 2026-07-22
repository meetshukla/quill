"use client";

import Link from "next/link";
import { ChevronsUpDown, Settings, ShieldCheck } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAccount } from "@/lib/account-context";

export function AccountMenu() {
  const { account, online } = useAccount();
  const initials = (account?.displayName || account?.username || "?").slice(0, 2).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="group flex w-full items-center gap-2.5 rounded-lg border border-transparent p-2 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50">
        <Avatar className="size-8">
          {account?.avatarUrl ? <AvatarImage src={account.avatarUrl} alt={account.username} /> : null}
          <AvatarFallback>{account ? initials : "·"}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium leading-tight">{account ? `@${account.username}` : "X connection missing"}</p>
          <p className="truncate text-[11px] leading-tight text-muted-foreground">{online === false ? "Backend offline" : account ? "Connected" : "Check Settings"}</p>
        </div>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" sideOffset={8} collisionPadding={12} className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[12rem]">
        {account ? <>
          <div className="flex items-center gap-2.5 px-2 py-2">
            <Avatar className="size-9">
              {account.avatarUrl ? <AvatarImage src={account.avatarUrl} alt={account.username} /> : null}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0"><p className="truncate text-sm font-medium">{account.displayName || account.username}</p><p className="truncate text-xs text-muted-foreground">@{account.username}</p></div>
          </div>
          <div className="px-2 pb-1.5">{account.writeEnabled ? <Badge variant="success"><ShieldCheck /> Write enabled</Badge> : <Badge variant="warning">Read-only</Badge>}</div>
        </> : <div className="px-2 py-2"><p className="text-sm font-medium">X connection missing</p><p className="text-xs text-muted-foreground">Add your own X API connection in Settings.</p></div>}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><Link href="/app/settings"><Settings /> Settings</Link></DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
