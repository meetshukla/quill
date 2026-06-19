import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseXPostId } from "../src/lib/x-post-url.js";

describe("parseXPostId", () => {
  it("parses x.com status URLs", () => {
    assert.equal(parseXPostId("https://x.com/me/status/1800000000000000000"), "1800000000000000000");
  });

  it("parses twitter.com status URLs", () => {
    assert.equal(parseXPostId("https://twitter.com/me/status/1800000000000000001"), "1800000000000000001");
  });

  it("parses web status URLs", () => {
    assert.equal(parseXPostId("https://x.com/i/web/status/1800000000000000002"), "1800000000000000002");
  });

  it("rejects non-post URLs", () => {
    assert.equal(parseXPostId("https://x.com/me"), null);
  });
});
