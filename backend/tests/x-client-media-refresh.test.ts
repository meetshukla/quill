import assert from "node:assert/strict";
import test from "node:test";

// The backend test command does not load .env. Set only inert test values
// before importing the crypto-backed X client.
process.env.DATABASE_URL ??= "file:./quill-test.db";
process.env.APP_BASE_URL ??= "http://localhost:3000";
process.env.API_BASE_URL ??= "http://localhost:3001";
process.env.JWT_SECRET ??= "test-jwt-secret-that-is-longer-than-thirty-two-characters";
process.env.ENCRYPTION_KEY_BASE64 ??= Buffer.alloc(32, 7).toString("base64");

const [{ XClientService }, { encryptSecret }] = await Promise.all([
  import("../src/services/x-client.service.js"),
  import("../src/lib/crypto.js")
]);

test("uses refreshed credentials for every stage after media initialize refreshes", async () => {
  const staleAccessToken = encryptSecret("stale-access-token");
  const oldRefreshToken = encryptSecret("old-refresh-token");
  const account = {
    id: "account-1",
    userId: "user-1",
    xUserId: "x-user-1",
    username: "test-user",
    displayName: null,
    avatarUrl: null,
    accessTokenEncrypted: staleAccessToken,
    refreshTokenEncrypted: oldRefreshToken,
    xClientIdEncrypted: encryptSecret("client-id"),
    xClientSecretEncrypted: null,
    scopes: ["tweet.write", "media.write", "offline.access"],
    writeEnabled: true,
    lastSyncedAt: null,
    analyticsLastSyncedAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  let persistedAccount = account;
  const usageEvents: unknown[] = [];
  const prisma = {
    appConfig: { findUnique: async () => null },
    xAccount: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        persistedAccount = { ...persistedAccount, ...data };
        return persistedAccount;
      }
    },
    xApiUsageEvent: {
      create: async ({ data }: { data: unknown }) => {
        usageEvents.push(data);
        return data;
      }
    }
  };

  const originalFetch = globalThis.fetch;
  const requestAuth: Array<{ path: string; authorization: string | null }> = [];
  let initializeAttempts = 0;
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = ((callback: (...args: never[]) => void, _delay?: number, ...args: never[]) => {
    queueMicrotask(() => callback(...args));
    return 0 as never;
  }) as typeof setTimeout;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/oauth2/token")) {
      return new Response(JSON.stringify({
        access_token: "fresh-access-token",
        refresh_token: "fresh-refresh-token"
      }), { status: 200, headers: { "content-type": "application/json" } });
    }

    const parsedUrl = new URL(url);
    const path = `${parsedUrl.pathname}${parsedUrl.search}`;
    const authorization = new Headers(init?.headers).get("authorization");
    requestAuth.push({ path, authorization });

    if (path === "/2/media/upload/initialize") {
      initializeAttempts += 1;
      if (initializeAttempts === 1) {
        assert.equal(authorization, "Bearer stale-access-token");
        return new Response(JSON.stringify({ detail: "Unauthorized" }), { status: 401 });
      }
      assert.equal(authorization, "Bearer fresh-access-token");
      return new Response(JSON.stringify({ data: { id: "media-1" } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    assert.equal(authorization, "Bearer fresh-access-token", `${path} must not reuse the expired token`);
    if (path.endsWith("/append")) return new Response(null, { status: 204 });
    if (path.endsWith("/finalize")) {
      return new Response(JSON.stringify({ data: { id: "media-1", processing_info: { state: "pending", check_after_secs: 0 } } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    if (path === "/2/media/upload?command=STATUS&media_id=media-1") {
      return new Response(JSON.stringify({ data: { id: "media-1", processing_info: { state: "succeeded" } } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    throw new Error(`unexpected request: ${url}`);
  }) as typeof fetch;

  try {
    const client = new XClientService(prisma as never);
    const mediaId = await client.uploadMedia(account as never, {
      data: Buffer.from("small video fixture"),
      filename: "fixture.mp4",
      contentType: "video/mp4"
    });

    assert.equal(mediaId, "media-1");
    assert.equal(initializeAttempts, 2);
    assert.deepEqual(requestAuth.map(({ path, authorization }) => ({ path, authorization })), [
      { path: "/2/media/upload/initialize", authorization: "Bearer stale-access-token" },
      { path: "/2/media/upload/initialize", authorization: "Bearer fresh-access-token" },
      { path: "/2/media/upload/media-1/append", authorization: "Bearer fresh-access-token" },
      { path: "/2/media/upload/media-1/finalize", authorization: "Bearer fresh-access-token" },
      { path: "/2/media/upload?command=STATUS&media_id=media-1", authorization: "Bearer fresh-access-token" }
    ]);
    assert.equal(usageEvents.length, 4);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});
