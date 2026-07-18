import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { decryptSecret, encryptSecret } from "../lib/crypto.js";
import { hashAgentKey } from "../lib/auth.js";

export class PersonalAccountService {
  constructor(private readonly prisma: PrismaClient) {}

  async getOrCreateAgentKey(userId: string): Promise<string> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.agentApiKeyEncrypted) return decryptSecret(user.agentApiKeyEncrypted);

    const key = `quill_${randomBytes(24).toString("base64url")}`;
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        agentApiKeyEncrypted: encryptSecret(key),
        agentApiKeyHash: hashAgentKey(key)
      }
    });
    return key;
  }
}
