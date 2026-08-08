import { rampEntries, type PaletteResult, type Ramp } from "../color/palette.js";

/**
 * Emit a Tailwind v4 `@theme` block for the ramps, plus semantic CSS custom
 * properties that flip between light and dark. Dark is driven by both the
 * `prefers-color-scheme` media query and an explicit `[data-theme]` override,
 * so a manual theme toggle always wins.
 */

function rampVars(prefix: string, ramp: Ramp): string[] {
  return rampEntries(ramp).map(([s, hex]) => `  --color-${prefix}-${s}: ${hex};`);
}

function semanticVars(tokens: Record<string, string>, indent = "  "): string[] {
  return Object.entries(tokens).map(([k, v]) => `${indent}--color-${k}: ${v};`);
}

export function toTailwind(result: PaletteResult): string {
  const theme: string[] = [
    "@theme {",
    ...rampVars("brand", result.palette.primary),
    ...(result.hasAccent ? rampVars("accent", result.palette.accent) : []),
    ...rampVars("neutral", result.palette.neutral),
    "}",
  ];

  const semantic: string[] = [
    "",
    ":root {",
    ...semanticVars(result.themes.light),
    "}",
    "",
    "@media (prefers-color-scheme: dark) {",
    "  :root {",
    ...semanticVars(result.themes.dark, "    "),
    "  }",
    "}",
    "",
    '[data-theme="light"] {',
    ...semanticVars(result.themes.light),
    "}",
    "",
    '[data-theme="dark"] {',
    ...semanticVars(result.themes.dark),
    "}",
    "",
  ];

  return [...theme, ...semantic].join("\n");
}
