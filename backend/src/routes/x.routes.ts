import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { env, xScopes } from "../config/env.js";
import { requireUserId } from "../lib/auth.js";
import { decryptSecret, encryptSecret } from "../lib/crypto.js";

const X_API_BASE = "https://api.x.com/2";
const X_TOKEN_URL = `${X_API_BASE}/oauth2/token`;

const connectionInput = z.object({
  clientId: z.string().trim().min(1).max(2_000),
  clientSecret: z.string().trim().min(1).max(5_000),
  accessToken: z.string().trim().min(1).max(20_000),
  refreshToken: z.string().trim().min(1).max(20_000)
});

const restoredConnectionInput = z.object({
  xUserId: z.string().trim().min(1).max(64),
  username: z.string().trim().min(1).max(100),
  displayName: z.string().trim().max(200).nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  accessTokenEncrypted: z.string().min(24).max(20_000),
  refreshTokenEncrypted: z.string().min(24).max(20_000).nullable().optional(),
  scopes: z.array(z.string().trim().min(1).max(100)).min(1).max(32)
});

type XIdentity = { id: string; username: string; name?: string; profile_image_url?: string };
type XTokenResponse = { access_token?: string; refresh_token?: string; scope?: string };
type OAuthState = { userId: string; codeVerifier: string; expiresAt: number };

function callbackUrl() {
  return env.X_CALLBACK_URL || `${env.API_BASE_URL}/api/x/callback`;
}

function appSettingsUrl(status: "connected" | "error") {
  const url = new URL("/app/settings", env.APP_BASE_URL);
  url.searchParams.set("x_auth", status);
  return url.toString();
}

function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

function encodeState(state: OAuthState) {
  return Buffer.from(encryptSecret(JSON.stringify(state)), "utf8").toString("base64url");
}

function decodeState(raw: string): OAuthState | null {
  try {
    const state = JSON.parse(decryptSecret(Buffer.from(raw, "base64url").toString("utf8"))) as OAuthState;
    if (!state.userId || !state.codeVerifier || state.expiresAt < Date.now()) return null;
    return state;
  } catch {
    return null;
  }
}

