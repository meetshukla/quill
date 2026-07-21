import assert from "node:assert/strict";
import test from "node:test";
import { assertContentState } from "../src/services/article.service.js";

test("requires an Article DraftJS body with at least one block", () => {
  assert.doesNotThrow(() => assertContentState({ blocks: [{ text: "Hello", type: "unstyled" }], entities: [] }));
  assert.throws(() => assertContentState({ blocks: [], entities: [] }));
});
