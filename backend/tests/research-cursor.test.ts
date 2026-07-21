import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decodeResearchCursor, encodeResearchCursor } from "../src/lib/research-cursor.js";

describe("research cursor", () => {
  it("round-trips a capturedAt/id key", () => {
    const value = { capturedAt: "2026-07-21T00:00:00.000Z", id: "9cfed9ef-9700-4ca0-bbe7-2faaed953ccd" };
    assert.deepEqual(decodeResearchCursor(encodeResearchCursor(value)), value);
  });

  it("rejects malformed cursors", () => {
    assert.throws(() => decodeResearchCursor("not-a-cursor"), /invalid_research_cursor/);
  });
});
