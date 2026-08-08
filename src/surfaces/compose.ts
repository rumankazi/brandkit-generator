import type { SemanticTokens, ThemeTokens } from "../color/palette.js";
import { innerSvg, viewBoxOf } from "../svg/util.js";
import type { Surface } from "./presets.js";

/**
 * Compose one surface: a themed background plus the chosen art (mark or lockup)
 * fit-centered into the safe content box. Aspect ratio is preserved by nesting
 * the source SVG with preserveAspectRatio="xMidYMid meet" — never stretched.
 */

export interface BrandArt {
  duotoneLight: string;
  duotoneDark: string;
  onAccent: string;
  lockups: { hLight: string; hDark: string; vLight: string; vDark: string };
}

const r = (n: number) => Math.round(n * 100) / 100;

function pickArt(s: Surface, a: BrandArt): string {
  const dark = s.theme === "dark";
  if (s.art === "on-accent") return a.onAccent;
  if (s.art === "lockup-h") return dark ? a.lockups.hDark : a.lockups.hLight;
  if (s.art === "lockup-v") return dark ? a.lockups.vDark : a.lockups.vLight;
  return dark ? a.duotoneDark : a.duotoneLight; // duotone
}

function bgColor(s: Surface, t: SemanticTokens): string | null {
  if (s.bg === "transparent") return null;
  if (s.bg === "surface") return t.surface;
  if (s.bg === "accent") return t.accent;
  return t.bg;
}

export function composeSurface(s: Surface, art: BrandArt, themes: ThemeTokens): string {
  const t = s.theme === "dark" ? themes.dark : themes.light;
  const src = pickArt(s, art);
  const vb = viewBoxOf(src);
  const inner = innerSvg(src);

  const pad = s.pad * Math.min(s.w, s.h);
  const cw = s.w - 2 * pad;
  const ch = s.h - 2 * pad;

  const bg = bgColor(s, t);
  const bgRect = bg
    ? `<rect width="${s.w}" height="${s.h}"${s.radius ? ` rx="${s.radius}"` : ""} fill="${bg}"/>`
    : "";
  const nested = `<svg x="${r(pad)}" y="${r(pad)}" width="${r(cw)}" height="${r(ch)}" viewBox="${vb}" preserveAspectRatio="xMidYMid meet">${inner}</svg>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s.w}" height="${s.h}" viewBox="0 0 ${s.w} ${s.h}" fill="none">${bgRect}${nested}</svg>\n`;
}
