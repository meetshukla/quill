import assert from "node:assert/strict";
import test from "node:test";
import { assertPostMediaMix, assertUploadable, MAX_GIF_BYTES, MAX_IMAGE_BYTES } from "../src/services/media-asset.service.js";

test("accepts supported owned uploads at X's file-size limits", () => {
  assert.doesNotThrow(() => assertUploadable("image/png", MAX_IMAGE_BYTES));
  assert.doesNotThrow(() => assertUploadable("image/gif", MAX_GIF_BYTES));
  assert.doesNotThrow(() => assertUploadable("video/mp4", 512 * 1024 * 1024));
});

test("rejects unsupported or oversized uploads", () => {
  assert.throws(() => assertUploadable("application/pdf", 20));
  assert.throws(() => assertUploadable("image/png", MAX_IMAGE_BYTES + 1));
  assert.throws(() => assertUploadable("video/mp4", 512 * 1024 * 1024 + 1));
});

test("enforces X post media combinations before scheduling", () => {
  assert.doesNotThrow(() => assertPostMediaMix([
    { contentType: "image/png" },
    { contentType: "image/jpeg" },
    { contentType: "image/webp" },
    { contentType: "image/png" }
  ]));
  assert.doesNotThrow(() => assertPostMediaMix([{ contentType: "video/mp4" }]));
  assert.throws(() => assertPostMediaMix([{ contentType: "video/mp4" }, { contentType: "image/png" }]));
  assert.throws(() => assertPostMediaMix([{ contentType: "image/gif" }, { contentType: "video/mp4" }]));
});
