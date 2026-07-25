import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { env } from "../config/env.js";
import { requireUserId } from "../lib/auth.js";
import { PersonalAccountService } from "../services/personal-account.service.js";
import { randomBytes } from "node:crypto";
import { hashAgentKey } from "../lib/auth.js";
import { listManagedAccounts, requireManagedAccount, grantPrivateMembersAccess } from "../services/managed-account.service.js";
import { requestedAccountId } from "../lib/managed-account.js";

// Personal account signup/login. Each signed-in person connects their own X
// developer app and receives an agent key scoped only to that account.
export async function registerSetupRoutes(app: FastifyInstance, prisma: PrismaClient) {
  const accounts = new PersonalAccountService(prisma);

  app.post("/api/auth/signup", async (request, reply) => {
    const body = z.object({
      email: z.string().email().transform((email) => email.trim().toLowerCase()),
      name: z.string().trim().min(1).max(100).optional(),
      password: z.string().min(8)
    }).parse(request.body);
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) return reply.code(409).send({ error: "email_already_registered" });
    if (await prisma.user.count() >= 2) return reply.code(403).send({ error: "private_members_only" });
    const user = await prisma.user.create({
      data: { email: body.email, name: body.name, passwordHash: hashPassword(body.password) }
    });
    const existingAccounts = await prisma.xAccount.findMany({ select: { id: true } });
    await Promise.all(existingAccounts.map((account) => grantPrivateMembersAccess(prisma, account.id)));
    return { token: app.jwt.sign({ sub: user.id }, { expiresIn: "30d" }) };
  });

  app.post("/api/auth/login", async (request, reply) => {
    const body = z.object({
      email: z.string().email().transform((email) => email.trim().toLowerCase()),
      password: z.string()
    }).parse(request.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user?.passwordHash || !verifyPassword(body.password, user.passwordHash)) {
      return reply.code(401).send({ error: "invalid_password" });
    }
    const token = app.jwt.sign({ sub: user.id }, { expiresIn: "30d" });
    return { token };
  });

  // The personal MCP credential — shown in the UI to copy into Codex or Claude.
  app.get("/api/setup/agent", async (request) => ({
    apiUrl: env.API_BASE_URL,
    apiKey: await accounts.getOrCreateAgentKey(requireUserId(request))
  }));

  app.get("/api/accounts", async (request) => ({
    accounts: await listManagedAccounts(prisma, requireUserId(request))
  }));

  app.get("/api/setup/writing-profile", async (request) => {
    const account = await requireManagedAccount(prisma, requireUserId(request), requestedAccountId(request));
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: account.userId },
      select: { writingProfile: true }
    });
    const profile = typeof user.writingProfile === "string"
      ? user.writingProfile
      : user.writingProfile && typeof user.writingProfile === "object" && "profile" in user.writingProfile && typeof user.writingProfile.profile === "string"
        ? user.writingProfile.profile
        : "";
    return { profile };
  });

  app.put("/api/setup/writing-profile", async (request) => {
    const body = z.object({ profile: z.string().trim().min(40).max(20_000) }).parse(request.body);
    const account = await requireManagedAccount(prisma, requireUserId(request), requestedAccountId(request));
    await prisma.user.update({
      where: { id: account.userId },
      data: { writingProfile: { profile: body.profile } }
    });
    return { ok: true };
  });

  app.get("/api/setup/reply-profile", async (request) => {
    const account = await requireManagedAccount(prisma, requireUserId(request), requestedAccountId(request));
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: account.userId },
      select: { replyProfile: true }
    });
    const profile = typeof user.replyProfile === "string"
      ? user.replyProfile
      : user.replyProfile && typeof user.replyProfile === "object" && "profile" in user.replyProfile && typeof user.replyProfile.profile === "string"
        ? user.replyProfile.profile
        : "";
    return { profile };
  });

  app.put("/api/setup/reply-profile", async (request) => {
    const body = z.object({ profile: z.string().trim().min(40).max(20_000) }).parse(request.body);
    const account = await requireManagedAccount(prisma, requireUserId(request), requestedAccountId(request));
    await prisma.user.update({
      where: { id: account.userId },
      data: { replyProfile: { profile: body.profile } }
    });
    return { ok: true };
  });

  // The browser companion gets a narrow, revocable credential instead of the
  // full-strength agent key. The plain token is intentionally shown once.
  app.get("/api/setup/extensions", async (request) => ({
    installations: await prisma.extensionInstallation.findMany({
      where: { userId: requireUserId(request) },
      select: { id: true, label: true, lastUsedAt: true, revokedAt: true, createdAt: true },
      orderBy: { createdAt: "desc" }
    })
  }));

  app.post("/api/setup/extensions", async (request) => {
    const body = z.object({ label: z.string().trim().min(1).max(80).optional() }).parse(request.body ?? {});
    const token = `qxe_${randomBytes(32).toString("base64url")}`;
    const installation = await prisma.extensionInstallation.create({
      data: {
        userId: requireUserId(request),
        label: body.label || "Quill browser companion",
        tokenHash: hashAgentKey(token)
      },
      select: { id: true, label: true, createdAt: true }
    });
    return { installation, token };
  });

  app.delete("/api/setup/extensions/:id", async (request) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    await prisma.extensionInstallation.updateMany({
      where: { id: params.id, userId: requireUserId(request), revokedAt: null },
      data: { revokedAt: new Date() }
    });
    return { ok: true };
  });
}
