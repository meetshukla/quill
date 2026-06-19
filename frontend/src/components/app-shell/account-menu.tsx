"use client";

import * as React from "react";
import Link from "next/link";
import {
  ChevronsUpDown,
  LogOut,
  Plus,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import { useAccount } from "@/lib/account-context";

export function AccountMenu() {
  const { account, online, refresh } = useAccount();
  const [busy, setBusy] = React.useState(false);

  const initials = (account?.displayName || account?.username || "?")
    .slice(0, 2)
    .toUpperCase();

  async function handleConnect() {
    setBusy(true);
    try {
      const { url } = await api.connectStart(
        `${window.location.origin}/app/settings?x_connected=1`,
      );
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start OAuth");
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    setBusy(true);
    try {
      await api.disconnect();
      await refresh();
      toast.success("Disconnected from X");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Disconnect failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="group flex w-full items-center gap-2.5 rounded-lg border border-transparent p-2 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50">
        <Avatar className="size-8">
          {account?.avatarUrl ? (
            <AvatarImage src={account.avatarUrl} alt={account.username} />
          ) : null}
          <AvatarFallback>{account ? initials : "·"}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium leading-tight">
            {account ? `@${account.username}` : "Not connected"}
          </p>
          <p className="truncate text-[11px] leading-tight text-muted-foreground">
            {online === false
              ? "Backend offline"
              : account
                ? "Connected"
                : "Connect X to begin"}
          </p>
        </div>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side="top"
        sideOffset={10}
        className="w-[15rem]"
      >
        {account ? (
          <>
            <div className="flex items-center gap-2.5 px-2 py-2">
              <Avatar className="size-9">
                {account.avatarUrl ? (
                  <AvatarImage src={account.avatarUrl} alt={account.username} />
                ) : null}
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {account.displayName || account.username}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  @{account.username}
                </p>
              </div>
            </div>
            <div className="px-2 pb-1.5">
              {account.writeEnabled ? (
                <Badge variant="success">
                  <ShieldCheck /> Write enabled
                </Badge>
              ) : (
                <Badge variant="warning">Read-only — reconnect to post</Badge>
              )}
            </div>
          </>
        ) : (
          <div className="px-2 py-2">
            <p className="text-sm font-medium">Not connected</p>
            <p className="text-xs text-muted-foreground">
              Connect X to start posting.
            </p>
          </div>
        )}

        <DropdownMenuSeparator />

        {!account ? (
          <DropdownMenuItem
            disabled={busy}
            onSelect={(e) => {
              e.preventDefault();
              void handleConnect();
            }}
          >
            <Plus /> Connect X
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <Link href="/app/settings">
            <Settings /> Settings
          </Link>
        </DropdownMenuItem>

        {account ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={busy}
              onSelect={(e) => {
                e.preventDefault();
                void handleDisconnect();
              }}
            >
              <LogOut /> Disconnect X
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
