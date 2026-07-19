import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { AppConfigService } from "../services/app-config.service.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { env } from "../config/env.js";
import { requireUserId } from "../lib/auth.js";
import { PersonalAccountService } from "../services/personal-account.service.js";
import { randomBytes } from "node:crypto";
import { hashAgentKey } from "../lib/auth.js";

// Personal account signup/login, plus first-run configuration of the shared
// Quill X developer app. Each signed-in person connects their own X account
// and receives an agent key scoped only to that account.
export async function registerSetupRoutes(app: FastifyInstance, prisma: PrismaClient) {
  const config = new AppConfigService(prisma);
  const accounts = new PersonalAccountService(prisma);

  app.get("/api/setup/status", async (request) => config.getStatus(requireUserId(request)));

  app.post("/api/auth/signup", async (request, reply) => {
    const body = z.object({
      email: z.string().email().transform((email) => email.trim().toLowerCase()),
      name: z.string().trim().min(1).max(100).optional(),
      password: z.string().min(8)
    }).parse(request.body);
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) return reply.code(409).send({ error: "email_already_registered" });
    const user = await prisma.user.create({
      data: { email: body.email, name: body.name, passwordHash: hashPassword(body.password) }
    });
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

  // The shared X developer app can be configured once. After that, any person
  // can safely connect their own X account without being able to replace it.
  app.put("/api/setup/x-credentials", async (request, reply) => {
    const body = z
      .object({ clientId: z.string().min(1), clientSecret: z.string().min(1) })
      .parse(request.body);
    const status = await config.getStatus(requireUserId(request));
    if (status.hasXCredentials) {
      return reply.code(409).send({ error: "x_credentials_already_configured" });
    }
    await config.setXCredentials(body.clientId.trim(), body.clientSecret.trim());
    return { ok: true, callbackUrl: config.callbackUrl() };
  });

  // The agent's credentials — shown in the UI to copy into agent/.env.
  app.get("/api/setup/agent", async (request) => ({
    apiUrl: env.API_BASE_URL,
    apiKey: await accounts.getOrCreateAgentKey(requireUserId(request))
  }));

  app.get("/api/setup/writing-profile", async (request) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: requireUserId(request) },
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
    await prisma.user.update({
      where: { id: requireUserId(request) },
      data: { writingProfile: { profile: body.profile } }
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
