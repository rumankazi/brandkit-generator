import assert from "node:assert/strict";
import { test } from "node:test";
import { loadFont } from "./fonts.js";
import { layoutWordmark, runToPaths } from "./layout.js";

test("wordmark layout produces geometry + sane metrics", () => {
  const bold = loadFont("Space Grotesk", 700);
  const regular = loadFont("Space Grotesk", 400);
  const wm = layoutWordmark(bold, regular, "Pipeline Team", 100);

  assert.ok(wm.d.length > 0, "has path data");
  assert.ok(wm.width > 0, "positive advance width");
  assert.ok(wm.capHeight > 0 && wm.capHeight < 100, "cap-height within em");
  // tight bbox is finite and non-degenerate
  assert.ok(Number.isFinite(wm.bbox.minX) && Number.isFinite(wm.bbox.maxY));
  assert.ok(wm.bbox.maxX > wm.bbox.minX && wm.bbox.maxY > wm.bbox.minY);
});

test("text layout is deterministic", () => {
  const f = loadFont("Space Grotesk", 700);
  assert.deepEqual(runToPaths(f, "Pipeline", 100), runToPaths(f, "Pipeline", 100));
});
