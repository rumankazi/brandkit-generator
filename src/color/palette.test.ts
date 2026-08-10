import assert from "node:assert/strict";
import { test } from "node:test";
import { configSchema } from "../config/schema.js";
import { buildPalette, STEPS } from "./palette.js";

const cfg = configSchema.parse({
  brand: { title: "Test" },
  logo: { src: "x.svg" },
  color: {
    primary: "#0969DA",
    light: { bg: "#FFFFFF", fg: "#0D1117", accent: "#0969DA" },
    dark: { bg: "#0D1117", fg: "#F0F6FC", accent: "#4493F8" },
  },
});

test("ramps have all 11 steps", () => {
  const r = buildPalette(cfg);
  assert.equal(Object.keys(r.palette.primary).length, STEPS.length);
  assert.equal(Object.keys(r.palette.neutral).length, STEPS.length);
});

test("exact user anchors win over derived values", () => {
  const { themes } = buildPalette(cfg);
  assert.equal(themes.light.bg, "#FFFFFF");
  assert.equal(themes.light.fg, "#0D1117");
  assert.equal(themes.light.accent, "#0969DA");
  assert.equal(themes.dark.bg, "#0D1117");
  assert.equal(themes.dark.accent, "#4493F8");
  // accent mirrors into primary + ring for one coherent brand color
  assert.equal(themes.dark.primary, "#4493F8");
  assert.equal(themes.dark.ring, "#4493F8");
});

test("every audited fg/bg pairing meets the WCAG target", () => {
  const { audit } = buildPalette(cfg);
  const failing = audit.filter((a) => !a.pass);
  assert.equal(failing.length, 0, `failing: ${JSON.stringify(failing)}`);
});

test("palette derivation is deterministic", () => {
  assert.deepEqual(buildPalette(cfg), buildPalette(cfg));
});
