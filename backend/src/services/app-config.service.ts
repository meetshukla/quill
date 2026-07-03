import type { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret } from "../lib/crypto.js";
import { env } from "../config/env.js";

// Instance configuration for self-hosted deployments. X app credentials and
// the agent API key live in the DB (entered via the UI); env vars remain as a
// fallback so existing .env-based setups keep working.
export class AppConfigService {
  constructor(private readonly prisma: PrismaClient) {}

  private read() {
    return this.prisma.appConfig.findUnique({ where: { id: "singleton" } });
  }

  async getStatus() {
    const creds = await this.getXCredentials();
    const [config, account] = await Promise.all([
      this.read(),
      this.prisma.xAccount.findFirst({ select: { username: true } })
    ]);
    return {
      needsOwner: !config?.ownerPasswordHash,
      hasXCredentials: Boolean(creds.clientId && creds.clientSecret),
      xConnected: Boolean(account),
      xUsername: account?.username ?? null,
      callbackUrl: this.callbackUrl()
    };
  }

  callbackUrl(): string {
    return env.X_CALLBACK_URL || `${env.API_BASE_URL}/api/x/callback`;
  }

  // Used by the auth hook on every request — read-only, no writes.
  async getAuthState(): Promise<{ ownerSet: boolean; agentKey: string | null }> {
    const config = await this.read();
    return {
      ownerSet: Boolean(config?.ownerPasswordHash),
      agentKey: config?.agentApiKeyEncrypted
        ? decryptSecret(config.agentApiKeyEncrypted)
        : null
    };
  }

  async getOwnerPasswordHash(): Promise<string | null> {
    return (await this.read())?.ownerPasswordHash ?? null;
  }

  async setOwnerPasswordHash(hash: string) {
    await this.prisma.appConfig.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ownerPasswordHash: hash },
      update: { ownerPasswordHash: hash }
    });
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

  // The agent's API key — generated once, shown in the UI so the user can put
  // it in agent/.env. Accepted as a Bearer token by the auth hook.
  async getOrCreateAgentKey(): Promise<string> {
    const config = await this.read();
    if (config?.agentApiKeyEncrypted) return decryptSecret(config.agentApiKeyEncrypted);
    const key = `quill_${randomBytes(24).toString("base64url")}`;
    await this.prisma.appConfig.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", agentApiKeyEncrypted: encryptSecret(key) },
      update: { agentApiKeyEncrypted: encryptSecret(key) }
    });
    return key;
  }
}
