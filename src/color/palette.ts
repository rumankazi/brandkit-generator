import type { ResolvedConfig } from "../config/schema.js";
import { contrast, oklchToHex, parseToOklch } from "./oklch.js";

/**
 * Palette derivation. From a primary (and optional accent/secondary) we build
 * perceptually-even OKLCH tonal ramps (50→950), then map ramp steps to semantic
 * tokens for light and dark, auditing every fg/bg pairing against WCAG AA.
 */

export const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
export type Step = (typeof STEPS)[number];
export type Ramp = Record<Step, string>;

type NumberRamp = Record<Step, number>;

// Target OKLCH lightness per step — even perceptual spacing, near-white → near-black.
const L: NumberRamp = {
  50: 0.971, 100: 0.936, 200: 0.885, 300: 0.808, 400: 0.704, 500: 0.616,
  600: 0.532, 700: 0.452, 800: 0.372, 900: 0.297, 950: 0.232,
};

// Chroma multiplier per step — peaks mid, tapers at the extremes so tints/shades
// don't look muddy or oversaturated.
const CHROMA: NumberRamp = {
  50: 0.3, 100: 0.42, 200: 0.6, 300: 0.8, 400: 0.95, 500: 1.0,
  600: 0.98, 700: 0.9, 800: 0.78, 900: 0.62, 950: 0.48,
};

// Near-neutral chroma per step — a subtle brand-hue tint, not a pure gray.
const NEUTRAL_CHROMA: NumberRamp = {
  50: 0.004, 100: 0.006, 200: 0.008, 300: 0.01, 400: 0.012, 500: 0.014,
  600: 0.014, 700: 0.014, 800: 0.012, 900: 0.01, 950: 0.008,
};

/** Ramp step → hex, in fixed 50→950 order. Central accessor so ramp indexing
 * stays in one place (satisfies noUncheckedIndexedAccess for callers). */
export function rampEntries(r: Ramp): Array<[Step, string]> {
  return STEPS.map((s) => [s, r[s]] as [Step, string]);
}

function at(r: Ramp, s: Step): string {
  return r[s]!;
}

function buildRamp(base: string): Ramp {
  const b = parseToOklch(base);
  const out = {} as Ramp;
  for (const s of STEPS) out[s] = oklchToHex({ l: L[s], c: b.c * CHROMA[s], h: b.h });
  return out;
}

function buildNeutralRamp(hue: number): Ramp {
  const out = {} as Ramp;
  for (const s of STEPS) out[s] = oklchToHex({ l: L[s], c: NEUTRAL_CHROMA[s], h: hue });
  return out;
}

export interface Palette {
  primary: Ramp;
  accent: Ramp;
  neutral: Ramp;
}

export interface SemanticTokens {
  [k: string]: string;
  bg: string;
  surface: string;
  fg: string;
  "muted-fg": string;
  border: string;
  ring: string;
  primary: string;
  "primary-fg": string;
  accent: string;
  "accent-fg": string;
}
export interface ThemeTokens {
  light: SemanticTokens;
  dark: SemanticTokens;
}

export interface AuditRow {
  theme: "light" | "dark";
  pair: string;
  fg: string;
  bg: string;
  ratio: number;
  required: number;
  pass: boolean;
}

export interface PaletteResult {
  palette: Palette;
  themes: ThemeTokens;
  audit: AuditRow[];
  hasAccent: boolean;
}

/** Pick the near-white or near-black neutral that best contrasts a background. */
function pickForeground(bg: string, neutral: Ramp, required: number) {
  const lightFg = at(neutral, 50);
  const darkFg = at(neutral, 950);
  const rLight = contrast(lightFg, bg);
  const rDark = contrast(darkFg, bg);
  const useLight = rLight >= rDark;
  const hex = useLight ? lightFg : darkFg;
  const ratio = Math.max(rLight, rDark);
  return { hex, ratio, pass: ratio >= required };
}

/**
 * Choose a solid brand-color step (for buttons/fills) that keeps its label
 * legible: walk candidate steps in brand-preference order and take the first
 * whose best foreground meets the target; fall back to the best available.
 * This is the auto-nudge — the token adapts so the label always passes if it can.
 */
