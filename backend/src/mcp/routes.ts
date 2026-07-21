import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { PrismaClient } from "@prisma/client";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { hashAgentKey } from "../lib/auth.js";
import { buildQuillMcpServer } from "./server.js";

const MAX_MCP_JSON_BYTES = 720 * 1024 * 1024;

function setMcpCors(request: FastifyRequest, reply: { header(name: string, value: string): unknown }) {
  const origin = request.headers.origin;
  if (!origin) return;
  reply.header("Access-Control-Allow-Origin", origin);
  reply.header("Vary", "Origin");
  reply.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  reply.header("Access-Control-Allow-Headers", "Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID");
  reply.header("Access-Control-Expose-Headers", "Mcp-Session-Id");
  reply.header("Access-Control-Max-Age", "86400");
}

async function resolveAgentUser(prisma: PrismaClient, request: FastifyRequest) {
  const header = request.headers.authorization ?? "";
  const key = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!key) return null;
  return prisma.user.findUnique({ where: { agentApiKeyHash: hashAgentKey(key) }, select: { id: true } });
}

/**
 * Remote Streamable HTTP MCP. It deliberately uses the existing per-user
 * Quill agent key rather than a second auth system. Every request receives a
 * new server/transport, keeping this deployment stateless and Railway-safe.
 */
export async function registerMcpRoutes(app: FastifyInstance, prisma: PrismaClient) {
  app.options("/mcp", async (request, reply) => {
    setMcpCors(request, reply);
    return reply.code(204).send();
  });

  app.post("/mcp", { bodyLimit: MAX_MCP_JSON_BYTES }, async (request, reply) => {
    setMcpCors(request, reply);
    const user = await resolveAgentUser(prisma, request);
    if (!user) {
      return reply.code(401).send({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Unauthorized. Use the personal Quill MCP key from Settings." },
        id: null
      });
    }

    const server = buildQuillMcpServer({ prisma, userId: user.id });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    reply.raw.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      reply.hijack();
      await transport.handleRequest(request.raw, reply.raw, request.body);
    } catch (error) {
      request.log.error(error, "Quill MCP request failed");
      if (!reply.raw.headersSent) {
        reply.raw.statusCode = 500;
        reply.raw.setHeader("Content-Type", "application/json");
        reply.raw.end(JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null
        }));
      }
    }
  });

  const methodNotAllowed = async (request: FastifyRequest, reply: { code(status: number): { send(body: unknown): unknown }; header(name: string, value: string): unknown }) => {
    setMcpCors(request, reply);
    return reply.code(405).send({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed. Use POST." },
      id: null
    });
  };
  app.get("/mcp", methodNotAllowed);
  app.delete("/mcp", methodNotAllowed);
}
