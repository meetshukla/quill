import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { env, xScopes } from "../config/env.js";
import { requireUserId } from "../lib/auth.js";
import { decryptSecret, encryptSecret } from "../lib/crypto.js";
import { XClientService } from "../services/x-client.service.js";

const X_API_BASE = "https://api.x.com/2";
const X_TOKEN_URL = `${X_API_BASE}/oauth2/token`;

const connectionInput = z.object({
  clientId: z.string().trim().min(1).max(2_000),
  clientSecret: z.string().trim().max(5_000).optional(),
  accessToken: z.string().trim().min(1).max(20_000),
  refreshToken: z.string().trim().min(1).max(20_000)
});

const appCredentialsInput = z.object({
  clientId: z.string().trim().min(1).max(2_000),
  clientSecret: z.string().trim().max(5_000).optional()
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
type StoredAppCredentials = {
  clientIdEncrypted: string;
  clientSecretEncrypted: string | null;
  staged: boolean;
};
type ConnectionCheck = {
  id: "app" | "identity" | "read" | "write" | "media" | "refresh";
  label: string;
  status: "passed" | "failed";
  detail: string;
};

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

async function getStoredAppCredentials(prisma: PrismaClient, userId: string): Promise<StoredAppCredentials | null> {
  // Prefer a newly-saved app while the user is switching apps. After a
  // successful OAuth callback its credentials move onto XAccount and this
  // staging row is deleted.
  const staged = await prisma.xAppCredential.findUnique({
    where: { userId },
    select: { clientIdEncrypted: true, clientSecretEncrypted: true }
  });
  if (staged) return { ...staged, staged: true };

  const account = await prisma.xAccount.findUnique({
    where: { userId },
    select: { xClientIdEncrypted: true, xClientSecretEncrypted: true }
  });
  if (!account?.xClientIdEncrypted) return null;
  return {
    clientIdEncrypted: account.xClientIdEncrypted,
    clientSecretEncrypted: account.xClientSecretEncrypted,
    staged: false
  };
}

function checkScope(scopes: string[], scope: string, id: ConnectionCheck["id"], label: string, detail: string): ConnectionCheck {
  const granted = scopes.includes(scope);
  return {
    id,
    label,
    status: granted ? "passed" : "failed",
    detail: granted ? detail : `Missing ${scope}. Re-authorize X and approve that permission.`
  };
}

function connectionReadError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const status = message.match(/failed: (\d{3})/)?.[1];
  if (status === "401") return "X rejected this token and Quill could not refresh it.";
  if (status === "403") return "X accepted the token but denied this app's API access.";
  if (status === "429") return "X rate-limited this test. Try again after the reset time in X.";
  return "Quill could not read your X identity. Re-authorize X, then test again.";
}

export async function registerXRoutes(app: FastifyInstance, prisma: PrismaClient) {
  // Each Quill user brings their own X developer app. Quill only stores these
  // credentials encrypted and uses them for that user's OAuth/token refresh.
  app.get("/api/x/app-credentials", async (request) => {
    const configured = Boolean(await getStoredAppCredentials(prisma, requireUserId(request)));
    return { configured, callbackUrl: callbackUrl() };
  });

  app.put("/api/x/app-credentials", async (request) => {
    const userId = requireUserId(request);
    const body = appCredentialsInput.parse(request.body);
    await prisma.xAppCredential.upsert({
      where: { userId },
      create: {
        userId,
        clientIdEncrypted: encryptSecret(body.clientId),
        clientSecretEncrypted: body.clientSecret ? encryptSecret(body.clientSecret) : null
      },
      update: {
        clientIdEncrypted: encryptSecret(body.clientId),
        clientSecretEncrypted: body.clientSecret ? encryptSecret(body.clientSecret) : null
      }
    });
    return { configured: true, callbackUrl: callbackUrl() };
  });

  // Legacy migration endpoint for a user who already has user tokens. The
  // normal product flow is app credentials -> OAuth, so tokens are never
  // manually copied from the X console.
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
        xClientSecretEncrypted: body.clientSecret ? encryptSecret(body.clientSecret) : null,
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
        xClientSecretEncrypted: body.clientSecret ? encryptSecret(body.clientSecret) : null,
        scopes: [],
        writeEnabled: true
      },
      select: { username: true, writeEnabled: true }
    });
    return { account };
  });

  // This works for both a first connection and a re-authorization. The user
  // never pastes X access or refresh tokens into Quill.
  app.post("/api/x/connection/authorize", async (request, reply) => {
    const userId = requireUserId(request);
    const credentials = await getStoredAppCredentials(prisma, userId);
    if (!credentials) {
      return reply.code(400).send({ error: "x_app_credentials_missing" });
    }

    let clientId: string;
    try {
      clientId = decryptSecret(credentials.clientIdEncrypted);
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

  // Safe preflight for a connected account. It never creates a post, draft,
  // schedule item, or uploads a file. /users/me exercises the current token
  // (and XClientService's safe 401 refresh retry); a zero-byte documented X
  // media initialization proves the media endpoint accepts that token.
  app.post("/api/x/connection/test", async (request, reply) => {
    const account = await prisma.xAccount.findUnique({ where: { userId: requireUserId(request) } });
    if (!account) return reply.code(404).send({ error: "x_account_missing" });

    const scopes = Array.isArray(account.scopes)
      ? account.scopes.filter((scope): scope is string => typeof scope === "string")
      : [];
    const mediaCheck = checkScope(scopes, "media.write", "media", "Media upload access", "X granted Quill media permission; endpoint check pending.");
    const checks: ConnectionCheck[] = [
      {
        id: "app",
        label: "Your X app",
        status: account.xClientIdEncrypted ? "passed" : "failed",
        detail: account.xClientIdEncrypted
          ? "A private developer app is attached to this Quill account."
          : "No X developer app is attached. Save your app credentials first."
      },
      checkScope(scopes, "tweet.read", "read", "Read access", "X granted Quill post-reading access."),
      checkScope(scopes, "tweet.write", "write", "Post and schedule access", "X granted Quill permission to post only after your approval."),
      mediaCheck,
      {
        id: "refresh",
        label: "Long-lived connection",
        status: scopes.includes("offline.access") && Boolean(account.refreshTokenEncrypted) ? "passed" : "failed",
        detail: scopes.includes("offline.access") && account.refreshTokenEncrypted
          ? "A refresh token is present, so Quill can renew the connection without asking you to reconnect."
          : "Missing offline.access or its refresh token. Re-authorize X to keep scheduled posts reliable."
      }
    ];

    try {
      const identity = await new XClientService(prisma).getMe(account);
      checks.splice(1, 0, {
        id: "identity",
        label: "Live X identity",
        status: "passed",
        detail: `Authenticated successfully as @${identity.username}.`
      });
    } catch (error) {
      checks.splice(1, 0, {
        id: "identity",
        label: "Live X identity",
        status: "failed",
        detail: connectionReadError(error)
      });
    }

    if (mediaCheck.status === "passed") {
      try {
        // Re-read because getMe may have refreshed and rotated the token.
        const activeAccount = await prisma.xAccount.findUniqueOrThrow({ where: { id: account.id } });
        await new XClientService(prisma).verifyMediaAccess(activeAccount);
        mediaCheck.detail = "X accepted a zero-byte media initialization. No file was sent and nothing was posted.";
      } catch (error) {
        mediaCheck.status = "failed";
        mediaCheck.detail = connectionReadError(error);
      }
    }

    return {
      ok: checks.every((check) => check.status === "passed"),
      testedAt: new Date().toISOString(),
      checks
    };
  });

  // This receives a short-lived X authorization code, exchanges it server-side,
  // and redirects back to Quill without ever placing either token in the URL.
  app.get("/api/x/callback", async (request, reply) => {
    const query = z.object({ code: z.string().min(1).optional(), state: z.string().min(1).optional() }).safeParse(request.query);
    if (!query.success || !query.data.code || !query.data.state) {
      request.log.warn("X OAuth callback missing code or state");
      return reply.redirect(appSettingsUrl("error"));
    }
    const state = decodeState(query.data.state);
    if (!state) {
      request.log.warn("X OAuth callback state rejected");
      return reply.redirect(appSettingsUrl("error"));
    }

    const credentials = await getStoredAppCredentials(prisma, state.userId);
    if (!credentials) {
      request.log.warn("X OAuth callback has no saved client ID");
      return reply.redirect(appSettingsUrl("error"));
    }

    let clientId: string;
    let clientSecret = "";
    try {
      clientId = decryptSecret(credentials.clientIdEncrypted);
      clientSecret = credentials.clientSecretEncrypted ? decryptSecret(credentials.clientSecretEncrypted) : "";
    } catch {
      return reply.redirect(appSettingsUrl("error"));
    }

    let token: XTokenResponse;
    try {
      const body = () => new URLSearchParams({
        code: query.data.code!,
        grant_type: "authorization_code",
        client_id: clientId,
        redirect_uri: callbackUrl(),
        code_verifier: state.codeVerifier
      });
      let response = await fetch(X_TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: body()
      });
      // Some legacy Console apps retain a client secret even when displayed as
      // Native. X expects Basic authentication for those registrations.
      if (!response.ok && clientSecret) {
        response = await fetch(X_TOKEN_URL, {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`
          },
          body: body()
        });
      }
      if (!response.ok) {
        request.log.warn({ status: response.status }, "X OAuth code exchange failed");
        return reply.redirect(appSettingsUrl("error"));
      }
      token = await response.json() as XTokenResponse;
      if (!token.access_token || !token.refresh_token) {
        request.log.warn("X OAuth response omitted a required token");
        return reply.redirect(appSettingsUrl("error"));
      }
    } catch {
      request.log.warn("X OAuth code exchange request failed");
      return reply.redirect(appSettingsUrl("error"));
    }

    let identity: XIdentity;
    try {
      const response = await fetch(`${X_API_BASE}/users/me?user.fields=profile_image_url`, {
        headers: { authorization: `Bearer ${token.access_token}` }
      });
      const payload = await response.json() as { data?: XIdentity };
      if (!response.ok || !payload.data?.id || !payload.data.username) {
        request.log.warn({ status: response.status }, "X OAuth identity validation failed");
        return reply.redirect(appSettingsUrl("error"));
      }
      identity = payload.data;
    } catch {
      request.log.warn("X OAuth identity validation request failed");
      return reply.redirect(appSettingsUrl("error"));
    }

    const scopes = token.scope?.split(/\s+/).filter(Boolean) ?? [];
    await prisma.xAccount.upsert({
      where: { userId: state.userId },
      create: {
        userId: state.userId,
        xUserId: identity.id,
        username: identity.username,
        displayName: identity.name ?? null,
        avatarUrl: identity.profile_image_url ?? null,
        accessTokenEncrypted: encryptSecret(token.access_token),
        refreshTokenEncrypted: encryptSecret(token.refresh_token),
        xClientIdEncrypted: credentials.clientIdEncrypted,
        xClientSecretEncrypted: credentials.clientSecretEncrypted,
        scopes,
        writeEnabled: scopes.includes("tweet.write")
      },
      update: {
        xUserId: identity.id,
        username: identity.username,
        displayName: identity.name ?? null,
        avatarUrl: identity.profile_image_url ?? null,
        accessTokenEncrypted: encryptSecret(token.access_token),
        refreshTokenEncrypted: encryptSecret(token.refresh_token),
        xClientIdEncrypted: credentials.clientIdEncrypted,
        xClientSecretEncrypted: credentials.clientSecretEncrypted,
        scopes,
        writeEnabled: scopes.includes("tweet.write")
      }
    });
    if (credentials.staged) {
      await prisma.xAppCredential.delete({ where: { userId: state.userId } });
    }
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
