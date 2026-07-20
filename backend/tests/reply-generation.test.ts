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

test("Gemini reply generation retries generic contrast copy and keeps the specific reply", async () => {
  process.env.AI_PROVIDER = "gemini";
  process.env.AI_API_KEY = "test-key";
  process.env.AI_MODEL = "test-model";
  const originalFetch = globalThis.fetch;
  const replies = [
    "most tools track rank shifts but miss the updates that drive conversion",
    "the competitor screenshots are the useful part here — that is where the changes become visible"
  ];
  let calls = 0;
  globalThis.fetch = async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: replies[calls++] }] } }] }), { status: 200 });
  try {
    const { ReplyGenerationService } = await import("../src/services/reply-generation.service.js");
    const reply = await new ReplyGenerationService().generateReply(
      { replyProfile: { profile: "Use specific, human replies." } },
      { sourceHandle: "maker", url: "https://x.com/maker/status/1", text: "I added competitor screenshots to the timeline", title: null }
    );
    assert.equal(reply, replies[1]);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
