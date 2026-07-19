import assert from "node:assert/strict";
import test from "node:test";

test("Gemini reply generation uses the stored reply profile and never returns model wrapping", async () => {
  process.env.AI_PROVIDER = "gemini";
  process.env.AI_API_KEY = "test-key";
  process.env.AI_MODEL = "test-model";
  const originalFetch = globalThis.fetch;
  let request: { url: string; init?: RequestInit } | undefined;
  globalThis.fetch = async (url, init) => {
    request = { url: String(url), init };
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '"this is where tighter creative feedback loops help"' }] } }] }), { status: 200 });
  };
  try {
    const { ReplyGenerationService } = await import("../src/services/reply-generation.service.js");
    const service = new ReplyGenerationService();
    const reply = await service.generateReply(
      { replyProfile: { profile: "Use practical, lowercase reply writing. Do not force a product mention." } },
      { sourceHandle: "creator", url: "https://x.com/creator/status/1", text: "creative testing needs faster loops", title: null }
    );
    assert.equal(reply, "this is where tighter creative feedback loops help");
    assert.match(request?.url ?? "", /models\/test-model:generateContent/);
    const body = JSON.parse(String(request?.init?.body));
    assert.match(body.contents[0].parts[0].text, /practical, lowercase reply writing/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
