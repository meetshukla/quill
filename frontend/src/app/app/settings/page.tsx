"use client";

import * as React from "react";
import {
  Loader2,
  Settings as SettingsIcon,
  ShieldCheck,
  ShieldX,
  X as XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { LoadingRow, OfflineState } from "@/components/states";
import { api } from "@/lib/api";
import { useAccount } from "@/lib/account-context";
import { formatRelative } from "@/lib/format";

export default function SettingsPage() {
  const { account, loading, online, refresh } = useAccount();
  const [connecting, setConnecting] = React.useState(false);
  const [disconnecting, setDisconnecting] = React.useState(false);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("x_connected")) {
      toast.success("X account connected");
      void refresh();
      window.history.replaceState({}, "", "/app/settings");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connect() {
    setConnecting(true);
    try {
      const { url } = await api.connectStart(
        `${window.location.origin}/app/settings?x_connected=1`,
      );
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start OAuth");
      setConnecting(false);
    }
  }

  async function disconnect() {
    setDisconnecting(true);
    try {
      await api.disconnect();
      await refresh();
      toast.success("Disconnected from X");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Disconnect failed");
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div>
      <PageHeader
        icon={SettingsIcon}
        title="Settings"
        description="Manage your X connection."
      />
      <div className="mx-auto max-w-3xl space-y-5 px-5 py-6 sm:px-7">
        {online === false ? (
          <OfflineState onRetry={refresh} />
        ) : (
          <>
            {/* X account */}
            <Card>
              <CardHeader>
                <CardTitle className="text-[15px]">X account</CardTitle>
                <CardDescription>
                  One account, confidential OAuth 2.0. Scopes cover posting and
                  media — never DMs or email.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <LoadingRow />
                ) : account ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="size-12">
                        {account.avatarUrl ? (
                          <AvatarImage
                            src={account.avatarUrl}
                            alt={account.username}
                          />
                        ) : null}
                        <AvatarFallback>
                          {(account.displayName || account.username)
                            .slice(0, 2)
                            .toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {account.displayName || account.username}
                        </p>
                        <p className="truncate text-sm text-muted-foreground">
                          @{account.username}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {account.writeEnabled ? (
                        <Badge variant="success">
                          <ShieldCheck /> Write enabled
                        </Badge>
                      ) : (
                        <Badge variant="warning">
                          <ShieldX /> Read-only
                        </Badge>
                      )}
                      {account.scopes?.map((s) => (
                        <Badge key={s} variant="outline" className="font-mono">
                          {s}
                        </Badge>
                      ))}
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Last synced {formatRelative(account.lastSyncedAt)}
                    </p>

                    <Separator />
                    <div className="flex flex-wrap gap-2">
                      {!account.writeEnabled ? (
                        <Button size="sm" onClick={connect} disabled={connecting}>
                          {connecting ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : null}
                          Reconnect with write access
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={disconnect}
                        disabled={disconnecting}
                        className="text-destructive hover:text-destructive"
                      >
                        {disconnecting ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <XIcon className="size-4" />
                        )}
                        Disconnect
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium">Not connected</p>
                      <p className="text-sm text-muted-foreground">
                        Connect X to compose, schedule, and automate.
                      </p>
                    </div>
                    <Button onClick={connect} disabled={connecting}>
                      {connecting ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : null}
                      Connect X
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
