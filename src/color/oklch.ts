import { clampChroma, converter, formatHex, wcagContrast } from "culori";

/**
 * Perceptual color core. All palette math is done in OKLCH so lightness steps
 * are perceptually even and hue stays stable across a ramp. sRGB gamut is
 * enforced by reducing chroma (never by naive channel clipping, which shifts hue).
 */

const toOklch = converter("oklch");

export interface Oklch {
  l: number; // 0..1 lightness
  c: number; // chroma
  h: number; // hue degrees
}

export function parseToOklch(input: string): Oklch {
  const c = toOklch(input);
  if (!c) throw new Error(`Invalid color: ${input}`);
  return { l: c.l ?? 0, c: c.c ?? 0, h: Number.isFinite(c.h) ? (c.h as number) : 0 };
}

/** Bring an OKLCH color into sRGB gamut (by lowering chroma) and format as hex. */
export function oklchToHex(o: Oklch): string {
  const inGamut = clampChroma({ mode: "oklch", l: o.l, c: o.c, h: o.h }, "oklch");
  return formatHex(inGamut) ?? "#000000";
}

/** WCAG 2.1 relative contrast ratio between two colors (1..21). */
export function contrast(a: string, b: string): number {
  return wcagContrast(a, b);
}
