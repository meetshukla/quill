import { createHash } from "node:crypto";
import type { FastifyRequest } from "fastify";

declare module "fastify" {
  interface FastifyRequest {
    quillUserId?: string;
  }
}

export function hashAgentKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function requireUserId(request: FastifyRequest): string {
  if (!request.quillUserId) throw new Error("authenticated_user_required");
  return request.quillUserId;
}
