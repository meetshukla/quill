import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { env } from "../config/env.js";
import { XOAuthService } from "../services/x-oauth.service.js";
import { requireUserId } from "../lib/auth.js";

export async function registerXRoutes(app: FastifyInstance, prisma: PrismaClient) {
  const oauth = new XOAuthService(prisma);

  app.post("/api/x/connect/start", async (request) => {
    const body = z.object({ redirectAfter: z.string().optional() }).parse(request.body ?? {});
    const userId = requireUserId(request);
    const { state, codeVerifier } = oauth.createStateAndVerifier();
    await prisma.oAuthState.create({
      data: {
        userId,
        state,
        codeVerifier,
        redirectAfter: body.redirectAfter,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000)
      }
    });
    return { url: await oauth.createAuthorizationUrl(state, codeVerifier) };
  });

  app.get("/api/x/callback", async (request, reply) => {
    const query = z.object({
      code: z.string().min(1),
      state: z.string().min(1)
    }).parse(request.query);

    const oauthState = await prisma.oAuthState.findUnique({
      where: { state: query.state }
    });
    if (!oauthState || oauthState.consumedAt || oauthState.expiresAt < new Date()) {
      return reply.status(400).send({ error: "invalid_or_expired_oauth_state" });
    }

    const token = await oauth.exchangeCode(query.code, oauthState.codeVerifier);
    const xUser = await oauth.fetchMe(token.access_token);
    const account = await oauth.upsertConnectedAccount(oauthState.userId, token, xUser);
    await prisma.oAuthState.update({
      where: { id: oauthState.id },
      data: { consumedAt: new Date() }
    });

    if (oauthState.redirectAfter) {
      return reply.redirect(oauthState.redirectAfter);
    }

    return reply.redirect(`${env.APP_BASE_URL}/settings?x_connected=${account.username}`);
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

  app.post("/api/x/disconnect", async (request) => {
    const account = await prisma.xAccount.findUnique({ where: { userId: requireUserId(request) } });
    if (!account) return { ok: true };
    await prisma.xAccount.delete({ where: { id: account.id } });
    return { ok: true };
  });
}
