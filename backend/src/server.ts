import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import Fastify from "fastify";
import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { AppConfigService } from "./services/app-config.service.js";
import { registerAnalyticsRoutes } from "./routes/analytics.routes.js";
import { registerComposerRoutes } from "./routes/composer.routes.js";
import { registerDraftRoutes } from "./routes/drafts.routes.js";
import { registerPostRoutes } from "./routes/posts.routes.js";
import { registerSetupRoutes } from "./routes/setup.routes.js";
import { registerXRoutes } from "./routes/x.routes.js";

const app = Fastify({ logger: true });

await app.register(helmet);
await app.register(cors, { origin: env.APP_BASE_URL, credentials: true });
await app.register(jwt, { secret: env.JWT_SECRET });

const appConfig = new AppConfigService(prisma);

// Paths reachable without auth: health, the setup/login flow, and the OAuth
// callback (X redirects there with no Authorization header).
const PUBLIC_PATHS = new Set([
  "/api/health",
  "/api/setup/status",
  "/api/setup/owner",
  "/api/auth/login"
]);

// Owner auth: once the instance is claimed (owner password set), every other
// /api route requires a Bearer token — the owner's JWT (browser), the agent
// API key (CLI), or the env API_KEY. Until it's claimed, routes stay open so
// local bootstrap works; the UI forces claiming as its first step.
app.addHook("onRequest", async (request, reply) => {
  if (request.method === "OPTIONS") return;
  const path = request.url.split("?")[0] ?? request.url;
  if (!path.startsWith("/api")) return;
  if (PUBLIC_PATHS.has(path)) return;
  if (path.startsWith("/api/x/callback")) return;

  const { ownerSet, agentKey } = await appConfig.getAuthState();
  if (!ownerSet && !env.API_KEY) return; // unclaimed instance → open bootstrap

  const header = request.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return reply.code(401).send({ error: "unauthorized" });

  if (env.API_KEY && token === env.API_KEY) return;
  if (agentKey && token === agentKey) return;
  try {
    app.jwt.verify(token);
    return;
  } catch {
    return reply.code(401).send({ error: "unauthorized" });
  }
});

app.get("/api/health", async () => ({ ok: true }));

await registerSetupRoutes(app, prisma);
await registerXRoutes(app, prisma);
await registerComposerRoutes(app, prisma);
await registerDraftRoutes(app, prisma);
await registerPostRoutes(app, prisma);
await registerAnalyticsRoutes(app, prisma);

const port = Number(process.env.PORT ?? 8787);
await app.listen({ port, host: "0.0.0.0" });
