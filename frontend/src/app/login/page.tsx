"use client";

import * as React from "react";
import { KeyRound, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, setAuthToken } from "@/lib/api";
import { BrandMark } from "@/components/app-shell/brand-mark";

export default function LoginPage() {
  const [mode, setMode] = React.useState<"login" | "signup">("login");
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "signup") {
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
      const { token } = mode === "signup"
        ? await api.signup(email, password, name || undefined)
        : await api.login(email, password);
      setAuthToken(token);
      window.location.href = "/app/queue";
    } catch (err) {
      toast.error(
        err instanceof Error && err.message === "invalid_password"
          ? "Email or password is incorrect."
          : err instanceof Error && err.message === "email_already_registered"
            ? "An account already exists for that email."
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
              {mode === "signup"
                ? "Create your private Quill account."
                : "Sign in to your private Quill account."}
            </p>
          </div>
        </div>

        <form
            onSubmit={submit}
            className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-sm ring-hairline"
          >
            {mode === "signup" ? (
              <div className="space-y-2">
                <Label htmlFor="name">Name <span className="text-muted-foreground">(optional)</span></Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">
                {mode === "signup" ? "Choose a password" : "Password"}
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "signup" ? "At least 8 characters" : "••••••••"}
              />
            </div>
            {mode === "signup" ? (
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
              ) : mode === "signup" ? (
                <UserPlus className="size-4" />
              ) : (
                <KeyRound className="size-4" />
              )}
              {mode === "signup" ? "Create account" : "Log in"}
            </Button>
            <Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={() => setMode((current) => current === "login" ? "signup" : "login")}>
              {mode === "login" ? "Create an account" : "I already have an account"}
            </Button>
          </form>

        <p className="text-center text-xs text-muted-foreground">
          Your account · your X connection · your data.
        </p>
      </div>
    </div>
  );
}
