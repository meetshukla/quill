import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import Fastify from "fastify";
import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { registerAnalyticsRoutes } from "./routes/analytics.routes.js";
import { registerAssistantRoutes } from "./routes/assistant.routes.js";
import { registerComposerRoutes } from "./routes/composer.routes.js";
import { registerXRoutes } from "./routes/x.routes.js";

const app = Fastify({ logger: true });

await app.register(helmet);
await app.register(cors, { origin: env.APP_BASE_URL, credentials: true });
await app.register(jwt, { secret: env.JWT_SECRET });

app.get("/api/health", async () => ({ ok: true }));

await registerXRoutes(app, prisma);
await registerComposerRoutes(app, prisma);
await registerAssistantRoutes(app, prisma);
await registerAnalyticsRoutes(app, prisma);

const port = Number(process.env.PORT ?? 8787);
await app.listen({ port, host: "0.0.0.0" });

