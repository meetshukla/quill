"use client";

import * as React from "react";
import {
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  LogOut,
  Settings as SettingsIcon,
  ShieldCheck,
  ShieldX,
  Terminal,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { LoadingRow, OfflineState } from "@/components/states";
import { api, clearAuthToken, type SetupStatus } from "@/lib/api";
import { useAccount } from "@/lib/account-context";
import { useAsync } from "@/lib/use-async";
import { formatRelative } from "@/lib/format";

export default function SettingsPage() {
  const { account, loading, online, refresh } = useAccount();
  const setup = useAsync(() => api.getSetupStatus(), []);

  return (
    <div>
      <PageHeader
        icon={SettingsIcon}
        title="Settings"
        description="Your private X connection and your personal agent."
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              clearAuthToken();
              window.location.href = "/login";
            }}
          >
            <LogOut className="size-4" /> Log out
          </Button>
        }
      />
      <div className="mx-auto max-w-3xl space-y-5 px-5 py-6 sm:px-7">
        {online === false ? (
          <OfflineState onRetry={refresh} />
        ) : (
          <>
            <XAppCredentialsCard
              setup={setup.data}
              onSaved={() => setup.reload()}
            />
            <XAccountCard
              account={account}
              loading={loading}
              refresh={refresh}
              hasCredentials={setup.data?.hasXCredentials ?? false}
            />
            <AgentCard connected={Boolean(account)} />
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------- Step 1: X app credentials ---------------------- */

function XAppCredentialsCard({
  setup,
  onSaved,
}: {
  setup: SetupStatus | null;
  onSaved: () => void;
}) {
  const [clientId, setClientId] = React.useState("");
  const [clientSecret, setClientSecret] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const configured = setup?.hasXCredentials ?? false;

  async function save() {
    if (!clientId.trim() || !clientSecret.trim()) {
      toast.error("Paste both the Client ID and the Client Secret.");
      return;
    }
    setSaving(true);
    try {
      await api.saveXCredentials(clientId.trim(), clientSecret.trim());
      toast.success("X app credentials saved");
      setClientId("");
      setClientSecret("");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-[15px]">
              <span className="mr-2 text-muted-foreground">1</span>Shared X app
            </CardTitle>
            <CardDescription>
              One Quill X developer app securely powers each person&apos;s separate
              connection and data.
            </CardDescription>
          </div>
          {configured ? (
            <Badge variant="success">
              <Check /> Configured
            </Badge>
          ) : (
            <Badge variant="warning">Required</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {configured ? (
          <p className="text-sm text-muted-foreground">
            The shared X developer app is ready. Connect your own X account below;
            your posts, drafts, and agent remain private to you.
          </p>
        ) : (
          <>
            <ol className="list-decimal space-y-1.5 pl-5 text-[13px] text-muted-foreground">
              <li>
                Create an app at{" "}
                <a
                  href="https://developer.x.com"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-foreground underline underline-offset-2"
                >
                  developer.x.com <ExternalLink className="size-3" />
                </a>{" "}
                (inside a Project).
              </li>
              <li>
                In <span className="text-foreground">User authentication settings</span>:
                permissions <span className="text-foreground">Read and write</span>, type{" "}
                <span className="text-foreground">Web App, Automated App or Bot</span>.
              </li>
              <li className="space-y-1">
                Set the <span className="text-foreground">Callback URI</span> to exactly:
                <CopyRow value={setup?.callbackUrl ?? "…"} />
              </li>
              <li>
                In <span className="text-foreground">Keys and tokens</span>, generate the{" "}
                <span className="text-foreground">OAuth 2.0 Client ID and Secret</span>{" "}
                and paste them below.
              </li>
            </ol>

            <Separator />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="client-id">Client ID</Label>
                <Input
                  id="client-id"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="Paste Client ID"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-secret">Client Secret</Label>
                <Input
                  id="client-secret"
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="Paste Client Secret"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={save} disabled={saving}>
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <KeyRound className="size-4" />
                )}
                Save credentials
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* --------------------------- Step 2: X connection ------------------------- */

function XAccountCard({
  account,
  loading,
  refresh,
  hasCredentials,
}: {
  account: ReturnType<typeof useAccount>["account"];
  loading: boolean;
  refresh: () => Promise<void>;
  hasCredentials: boolean;
}) {
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
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-[15px]">
              <span className="mr-2 text-muted-foreground">2</span>X account
            </CardTitle>
            <CardDescription>
              Approve once on X — Quill stores the tokens encrypted. Never your
              password, never DMs.
            </CardDescription>
          </div>
          {account ? (
            <Badge variant="success">
              <Check /> Connected
            </Badge>
          ) : (
            <Badge variant="outline">Not connected</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <LoadingRow />
        ) : account ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar className="size-12">
                {account.avatarUrl ? (
                  <AvatarImage src={account.avatarUrl} alt={account.username} />
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
              {account.writeEnabled ? (
                <Badge variant="success">
                  <ShieldCheck /> Write enabled
                </Badge>
              ) : (
                <Badge variant="warning">
                  <ShieldX /> Read-only
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Last synced {formatRelative(account.lastSyncedAt)}
            </p>
            <Separator />
            <div className="flex flex-wrap gap-2">
              {!account.writeEnabled ? (
                <Button size="sm" onClick={connect} disabled={connecting}>
                  {connecting ? <Loader2 className="size-4 animate-spin" /> : null}
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
            <p className="text-sm text-muted-foreground">
              {hasCredentials
                ? "Credentials saved — connect your account to start."
                : "Save your X app credentials above first."}
            </p>
            <Button onClick={connect} disabled={connecting || !hasCredentials}>
              {connecting ? <Loader2 className="size-4 animate-spin" /> : null}
              Connect X
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ----------------------------- Step 3: the agent -------------------------- */

function AgentCard({ connected }: { connected: boolean }) {
  const [info, setInfo] = React.useState<{ apiUrl: string; apiKey: string } | null>(
    null,
  );
  const [revealed, setRevealed] = React.useState(false);

  React.useEffect(() => {
    api.getAgentInfo().then(setInfo).catch(() => setInfo(null));
  }, []);

  const envSnippet = info
    ? `QUILL_API_URL=${info.apiUrl}\nQUILL_API_KEY=${info.apiKey}`
    : "";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-[15px]">
              <span className="mr-2 text-muted-foreground">3</span>Your agent
            </CardTitle>
            <CardDescription>
              Writing happens in Claude Code or Codex — this UI is where you
              review and approve.
            </CardDescription>
          </div>
          {connected ? (
            <Badge variant="brand">Ready</Badge>
          ) : (
            <Badge variant="outline">Connect X first</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="list-decimal space-y-1.5 pl-5 text-[13px] text-muted-foreground">
          <li>
            Open the <span className="font-mono text-foreground">agent/</span>{" "}
            folder of this repo in Claude Code or Codex.
          </li>
          <li className="space-y-1">
            Create <span className="font-mono text-foreground">agent/.env</span>{" "}
            with your agent key:
            {info ? (
              <div className="mt-1 flex items-start gap-2 rounded-md border border-border bg-background/60 p-2.5">
                <pre className="min-w-0 flex-1 overflow-x-auto font-mono text-[12px] leading-relaxed text-foreground">
                  {revealed
                    ? envSnippet
                    : `QUILL_API_URL=${info.apiUrl}\nQUILL_API_KEY=••••••••••••`}
                </pre>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRevealed((r) => !r)}
                  >
                    {revealed ? "Hide" : "Reveal"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Copy agent env"
                    onClick={() => {
                      navigator.clipboard.writeText(envSnippet);
                      toast.success("Copied");
                    }}
                  >
                    <Copy className="size-3.5" />
                  </Button>
                </div>
              </div>
            ) : null}
          </li>
          <li>
            Say{" "}
            <span className="text-foreground">&ldquo;bootstrap my voice&rdquo;</span>{" "}
            — the agent studies your real posts and learns how you write
            (one-time, ~$0.001 per post read).
          </li>
          <li>
            Then:{" "}
            <span className="text-foreground">
              &ldquo;draft 3 posts about … and suggest times&rdquo;
            </span>{" "}
            — drafts land in your Queue here for approval. Nothing posts without
            you.
          </li>
        </ol>

        <Separator />

        <div className="flex items-center gap-2 rounded-md border border-border bg-background/60 p-2.5">
          <Terminal className="size-3.5 shrink-0 text-muted-foreground" />
          <code className="min-w-0 flex-1 overflow-x-auto font-mono text-[12px] text-muted-foreground">
            node quill.mjs status · sync · draft · queue · schedule
          </code>
        </div>
      </CardContent>
    </Card>
  );
}

function CopyRow({ value }: { value: string }) {
  return (
    <span className="mt-1 flex items-center gap-2 rounded-md border border-border bg-background/60 py-1 pl-2.5 pr-1">
      <code className="min-w-0 flex-1 overflow-x-auto font-mono text-[12px] text-foreground">
        {value}
      </code>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Copy"
        onClick={() => {
          navigator.clipboard.writeText(value);
          toast.success("Copied");
        }}
      >
        <Copy className="size-3.5" />
      </Button>
    </span>
  );
}
