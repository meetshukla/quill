import type { FastifyRequest } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { requireUserId } from "./auth.js";
import { requireManagedAccount } from "../services/managed-account.service.js";

export function requestedAccountId(request: FastifyRequest): string | undefined {
  const value = request.headers["x-quill-account-id"];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function managedAccountForRequest(prisma: PrismaClient, request: FastifyRequest) {
  return requireManagedAccount(prisma, requireUserId(request), requestedAccountId(request));
}
