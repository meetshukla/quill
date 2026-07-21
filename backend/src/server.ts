import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import Fastify from "fastify";
import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { ensureDefaultUser } from "./services/current-user.service.js";
import { hashAgentKey } from "./lib/auth.js";
import { registerAnalyticsRoutes } from "./routes/analytics.routes.js";
import { registerArticleRoutes } from "./routes/articles.routes.js";
import { registerComposerRoutes } from "./routes/composer.routes.js";
import { registerDraftRoutes } from "./routes/drafts.routes.js";
import { registerMediaRoutes } from "./routes/media.routes.js";
import { registerMcpRoutes } from "./mcp/routes.js";
import { registerPostRoutes } from "./routes/posts.routes.js";
import { registerResearchRoutes } from "./routes/research.routes.js";
import { registerSetupRoutes } from "./routes/setup.routes.js";
import { registerXRoutes } from "./routes/x.routes.js";
import { startWorker } from "./workers/index.js";

const app = Fastify({ logger: true });

// The largest supported owned upload is an X video (512 MB). Media endpoints
// accept only image/video content types; every other API route stays JSON.
app.addContentTypeParser(
  /^(image\/(jpeg|png|webp|gif)|video\/(mp4|quicktime))$/,
  { parseAs: "buffer", bodyLimit: 512 * 1024 * 1024 },
  (_request, body, done) => done(null, body)
);

await app.register(helmet);
await app.register(cors, {
  origin(origin, callback) {
    // The companion is authenticated by a revocable bearer token, never by
    // cookies. Chrome development IDs are unstable, so accept extension
    // origins here while keeping normal browser access pinned to the app URL.
    const allowed = !origin || origin === env.APP_BASE_URL ||
      (env.QUILL_EXTENSION_ORIGIN && origin === env.QUILL_EXTENSION_ORIGIN) ||
      origin?.startsWith("chrome-extension://");
    callback(null, Boolean(allowed));
  },
  credentials: true
});
await app.register(jwt, { secret: env.JWT_SECRET });

await ensureDefaultUser(prisma);

// Paths reachable without auth: health, signup/login, and the OAuth
// callback (X redirects there with no Authorization header).
const PUBLIC_PATHS = new Set([
  "/api/health",
  "/api/auth/login",
  "/api/auth/signup"
]);

// Every request resolves to one personal Quill account. Browser JWTs carry the
// user id; agent keys are hashed and looked up per user.
app.addHook("onRequest", async (request, reply) => {
  if (request.method === "OPTIONS") return;
  const path = request.url.split("?")[0] ?? request.url;
  if (!path.startsWith("/api")) return;
  if (PUBLIC_PATHS.has(path)) return;
  if (path.startsWith("/api/x/callback")) return;

  const header = request.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return reply.code(401).send({ error: "unauthorized" });

  const agentUser = await prisma.user.findUnique({
    where: { agentApiKeyHash: hashAgentKey(token) },
    select: { id: true }
  });
  if (agentUser) {
    request.quillUserId = agentUser.id;
    request.quillAuthKind = "agent";
    return;
  }
  const extension = await prisma.extensionInstallation.findFirst({
    where: { tokenHash: hashAgentKey(token), revokedAt: null },
    select: { id: true, userId: true }
  });
  if (extension) {
    // Extension tokens can capture and read research only. They cannot access
    // drafts, X credentials, scheduling, or any publishing endpoint.
    if (!path.startsWith("/api/research")) {
      return reply.code(403).send({ error: "extension_token_scope" });
    }
    request.quillUserId = extension.userId;
    request.quillAuthKind = "extension";
    await prisma.extensionInstallation.update({
      where: { id: extension.id },
      data: { lastUsedAt: new Date() }
    });
    return;
  }
  try {
    const claims = app.jwt.verify<{ sub?: string }>(token);
    if (!claims.sub) throw new Error("missing_subject");
    const user = await prisma.user.findUnique({ where: { id: claims.sub }, select: { id: true } });
    if (!user) throw new Error("unknown_user");
    request.quillUserId = user.id;
    request.quillAuthKind = "browser";
    return;
  } catch {
    return reply.code(401).send({ error: "unauthorized" });
  }
});

app.get("/api/health", async () => ({ ok: true }));

await registerSetupRoutes(app, prisma);
await registerArticleRoutes(app, prisma);
await registerXRoutes(app, prisma);
await registerComposerRoutes(app, prisma);
await registerDraftRoutes(app, prisma);
await registerMediaRoutes(app, prisma);
await registerPostRoutes(app, prisma);
await registerResearchRoutes(app, prisma);
await registerAnalyticsRoutes(app, prisma);
await registerMcpRoutes(app, prisma);

const port = Number(process.env.PORT ?? 8787);
await app.listen({ port, host: "0.0.0.0" });

// Fuse the background worker into the API process so one service runs both.
// Started after the server is listening so the /api/health check passes fast.
startWorker();
