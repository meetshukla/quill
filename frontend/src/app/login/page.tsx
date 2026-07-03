"use client";

import * as React from "react";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, setAuthToken } from "@/lib/api";
import { BrandMark } from "@/components/app-shell/brand-mark";

export default function LoginPage() {
  const [needsOwner, setNeedsOwner] = React.useState<boolean | null>(null);
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    api
      .getSetupStatus()
      .then((s) => setNeedsOwner(s.needsOwner))
      .catch(() => setNeedsOwner(false));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (needsOwner) {
      if (password.length < 8) {
        toast.error("Use at least 8 characters.");
        return;
      }
      if (password !== confirm) {
        toast.error("Passwords don't match.");
        return;
      }
    }
    setBusy(true);
    try {
      const { token } = needsOwner
        ? await api.claimOwner(password)
        : await api.login(password);
      setAuthToken(token);
      window.location.href = "/app/queue";
    } catch (err) {
      toast.error(
        err instanceof Error && err.message === "invalid_password"
          ? "Wrong password."
          : err instanceof Error
            ? err.message
            : "Something went wrong",
      );
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <BrandMark className="size-10" />
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Quill</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {needsOwner === null
                ? "Checking instance…"
                : needsOwner
                  ? "Set a password to claim this instance. You're the only user."
                  : "Enter your password to continue."}
            </p>
          </div>
        </div>

        {needsOwner !== null && (
          <form
            onSubmit={submit}
            className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-sm ring-hairline"
          >
            <div className="space-y-2">
              <Label htmlFor="password">
                {needsOwner ? "Choose a password" : "Password"}
              </Label>
              <Input
                id="password"
                type="password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={needsOwner ? "At least 8 characters" : "••••••••"}
              />
            </div>
            {needsOwner ? (
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm password</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repeat it"
                />
              </div>
            ) : null}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : needsOwner ? (
                <ShieldCheck className="size-4" />
              ) : (
                <KeyRound className="size-4" />
              )}
              {needsOwner ? "Claim this instance" : "Log in"}
            </Button>
          </form>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Self-hosted · your account, your keys, your data.
        </p>
      </div>
    </div>
  );
}
