import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { xScopes } from "../config/env.js";
import { encryptSecret } from "../lib/crypto.js";
import type { XTokenResponse, XUser } from "../types/x.js";
import { AppConfigService } from "./app-config.service.js";

const AUTH_URL = "https://x.com/i/oauth2/authorize";
const TOKEN_URL = "https://api.x.com/2/oauth2/token";
const X_API_BASE = "https://api.x.com/2";

export class XOAuthService {
  private readonly config: AppConfigService;

  constructor(private readonly prisma: PrismaClient) {
    this.config = new AppConfigService(prisma);
  }

  async createAuthorizationUrl(state: string, codeVerifier: string) {
    const { clientId } = await this.requireCredentials();
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: this.config.callbackUrl(),
      scope: xScopes.join(" "),
      state,
      code_challenge: pkceChallenge(codeVerifier),
      code_challenge_method: "S256"
    });
    return `${AUTH_URL}?${params.toString()}`;
  }

  createStateAndVerifier() {
    return {
      state: randomBytes(24).toString("base64url"),
      codeVerifier: randomBytes(48).toString("base64url")
    };
  }

  async exchangeCode(code: string, codeVerifier: string): Promise<XTokenResponse> {
    const { clientId, clientSecret } = await this.requireCredentials();
    const body = new URLSearchParams({
      code,
      grant_type: "authorization_code",
      client_id: clientId,
      redirect_uri: this.config.callbackUrl(),
      code_verifier: codeVerifier
    });

    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`
      },
      body
    });
    if (!response.ok) throw new Error(`X OAuth code exchange failed: ${response.status}`);
    return (await response.json()) as XTokenResponse;
  }

  private async requireCredentials() {
    const creds = await this.config.getXCredentials();
    if (!creds.clientId || !creds.clientSecret) {
      throw new Error("X app credentials not configured — add them in Settings first");
    }
    return creds;
  }

  async fetchMe(accessToken: string): Promise<XUser> {
    const response = await fetch(`${X_API_BASE}/users/me?user.fields=profile_image_url`, {
      headers: { authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) throw new Error(`X /users/me failed during OAuth callback: ${response.status}`);
    const payload = (await response.json()) as { data?: XUser };
    if (!payload.data) throw new Error("X /users/me did not return a user during OAuth callback");
    return payload.data;
  }

  async upsertConnectedAccount(userId: string, token: XTokenResponse, xUser: XUser) {
    const scopes = token.scope?.split(/\s+/).filter(Boolean) ?? xScopes;
    return this.prisma.xAccount.upsert({
      where: { userId },
      create: {
        userId,
        xUserId: xUser.id,
        username: xUser.username,
        displayName: xUser.name,
        avatarUrl: xUser.profile_image_url,
        accessTokenEncrypted: encryptSecret(token.access_token),
        refreshTokenEncrypted: token.refresh_token ? encryptSecret(token.refresh_token) : null,
        scopes,
        writeEnabled: scopes.includes("tweet.write")
      },
      update: {
        xUserId: xUser.id,
        username: xUser.username,
        displayName: xUser.name,
        avatarUrl: xUser.profile_image_url,
        accessTokenEncrypted: encryptSecret(token.access_token),
        refreshTokenEncrypted: token.refresh_token ? encryptSecret(token.refresh_token) : undefined,
        scopes,
        writeEnabled: scopes.includes("tweet.write")
      }
    });
  }
}

function pkceChallenge(codeVerifier: string) {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}
