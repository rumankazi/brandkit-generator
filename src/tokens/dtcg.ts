import { rampEntries, type PaletteResult, type Ramp } from "../color/palette.js";

/**
 * Emit W3C Design Tokens Community Group (DTCG) JSON — the portable source of
 * truth. Every leaf is `{ "$value": "#...", "$type": "color" }`.
 */

type Token = { $value: string; $type: "color" };
type Group = Record<string, Token | Record<string, Token>>;

function rampGroup(ramp: Ramp): Record<string, Token> {
  const g: Record<string, Token> = {};
  for (const [s, hex] of rampEntries(ramp)) g[String(s)] = { $value: hex, $type: "color" };
  return g;
}

function semanticGroup(tokens: Record<string, string>): Record<string, Token> {
  const g: Record<string, Token> = {};
  for (const [k, v] of Object.entries(tokens)) g[k] = { $value: v, $type: "color" };
  return g;
}

export function toDtcg(result: PaletteResult): string {
  const color: Record<string, Group> = {
    brand: rampGroup(result.palette.primary),
    neutral: rampGroup(result.palette.neutral),
  };
  if (result.hasAccent) color.accent = rampGroup(result.palette.accent);

  const doc = {
    color: {
      ...color,
      semantic: {
        light: semanticGroup(result.themes.light),
        dark: semanticGroup(result.themes.dark),
      },
    },
  };
  return JSON.stringify(doc, null, 2) + "\n";
}
