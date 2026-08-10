import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ARROWHEADS,
  CORNER_R,
  SUBPATHS,
  centerlineTiming,
  renderCenterlineMark,
  sampleSubpath,
  subpathLength,
} from "./centerline.js";

test("every arc is a clean quarter-turn about its center at radius 145", () => {
  for (const sp of SUBPATHS) {
    for (const seg of sp.segs) {
      if (seg.kind !== "arc") continue;
      const rFrom = Math.hypot(seg.from[0] - seg.center[0], seg.from[1] - seg.center[1]);
      const rTo = Math.hypot(seg.to[0] - seg.center[0], seg.to[1] - seg.center[1]);
      assert.ok(Math.abs(rFrom - CORNER_R) < 1, `${sp.id}: from on radius (${rFrom.toFixed(1)})`);
      assert.ok(Math.abs(rTo - CORNER_R) < 1, `${sp.id}: to on radius (${rTo.toFixed(1)})`);
    }
  }
});

test("segments are contiguous within each subpath", () => {
  for (const sp of SUBPATHS) {
    for (let i = 1; i < sp.segs.length; i++) {
      const prev = sp.segs[i - 1]!.to;
      const cur = sp.segs[i]!.from;
      assert.deepEqual(cur, prev, `${sp.id} seg ${i} starts where ${i - 1} ends`);
    }
  }
});

test("sampler endpoints match subpath geometry (position + arc tangent)", () => {
  for (const sp of SUBPATHS) {
    const len = subpathLength(sp);
    const start = sampleSubpath(sp, 0);
    const end = sampleSubpath(sp, len);
    assert.ok(Math.hypot(start.x - sp.segs[0]!.from[0], start.y - sp.segs[0]!.from[1]) < 0.5, `${sp.id} start`);
    const last = sp.segs[sp.segs.length - 1]!.to;
    assert.ok(Math.hypot(end.x - last[0], end.y - last[1]) < 0.5, `${sp.id} end`);
    // Midpoint stays on the canvas and yields a finite tangent.
    const mid = sampleSubpath(sp, len / 2);
    assert.ok(Number.isFinite(mid.angleDeg) && mid.x >= 0 && mid.x <= 914, `${sp.id} mid finite`);
  }
});

test("timing is deterministic and sums the drawn subpaths", () => {
  const a = centerlineTiming();
  const b = centerlineTiming();
  assert.deepEqual(a, b);
  const sum = a.drawOrder.reduce((n, s) => n + s.length, 0);
  assert.ok(Math.abs(sum - a.total) < 0.01);
  assert.equal(a.drawOrder.map((s) => s.id).join(""), "GBD");
});

test("arrowhead bases coincide with subpath endpoints (flow markers land on the ribbon)", () => {
  const endpoints = SUBPATHS.flatMap((s) => [s.segs[0]!.from, s.segs[s.segs.length - 1]!.to]);
  for (const h of ARROWHEADS) {
    const hit = endpoints.some((p) => p[0] === h.base[0] && p[1] === h.base[1]);
    assert.ok(hit, `arrowhead base ${h.base} sits on an endpoint`);
  }
});

test("rendered mark: masked ribbons + convex points + knocked-out sockets", () => {
  const svg = renderCenterlineMark({ primary: "#0969DA", neutral: "#0D1117" });
  assert.match(svg, /viewBox="0 0 914 914"/);
  assert.match(svg, /mask id="nm-neutral"/);
  assert.match(svg, /mask id="nm-primary"/);
  assert.match(svg, /mask="url\(#nm-neutral\)"/);
  assert.equal((svg.match(/stroke-width="110"/g) ?? []).length, 2, "two ribbons");
  assert.equal((svg.match(/Z" fill="#/g) ?? []).length, 2, "two convex points (hex fill, closed)");
  assert.equal((svg.match(/fill="black"/g) ?? []).length, 2, "two socket knockouts");
  assert.ok(svg.includes("#0969DA") && svg.includes("#0D1117"));
});

test("arrowheads split into two convex points and two concave notches", () => {
  assert.equal(ARROWHEADS.filter((a) => a.kind === "point").length, 2);
  assert.equal(ARROWHEADS.filter((a) => a.kind === "notch").length, 2);
});
