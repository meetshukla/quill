import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { AssistantService } from "../services/assistant.service.js";

export async function registerAssistantRoutes(app: FastifyInstance, prisma: PrismaClient) {
  const assistant = new AssistantService(prisma);

  app.get("/api/assistant/chats", async () => {
    const xAccount = await prisma.xAccount.findFirstOrThrow();
    return { chats: await assistant.listChats(xAccount.id) };
  });

  app.post("/api/assistant/chats", async (request) => {
    const xAccount = await prisma.xAccount.findFirstOrThrow();
    const body = z.object({ title: z.string().optional() }).parse(request.body ?? {});
    return { chat: await assistant.createChat(xAccount.id, body.title) };
  });

  app.get("/api/assistant/context", async () => {
    const xAccount = await prisma.xAccount.findFirstOrThrow();
    return { context: await assistant.buildContext(xAccount.id) };
  });

  app.post("/api/assistant/draft-rewrite", async (request) => {
    const body = z
      .object({
        chatId: z.string().optional(),
        draft: z.string(),
        instruction: z.string()
      })
      .parse(request.body);
    return assistant.draftRewrite(body);
  });
}

