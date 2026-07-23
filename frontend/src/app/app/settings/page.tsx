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
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { LoadingRow, OfflineState } from "@/components/states";
import { api, clearAuthToken } from "@/lib/api";
import { useAccount } from "@/lib/account-context";
import { useAsync } from "@/lib/use-async";
import { formatRelative } from "@/lib/format";

export default function SettingsPage() {
  const { account, loading, online, refresh } = useAccount();

  return (
    <div>
      <PageHeader
        icon={SettingsIcon}
        title="Settings"
        description="Your private X API connection and personal Quill MCP."
        actions={
          <Button variant="ghost" size="sm" onClick={() => {
            clearAuthToken();
            window.location.href = "/login";
          }}>
            <LogOut className="size-4" /> Log out
          </Button>
        }
      />
      <div className="mx-auto max-w-3xl space-y-5 px-5 py-6 sm:px-7">
        {online === false ? <OfflineState onRetry={refresh} /> : <>
          <XAccountCard account={account} loading={loading} refresh={refresh} />
          <McpCard connected={Boolean(account)} />
          <BrowserCompanionCard />
        </>}
      </div>
    </div>
  );
}

function XAccountCard({
  account,
  loading,
  refresh,
}: {
  account: ReturnType<typeof useAccount>["account"];
  loading: boolean;
  refresh: () => Promise<void>;
}) {
  const [clientId, setClientId] = React.useState("");
  const [clientSecret, setClientSecret] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [editingApp, setEditingApp] = React.useState(false);
  const [authorizing, setAuthorizing] = React.useState(false);
  const appCredentials = useAsync(() => api.getXAppCredentials(), []);

  React.useEffect(() => {
    const status = new URLSearchParams(window.location.search).get("x_auth");
    if (!status) return;
    window.history.replaceState({}, "", "/app/settings");
    if (status === "connected") {
      void refresh();
      void appCredentials.reload();
      toast.success("X connected. Quill can now use your own X API credits.");
    } else {
      toast.error("X authorization did not complete. Your existing connection is unchanged.");
    }
  }, [refresh]);

  async function authorizeX() {
    setAuthorizing(true);
    try {
      const { authorizeUrl } = await api.startXAuthorization();
      window.location.assign(authorizeUrl);
    } catch (err) {
      setAuthorizing(false);
      toast.error(err instanceof Error ? err.message : "Could not start X authorization");
    }
  }

  async function saveAppAndConnect() {
    if (!clientId.trim()) {
      toast.error("Paste the Client ID from your own X developer app.");
      return;
    }
    setSaving(true);
    try {
      await api.saveXAppCredentials({
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim() || undefined,
      });
      setClientId("");
      setClientSecret("");
      setEditingApp(false);
      await appCredentials.reload();
      await authorizeX();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save your X app");
    } finally {
      setSaving(false);
    }
  }

  function copyCallbackUrl() {
    const url = appCredentials.data?.callbackUrl;
    if (!url) return;
    void navigator.clipboard.writeText(url);
    toast.success("Callback URL copied");
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-[15px]">
              <span className="mr-2 text-muted-foreground">1</span>Your X API connection
            </CardTitle>
            <CardDescription>
              Use your own X developer app and credit balance. Quill handles the OAuth tokens for you.
            </CardDescription>
          </div>
          {account ? <Badge variant="success"><Check /> Connected</Badge> : appCredentials.data?.configured ? <Badge variant="brand">App ready</Badge> : <Badge variant="outline">Not configured</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? <LoadingRow /> : account ? (
          <div className="flex items-center gap-3">
            <Avatar className="size-12">
              {account.avatarUrl ? <AvatarImage src={account.avatarUrl} alt={account.username} /> : null}
              <AvatarFallback>{(account.displayName || account.username).slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{account.displayName || account.username}</p>
              <p className="truncate text-sm text-muted-foreground">@{account.username}</p>
              <p className="mt-1 text-xs text-muted-foreground">Last synced {formatRelative(account.lastSyncedAt)}</p>
            </div>
            {account.writeEnabled ? <Badge variant="success"><ShieldCheck /> Write enabled</Badge> : <Badge variant="warning">Read-only</Badge>}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Add your own X developer app, then Quill securely connects your X account in one browser approval.
          </p>
        )}

        {account && !editingApp ? (
          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-sm text-muted-foreground">This account uses your own X developer app and X credit balance. Quill encrypts the app credentials and refreshes the OAuth connection privately.</p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" size="sm" onClick={authorizeX} disabled={authorizing}>
                {authorizing ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                Re-authorize X
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEditingApp(true)} disabled={authorizing}>
                <KeyRound className="size-4" /> Change X app
              </Button>
            </div>
          </div>
        ) : !account && appCredentials.data?.configured && !editingApp ? (
          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-sm text-muted-foreground">Your X app is saved securely. Continue to X once to approve Quill&apos;s requested read, write, media, and refresh access.</p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditingApp(true)} disabled={authorizing}>
                <KeyRound className="size-4" /> Change X app
              </Button>
              <Button size="sm" onClick={authorizeX} disabled={authorizing}>
                {authorizing ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                Connect X
              </Button>
            </div>
          </div>
        ) : <>
          {account ? <Separator /> : null}
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>In your own X Developer Console, create an app with OAuth 2.0 enabled and register this exact callback URL.</p>
            <div className="flex items-center gap-2 rounded-md border border-border bg-background/60 px-3 py-2 font-mono text-xs text-foreground">
              <span className="min-w-0 flex-1 truncate">{appCredentials.data?.callbackUrl || "Loading callback URL…"}</span>
              <Button variant="ghost" size="icon-sm" aria-label="Copy callback URL" onClick={copyCallbackUrl} disabled={!appCredentials.data?.callbackUrl}>
                <Copy className="size-3.5" />
              </Button>
            </div>
            <p>Enable <span className="text-foreground">Read + Write</span> and request <span className="text-foreground">offline.access</span>. After saving your app, X opens once for consent; Quill receives and refreshes the tokens itself.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="x-client-id">Your X Client ID</Label>
              <Input id="x-client-id" value={clientId} onChange={(event) => setClientId(event.target.value)} placeholder="Paste Client ID" autoComplete="off" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="x-client-secret">X Client Secret <span className="text-muted-foreground">(optional for Native apps)</span></Label>
              <Input id="x-client-secret" type="password" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} placeholder="Paste Client Secret" autoComplete="new-password" />
            </div>
          </div>
          <a className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground" href="https://developer.x.com/en/portal/dashboard" target="_blank" rel="noreferrer">Open X Developer Console <ExternalLink className="size-3" /></a>
          <div className="flex justify-end gap-2">
            {account ? <Button variant="ghost" size="sm" onClick={() => setEditingApp(false)} disabled={saving}>Cancel</Button> : null}
            <Button size="sm" onClick={saveAppAndConnect} disabled={saving || appCredentials.loading}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
              {account ? "Save app & re-authorize" : appCredentials.data?.configured ? "Connect X" : "Save app & connect X"}
            </Button>
          </div>
        </>}
      </CardContent>
    </Card>
  );
}

function McpCard({ connected }: { connected: boolean }) {
  const [info, setInfo] = React.useState<{ apiUrl: string; apiKey: string } | null>(null);
  const [revealed, setRevealed] = React.useState(false);

  React.useEffect(() => {
    api.getAgentInfo().then(setInfo).catch(() => setInfo(null));
  }, []);

  const configSnippet = info ? JSON.stringify({
    mcpServers: { quill: { url: `${info.apiUrl.replace(/\/$/, "")}/mcp`, headers: { Authorization: `Bearer ${info.apiKey}` } } },
  }, null, 2) : "";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-[15px]"><span className="mr-2 text-muted-foreground">2</span>Quill MCP</CardTitle>
            <CardDescription>Connect Codex or Claude directly to your private Quill tools.</CardDescription>
          </div>
          {connected ? <Badge variant="brand">Ready</Badge> : <Badge variant="outline">X connection required</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="list-decimal space-y-1.5 pl-5 text-[13px] text-muted-foreground">
          <li className="space-y-1">Add this connection to Codex or Claude:
            {info ? <div className="mt-1 flex items-start gap-2 rounded-md border border-border bg-background/60 p-2.5">
              <pre className="min-w-0 flex-1 overflow-x-auto font-mono text-[12px] leading-relaxed text-foreground">{revealed ? configSnippet : `{"mcpServers":{"quill":{"url":"${info.apiUrl.replace(/\/$/, "")}/mcp","headers":{"Authorization":"Bearer ••••••••••••"}}}}`}</pre>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="sm" onClick={() => setRevealed((value) => !value)}>{revealed ? "Hide" : "Reveal"}</Button>
                <Button variant="ghost" size="icon-sm" aria-label="Copy MCP configuration" onClick={() => { navigator.clipboard.writeText(configSnippet); toast.success("Copied"); }}><Copy className="size-3.5" /></Button>
              </div>
            </div> : null}
          </li>
          <li>Your private writing and reply profiles live in Quill and are scoped to your account. Your co-founder&apos;s MCP key resolves only their profiles and X connection.</li>
          <li>Then ask: <span className="text-foreground">&ldquo;read my profile, draft 3 posts about …, and suggest times&rdquo;</span> — drafts land in your Queue for approval. Nothing posts without you.</li>
        </ol>
        <Separator />
        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/60 p-2.5">
          <p className="text-xs text-muted-foreground">The MCP includes research, media, native X Articles, scheduling, CTA, and evergreen repost tools.</p>
          <a href="/docs" className="inline-flex shrink-0 items-center gap-1 text-xs text-foreground underline underline-offset-2">View docs <ExternalLink className="size-3" /></a>
        </div>
      </CardContent>
    </Card>
  );
}

function BrowserCompanionCard() {
  const installations = useAsync(() => api.listExtensionInstallations(), []);
  const [token, setToken] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);

  async function create() {
    setCreating(true);
    try {
      const result = await api.createExtensionInstallation();
      setToken(result.token);
      await installations.reload();
      toast.success("Browser companion token created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create a token");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    try {
      await api.revokeExtensionInstallation(id);
      await installations.reload();
      toast.success("Browser companion disconnected");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not revoke the token");
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-[15px]"><span className="mr-2 text-muted-foreground">3</span>Quill for X</CardTitle>
            <CardDescription>Capture useful X context for your private research inbox and let the agent prepare contextual replies. The extension cannot publish.</CardDescription>
          </div>
          <Badge variant="brand">Optional</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Load the repo&apos;s <span className="font-mono text-foreground">extension/</span> folder in Chrome, then paste a browser-companion token there. Each token is scoped to research only and can be revoked here.</p>
        {token ? <div className="space-y-2 rounded-md border border-border bg-background/60 p-3"><p className="text-xs text-muted-foreground">Copy this once into the extension. It will not be shown again.</p><CopyRow value={token} /></div> : null}
        <div className="flex flex-wrap gap-2"><Button size="sm" onClick={create} disabled={creating}>{creating ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}Create browser token</Button></div>
        {installations.data?.installations.length ? <div className="space-y-2">{installations.data.installations.filter((item) => !item.revokedAt).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"><span>{item.label} <span className="text-xs text-muted-foreground">· {item.lastUsedAt ? `used ${formatRelative(item.lastUsedAt)}` : "not used yet"}</span></span><Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => revoke(item.id)}>Revoke</Button></div>)}</div> : null}
      </CardContent>
    </Card>
  );
}

function CopyRow({ value }: { value: string }) {
  return (
    <span className="mt-1 flex items-center gap-2 rounded-md border border-border bg-background/60 py-1 pl-2.5 pr-1">
      <code className="min-w-0 flex-1 overflow-x-auto font-mono text-[12px] text-foreground">{value}</code>
      <Button variant="ghost" size="icon-sm" aria-label="Copy" onClick={() => { navigator.clipboard.writeText(value); toast.success("Copied"); }}><Copy className="size-3.5" /></Button>
    </span>
  );
}
