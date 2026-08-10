import assert from "node:assert/strict";
import { test } from "node:test";
import { PHASES, cycleOpacity, drawProgress, frameAt, frames, type AnimatedArt } from "./animate.js";

const ART: AnimatedArt = {
  artInner: '<path d="M0 0" fill="#0969DA"/><path d="M1 1" fill="#0D1117"/>',
  primary: "#0969DA",
  neutral: "#0D1117",
};

test("cycle opacity fades in, holds, fades out", () => {
  assert.equal(cycleOpacity(0), 0);
  assert.equal(cycleOpacity(PHASES.fadeIn), 1);
  assert.equal(cycleOpacity(0.5), 1);
  assert.equal(cycleOpacity(PHASES.holdEnd), 1);
  assert.ok(cycleOpacity(0.99) < 0.2 && cycleOpacity(0.99) >= 0);
});

test("draw progress is 0 at start, complete by drawEnd", () => {
  assert.equal(drawProgress(0), 0);
  assert.ok(drawProgress(PHASES.drawEnd / 2) > 0 && drawProgress(PHASES.drawEnd / 2) < 1);
  assert.equal(drawProgress(PHASES.drawEnd), 1);
  assert.equal(drawProgress(0.95), 1);
});

test("mid-draw frame reveals the artwork through a mask with a travelling tip", () => {
  const svg = frameAt(0.3, ART);
  assert.match(svg, /viewBox="0 0 914 914"/);
  assert.match(svg, /<mask id="ptrev"/);
  assert.match(svg, /mask="url\(#ptrev\)"/);
  assert.ok(svg.includes(ART.artInner), "artwork is what gets revealed");
  assert.match(svg, /rotate\(/, "pen/tip is placed at the travelling position");
});

test("settled frame is the raw artwork — no mask composite (pixel-exact)", () => {
  const svg = frameAt(0.82, ART);
  assert.ok(svg.includes(ART.artInner));
  assert.ok(!svg.includes("ptrev"), "no mask once settled");
  assert.ok(!/rotate\(/.test(svg), "no travelling pen once settled");
});

test("frames are deterministic and yield the requested count", () => {
  assert.equal(frameAt(0.4, ART), frameAt(0.4, ART));
  assert.equal(frames(24, ART).length, 24);
});
