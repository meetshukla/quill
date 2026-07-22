import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { xScopes } from "../config/env.js";
import { requireUserId } from "../lib/auth.js";
import { decryptSecret, encryptSecret } from "../lib/crypto.js";

const X_API_BASE = "https://api.x.com/2";

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

export async function registerXRoutes(app: FastifyInstance, prisma: PrismaClient) {
  // Bring your own X developer app and user token. This is a private, direct
  // API connection: Quill never starts a browser OAuth flow.
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
        scopes: xScopes,
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
        scopes: xScopes,
        writeEnabled: true
      },
      select: { username: true, writeEnabled: true }
    });
    return { account };
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
