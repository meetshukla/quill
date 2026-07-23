import type { PrismaClient } from "@prisma/client";
import { decryptSecret, encryptSecret } from "../lib/crypto.js";
import { env } from "../config/env.js";

// Legacy fallback for restored .env-era connections only. New Quill users do
// not share an instance X app: their encrypted app credentials live with their
// own XAccount after OAuth.
export class AppConfigService {
  constructor(private readonly prisma: PrismaClient) {}

  private read() {
    return this.prisma.appConfig.findUnique({ where: { id: "singleton" } });
  }

  async getStatus(userId: string) {
    const creds = await this.getXCredentials();
    const account = await this.prisma.xAccount.findUnique({
      where: { userId },
      select: { username: true }
    });
    return {
      hasXCredentials: Boolean(creds.clientId && creds.clientSecret),
      xConnected: Boolean(account),
      xUsername: account?.username ?? null,
      callbackUrl: this.callbackUrl()
    };
  }

  callbackUrl(): string {
    return env.X_CALLBACK_URL || `${env.API_BASE_URL}/api/x/callback`;
  }

  async getXCredentials(): Promise<{ clientId: string; clientSecret: string }> {
    const config = await this.read();
    return {
      clientId: config?.xClientIdEncrypted
        ? decryptSecret(config.xClientIdEncrypted)
        : env.X_CLIENT_ID,
      clientSecret: config?.xClientSecretEncrypted
        ? decryptSecret(config.xClientSecretEncrypted)
        : env.X_CLIENT_SECRET
    };
  }

  async setXCredentials(clientId: string, clientSecret: string) {
    const data = {
      xClientIdEncrypted: encryptSecret(clientId),
      xClientSecretEncrypted: encryptSecret(clientSecret)
    };
    await this.prisma.appConfig.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...data },
      update: data
    });
  }

}