export async function registerXRoutes(app: FastifyInstance, prisma: PrismaClient) {
  // Bring your own X developer app and user token. Quill never shares an app,
  // quota, or billing account between people.
  app.post("/api/x/connection", async (request, reply) => {
    const body = connectionInput.parse(request.body);
    let identity: XIdentity;
    try {
      const response = await fetch(`${X_API_BASE}/users/me?user.fields=profile_image_url`, {
        headers: { authorization: `Bearer ${body.accessToken}` }
      });
      if (!response.ok) return reply.code(400).send({ error: "x_token_validation_failed" });
      const payload = await response.json() as { data?: XIdentity };
      if (!payload.data?.id || !payload.data.username) {
        return reply.code(400).send({ error: "x_token_identity_missing" });
      }
      identity = payload.data;
    } catch {
      return reply.code(400).send({ error: "x_token_validation_failed" });
    }

    const userId = requireUserId(request);
    const account = await prisma.xAccount.upsert({
      where: { userId },
      create: {
        userId,
        xUserId: identity.id,
        username: identity.username,
        displayName: identity.name ?? null,
        avatarUrl: identity.profile_image_url ?? null,
        accessTokenEncrypted: encryptSecret(body.accessToken),
        refreshTokenEncrypted: encryptSecret(body.refreshToken),
        xClientIdEncrypted: encryptSecret(body.clientId),
        xClientSecretEncrypted: encryptSecret(body.clientSecret),
        // A pasted token proves identity, not its granted scopes. The OAuth
        // re-authorization flow below records scopes returned by X instead.
        scopes: [],
        writeEnabled: true
      },
      update: {
        xUserId: identity.id,
        username: identity.username,
        displayName: identity.name ?? null,
        avatarUrl: identity.profile_image_url ?? null,
        accessTokenEncrypted: encryptSecret(body.accessToken),
        refreshTokenEncrypted: encryptSecret(body.refreshToken),
        xClientIdEncrypted: encryptSecret(body.clientId),
        xClientSecretEncrypted: encryptSecret(body.clientSecret),
        scopes: [],
        writeEnabled: true
      },
      select: { username: true, writeEnabled: true }
    });
    return { account };
  });

  // Re-authorize the already-connected user's own X developer app. This is
  // specifically useful when a token was generated without media.write.
  app.post("/api/x/connection/authorize", async (request, reply) => {
    const userId = requireUserId(request);
    const account = await prisma.xAccount.findUnique({
      where: { userId },
      select: { xClientIdEncrypted: true }
    });
    if (!account?.xClientIdEncrypted) {
      return reply.code(400).send({ error: "x_app_credentials_missing" });
    }

    let clientId: string;
    try {
      clientId = decryptSecret(account.xClientIdEncrypted);
    } catch {
      return reply.code(400).send({ error: "x_app_credentials_invalid" });
    }

    const codeVerifier = randomBytes(48).toString("base64url");
    const state = encodeState({ userId, codeVerifier, expiresAt: Date.now() + 10 * 60_000 });
    const authorizeUrl = new URL("https://x.com/i/oauth2/authorize");
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", callbackUrl());
    authorizeUrl.searchParams.set("scope", xScopes.join(" "));
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("code_challenge", pkceChallenge(codeVerifier));
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    return { authorizeUrl: authorizeUrl.toString() };
  });

  // This receives a short-lived X authorization code, exchanges it server-side,
  // and redirects back to Quill without ever placing either token in the URL.
  app.get("/api/x/callback", async (request, reply) => {
    const query = z.object({ code: z.string().min(1).optional(), state: z.string().min(1).optional() }).safeParse(request.query);
    if (!query.success || !query.data.code || !query.data.state) return reply.redirect(appSettingsUrl("error"));
    const state = decodeState(query.data.state);
    if (!state) return reply.redirect(appSettingsUrl("error"));

    const account = await prisma.xAccount.findUnique({
      where: { userId: state.userId },
      select: { xClientIdEncrypted: true }
    });
    if (!account?.xClientIdEncrypted) return reply.redirect(appSettingsUrl("error"));

    let clientId: string;
    try {
      clientId = decryptSecret(account.xClientIdEncrypted);
    } catch {
      return reply.redirect(appSettingsUrl("error"));
    }

    let token: XTokenResponse;
    try {
      const response = await fetch(X_TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: query.data.code,
          grant_type: "authorization_code",
          client_id: clientId,
          redirect_uri: callbackUrl(),
          code_verifier: state.codeVerifier
        })
      });
      if (!response.ok) return reply.redirect(appSettingsUrl("error"));
      token = await response.json() as XTokenResponse;
      if (!token.access_token || !token.refresh_token) return reply.redirect(appSettingsUrl("error"));
    } catch {
      return reply.redirect(appSettingsUrl("error"));
    }

    let identity: XIdentity;
    try {
      const response = await fetch(`${X_API_BASE}/users/me?user.fields=profile_image_url`, {
        headers: { authorization: `Bearer ${token.access_token}` }
      });
      const payload = await response.json() as { data?: XIdentity };
      if (!response.ok || !payload.data?.id || !payload.data.username) return reply.redirect(appSettingsUrl("error"));
      identity = payload.data;
    } catch {
      return reply.redirect(appSettingsUrl("error"));
    }

    const scopes = token.scope?.split(/\s+/).filter(Boolean) ?? [];
    await prisma.xAccount.update({
      where: { userId: state.userId },
      data: {
        xUserId: identity.id,
        username: identity.username,
        displayName: identity.name ?? null,
        avatarUrl: identity.profile_image_url ?? null,
        accessTokenEncrypted: encryptSecret(token.access_token),
        refreshTokenEncrypted: encryptSecret(token.refresh_token),
        scopes,
        writeEnabled: scopes.includes("tweet.write")
      }
    });
    return reply.redirect(appSettingsUrl("connected"));
  });

  // Restore an existing encrypted connection after moving a private Quill
  // database. It accepts ciphertext only and verifies the install key first.
  app.post("/api/x/connection/restore", async (request, reply) => {
    const body = restoredConnectionInput.parse(request.body);
    try {
      if (!decryptSecret(body.accessTokenEncrypted)) throw new Error("empty_token");
      if (body.refreshTokenEncrypted && !decryptSecret(body.refreshTokenEncrypted)) {
        throw new Error("empty_refresh_token");
      }
    } catch {
      return reply.code(400).send({ error: "invalid_encrypted_x_connection" });
    }

    const userId = requireUserId(request);
    const account = await prisma.xAccount.upsert({
      where: { userId },
      create: {
        userId,
        xUserId: body.xUserId,
        username: body.username,
        displayName: body.displayName ?? null,
        avatarUrl: body.avatarUrl ?? null,
        accessTokenEncrypted: body.accessTokenEncrypted,
        refreshTokenEncrypted: body.refreshTokenEncrypted ?? null,
        scopes: body.scopes,
        writeEnabled: body.scopes.includes("tweet.write")
      },
      update: {
        xUserId: body.xUserId,
        username: body.username,
        displayName: body.displayName ?? null,
        avatarUrl: body.avatarUrl ?? null,
        accessTokenEncrypted: body.accessTokenEncrypted,
        refreshTokenEncrypted: body.refreshTokenEncrypted ?? null,
        scopes: body.scopes,
        writeEnabled: body.scopes.includes("tweet.write")
      },
      select: { username: true, writeEnabled: true }
    });
    return { account };
  });

  app.get("/api/x/account", async (request) => {
    const account = await prisma.xAccount.findUnique({
      where: { userId: requireUserId(request) },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        scopes: true,
        writeEnabled: true,
        lastSyncedAt: true,
        analyticsLastSyncedAt: true
      }
    });
    return { account };
  });
}
