import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { backfillResearchVideoMedia } from "../src/lib/research-media.js";

describe("research media backfill", () => {
  it("upgrades known X video thumbnails without downloading media", () => {
    const result = backfillResearchVideoMedia({
      media: [{ type: "image", url: "https://pbs.twimg.com/amplify_video_thumb/123/img/example.jpg", alt: "Image" }]
    }, "https://x.com/example/status/123");
    assert.equal(result.changed, true);
    assert.equal(result.videoEntries, 1);
    assert.deepEqual(result.raw, {
      media: [{
        type: "video",
        url: "https://pbs.twimg.com/amplify_video_thumb/123/img/example.jpg",
        alt: "Image",
        posterUrl: "https://pbs.twimg.com/amplify_video_thumb/123/img/example.jpg",
        sourceUrl: "https://x.com/example/status/123",
        playableOnSource: true
      }]
    });
  });

  it("leaves ordinary images alone", () => {
    const raw = { media: [{ type: "image", url: "https://pbs.twimg.com/media/example.jpg" }] };
    assert.deepEqual(backfillResearchVideoMedia(raw, "https://x.com/example/status/123"), {
      raw,
      changed: false,
      videoEntries: 0
    });
  });
});
