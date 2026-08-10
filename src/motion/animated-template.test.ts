import assert from "node:assert/strict";
import { test } from "node:test";
import { renderAnimatedMark } from "./animated-template.js";

test("recolors every element — no reference colours leak through", () => {
  const svg = renderAnimatedMark({ primary: "#0969DA", neutral: "#0D1117" });
  assert.ok(svg.includes("#0969DA") && svg.includes("#0D1117"), "theme colours present");
  assert.ok(!svg.includes("#1297E4"), "no leftover reference blue");
  assert.ok(!svg.includes("#10142B"), "no leftover reference ink");
  assert.ok(!svg.includes("#FFFFFF"), "no leftover reference white (cU)");
});

test("artwork colours match the real logo (blue top-right loop, ink bottom-left loop)", () => {
  const svg = renderAnimatedMark({ primary: "#0969DA", neutral: "#0D1117" });
  assert.ok(svg.includes('H769Z" fill="#0969DA"'), "top-right P bowl is blue");
  assert.ok(svg.includes('H688.383Z" fill="#0D1117"'), "bottom-left loop + middle bar is ink");
});

test("keeps the proven reference structure: mask inside .pt so the reveal animates", () => {
  const svg = renderAnimatedMark({ primary: "#0969DA", neutral: "#0D1117" });
  assert.match(svg, /viewBox="0 0 1024 1024"/);
  // the mask must sit inside .pt (not in <defs>) — otherwise `.pt *` never
  // reaches its draw stroke and nothing reveals (the bug we hit).
  const ptStart = svg.indexOf('<g class="pt">');
  const maskStart = svg.indexOf('<mask id="ptrv">');
  assert.ok(ptStart >= 0 && maskStart > ptStart, "mask is nested inside .pt");
  assert.match(svg, /@keyframes pt_draw/);
  assert.match(svg, /prefers-reduced-motion/);
});

test("end-of-loop polish: wedge clears (pt_wedge) and only the visible pen retracts (pp2)", () => {
  const svg = renderAnimatedMark({ primary: "#0969DA", neutral: "#0D1117" });
  assert.match(svg, /@keyframes pt_wedge/, "wedge fade keyframe present");
  assert.match(svg, /<path class="wedge"/, "start-wedge carries the fade class");
  assert.match(svg, /@keyframes pt_pop2/, "visible-pen retract keyframe present");
  assert.match(svg, /<g class="pp2">/, "visible pen uses pp2 (retract); mask tip stays on pp");
});

test("settle shows a clean whole-logo pulse: the revealed copy hides when .fin takes over", () => {
  const svg = renderAnimatedMark({ primary: "#0969DA", neutral: "#0D1117" });
  assert.match(svg, /@keyframes pt_reveal/);
  assert.match(svg, /<g class="rev" mask="url\(#ptrv\)">/, "revealed copy carries the cross-fade class");
  // pt_reveal is the inverse of pt_final: visible during draw, gone at settle.
  assert.match(svg, /@keyframes pt_reveal\{0.00%\{opacity:1\}55.80%\{opacity:1\}56.00%\{opacity:0\}/);
});

test("duration is parameterizable, default 3.2s", () => {
  assert.match(renderAnimatedMark({ primary: "#000", neutral: "#fff" }), /animation-duration:3\.2s/);
  assert.match(renderAnimatedMark({ primary: "#000", neutral: "#fff", durationMs: 4000 }), /animation-duration:4s/);
});
