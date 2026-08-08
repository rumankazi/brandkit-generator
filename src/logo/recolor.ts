/**
 * Deterministic SVG recolor. Remaps `fill` attribute hex values per a
 * source→target map. Aspect ratio and geometry are never touched — recolor only.
 * This is what the color slots drive; the AI analyze step (deferred) would
 * populate the same map automatically.
 */

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Replace `fill="#src"` (either quote style, any case) with the mapped target. */
export function recolorSvg(svg: string, map: Record<string, string>): string {
  let out = svg;
  for (const [from, to] of Object.entries(map)) {
    const re = new RegExp(`(fill\\s*=\\s*["'])${escapeRegExp(from)}(["'])`, "gi");
    out = out.replace(re, `$1${to}$2`);
  }
  return out;
}

/** Map every slotted source fill to a single ink color (monochrome variant). */
export function monoMap(sourceHexes: string[], ink: string): Record<string, string> {
  return Object.fromEntries(sourceHexes.map((h) => [h, ink]));
}
