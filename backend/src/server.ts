import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import Fastify from "fastify";
import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { registerAnalyticsRoutes } from "./routes/analytics.routes.js";
import { registerComposerRoutes } from "./routes/composer.routes.js";
import { registerDraftRoutes } from "./routes/drafts.routes.js";
import { registerPostRoutes } from "./routes/posts.routes.js";
import { registerXRoutes } from "./routes/x.routes.js";

const app = Fastify({ logger: true });

await app.register(helmet);
await app.register(cors, { origin: env.APP_BASE_URL, credentials: true });
await app.register(jwt, { secret: env.JWT_SECRET });

// API-key guard. When API_KEY is set, every /api route requires
// `Authorization: Bearer <API_KEY>` — except health, CORS preflight, and the
// OAuth callback (X redirects to it with no header). Unset → open (local dev).
app.addHook("onRequest", async (request, reply) => {
  if (!env.API_KEY) return;
  if (request.method === "OPTIONS") return;
  if (!request.url.startsWith("/api")) return;
  if (request.url === "/api/health") return;
  if (request.url.startsWith("/api/x/callback")) return;
  if (request.headers.authorization !== `Bearer ${env.API_KEY}`) {
    return reply.code(401).send({ error: "unauthorized" });
  }
});

app.get("/api/health", async () => ({ ok: true }));

await registerXRoutes(app, prisma);
await registerComposerRoutes(app, prisma);
await registerDraftRoutes(app, prisma);
await registerPostRoutes(app, prisma);
await registerAnalyticsRoutes(app, prisma);

const port = Number(process.env.PORT ?? 8787);
await app.listen({ port, host: "0.0.0.0" });
