import assert from "node:assert/strict";
import test from "node:test";
import { assertContentState, toXArticleContentState } from "../src/services/article.service.js";

test("requires an Article DraftJS body with at least one block", () => {
  assert.doesNotThrow(() => assertContentState({ blocks: [{ text: "Hello", type: "unstyled" }], entities: [] }));
  assert.throws(() => assertContentState({ blocks: [], entities: [] }));
});

test("normalizes Quill's DraftJS block keys to X's Article wire format", () => {
  const result = toXArticleContentState({
    blocks: [{
      key: "a",
      text: "A linked heading",
      type: "header-two",
      inlineStyleRanges: [{ offset: 0, length: 1, style: "BOLD" }],
      entityRanges: [{ offset: 2, length: 6, key: "0" }]
    }],
    entities: [{ key: "0", value: { type: "LINK", data: { url: "https://example.com" } } }]
  });
  assert.deepEqual(result.blocks, [{
    key: "a",
    text: "A linked heading",
    type: "header-two",
    inline_style_ranges: [{ offset: 0, length: 1, style: "BOLD" }],
    entity_ranges: [{ offset: 2, length: 6, key: "0" }]
  }]);
});