function pickSolid(ramp: Ramp, candidates: Step[], neutral: Ramp, required: number) {
  let best: { bg: string; fg: string; ratio: number } | null = null;
  for (const s of candidates) {
    const bg = at(ramp, s);
    const fg = pickForeground(bg, neutral, required);
    const option = { bg, fg: fg.hex, ratio: fg.ratio };
    if (fg.pass) return option;
    if (!best || fg.ratio > best.ratio) best = option;
  }
  return best!;
}

/** Apply user-supplied exact semantic values (e.g. brand bg/ink/accent) on top
 * of the derived tokens, then recompute the dependent label foregrounds so
 * contrast stays correct. If accent is pinned without an explicit primary, the
 * primary + focus ring mirror it so the system uses one coherent brand color. */
function applyOverrides(t: SemanticTokens, ov: Record<string, string> | undefined, neutral: Ramp, required: number): void {
  if (!ov) return;
  for (const [k, v] of Object.entries(ov)) t[k] = v;
  if (ov.accent && !ov.primary) {
    t.primary = ov.accent;
    t.ring = ov.accent;
  }
  t["accent-fg"] = pickForeground(t.accent, neutral, required).hex;
  t["primary-fg"] = pickForeground(t.primary, neutral, required).hex;
}

export function buildPalette(cfg: ResolvedConfig): PaletteResult {
  const primaryOklch = parseToOklch(cfg.color.primary);
  const accentSource = cfg.color.accent ?? cfg.color.secondary;
  const hasAccent = Boolean(accentSource);

  const palette: Palette = {
    primary: buildRamp(cfg.color.primary),
    accent: buildRamp(accentSource ?? cfg.color.primary),
    neutral: buildNeutralRamp(primaryOklch.h),
  };

  const required = cfg.palette.contrast === "AAA" ? 7 : 4.5;
  const n = palette.neutral;

  const lightPrimary = pickSolid(palette.primary, [600, 700, 500], n, required);
  const lightAccent = pickSolid(palette.accent, [600, 700, 500], n, required);
  const light: SemanticTokens = {
    bg: "#ffffff",
    surface: at(n, 100),
    fg: at(n, 900),
    "muted-fg": at(n, 600),
    border: at(n, 200),
    ring: at(palette.primary, 500),
    primary: lightPrimary.bg,
    "primary-fg": lightPrimary.fg,
    accent: lightAccent.bg,
    "accent-fg": lightAccent.fg,
  };

  const darkPrimary = pickSolid(palette.primary, [500, 600, 400], n, required);
  const darkAccent = pickSolid(palette.accent, [500, 600, 400], n, required);
  const dark: SemanticTokens = {
    bg: at(n, 950),
    surface: at(n, 900),
    fg: at(n, 50),
    "muted-fg": at(n, 400),
    border: at(n, 800),
    ring: at(palette.primary, 400),
    primary: darkPrimary.bg,
    "primary-fg": darkPrimary.fg,
    accent: darkAccent.bg,
    "accent-fg": darkAccent.fg,
  };

  applyOverrides(light, cfg.color.light, n, required);
  applyOverrides(dark, cfg.color.dark, n, required);

  const audit = [
    ...auditTheme("light", light, required),
    ...auditTheme("dark", dark, required),
  ];

  return { palette, themes: { light, dark }, audit, hasAccent };
}

// The pairings a real UI depends on: body text, muted text, and primary/accent
// button labels — all 4.5:1 text contrast. Decorative borders/dividers are not
// audited: WCAG's 3:1 applies to essential control boundaries, not subtle lines.
function auditTheme(theme: "light" | "dark", t: SemanticTokens, textReq: number): AuditRow[] {
  const rows: Array<[string, string, string, number]> = [
    ["text on bg", t.fg, t.bg, textReq],
    ["muted text on bg", t["muted-fg"], t.bg, textReq],
    ["text on surface", t.fg, t.surface, textReq],
    ["primary label", t["primary-fg"], t.primary, textReq],
    ["accent label", t["accent-fg"], t.accent, textReq],
  ];
  return rows.map(([pair, fg, bg, required]) => {
    const ratio = contrast(fg, bg);
    return { theme, pair, fg, bg, ratio: Math.round(ratio * 100) / 100, required, pass: ratio >= required };
  });
}
