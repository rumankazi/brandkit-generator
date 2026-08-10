import { innerSvg, viewBoxOf } from "../svg/util.js";
import { loadFont } from "../type/fonts.js";
import { layoutWordmark } from "../type/layout.js";

/**
 * Deterministic lockup SVGs. The mark is nested (preserving aspect ratio) and
 * the wordmark is outlined via fontkit, so the file is self-contained. Alignment
 * is optical: the wordmark's cap-height is centered on the mark (horizontal) or
 * hung a clear gap below it (vertical). All spacing is a ratio of X = mark height.
 */

const X = 100; // mark height in SVG units; everything derives from this
const r = (n: number) => Math.round(n * 100) / 100;

/**
 * Standalone wordmark (logotype) — the text with no mark, outlined and tightly
 * cropped to the glyph bounds. Two-weight: brand name bold, the rest regular.
 */
export function buildWordmark(text: string, titleFamily: string, ink: string): string {
  const bold = loadFont(titleFamily, 700);
  const regular = loadFont(titleFamily, 400);
  const wm = layoutWordmark(bold, regular, text, X);
  const w = wm.bbox.maxX - wm.bbox.minX;
  const h = wm.bbox.maxY - wm.bbox.minY;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${r(w)}" height="${r(h)}" viewBox="${r(wm.bbox.minX)} ${r(wm.bbox.minY)} ${r(w)} ${r(h)}" fill="none"><path d="${wm.d}" fill="${ink}"/></svg>\n`;
}

/**
 * Clear-space diagram: the lockup with a dashed boundary at its tight bounds and
 * faint 0.5·X squares in the four margin corners, visualizing the exclusion zone.
 * Purely geometric (no text), so it rasterizes without fonts.
 */
export function buildClearSpaceDiagram(lockupSvg: string, clearSpaceRatio: number, guide: string, unitFill: string): string {
  const p = viewBoxOf(lockupSvg).split(/\s+/).map(Number);
  const x = p[0] ?? 0;
  const y = p[1] ?? 0;
  const w = p[2] ?? 100;
  const h = p[3] ?? 100;
  const pad = clearSpaceRatio * X; // 0.5 · X exclusion zone
  const nx = x - pad;
  const ny = y - pad;
  const nw = w + 2 * pad;
  const nh = h + 2 * pad;
  const corners = [
    [nx, ny],
    [nx + nw - pad, ny],
    [nx, ny + nh - pad],
    [nx + nw - pad, ny + nh - pad],
  ]
    .map(([sx, sy]) => `<rect x="${r(sx!)}" y="${r(sy!)}" width="${r(pad)}" height="${r(pad)}" fill="${unitFill}" opacity="0.16"/>`)
    .join("");
  const boundary = `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" fill="none" stroke="${guide}" stroke-width="2" stroke-dasharray="7 6"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${r(nw)}" height="${r(nh)}" viewBox="${r(nx)} ${r(ny)} ${r(nw)} ${r(nh)}" fill="none">${corners}${innerSvg(lockupSvg)}${boundary}</svg>\n`;
}

export interface LockupParams {
  markLight: string; // full duotone-light svg
  markDark: string; // full duotone-dark svg
  logoW: number;
  logoH: number;
  inkLight: string;
  inkDark: string;
  wordmark: string;
  titleFamily: string;
  gapRatio: number;
  hFontRatio?: number;
  vFontRatio?: number;
}

export interface Lockups {
  hLight: string;
  hDark: string;
  vLight: string;
  vDark: string;
}

export function buildLockups(p: LockupParams): Lockups {
  const bold = loadFont(p.titleFamily, 700);
  const regular = loadFont(p.titleFamily, 400);
  const aspect = p.logoW && p.logoH ? p.logoW / p.logoH : 1;
  const markW = X * aspect;
  const gap = p.gapRatio * X;
  const hFont = (p.hFontRatio ?? 0.72) * X;
  const vFont = (p.vFontRatio ?? 0.34) * X;

  const svg = (w: number, h: number, y: number, body: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${r(w)}" height="${r(h)}" viewBox="0 ${r(y)} ${r(w)} ${r(h)}" fill="none">${body}</svg>\n`;

  // Place the mark via a group transform (flat SVG — no nested <svg>), so the
  // lockup is a single flat document that rasterizes AND vectorizes to PDF.
  const s = X / (p.logoH || 1);
  const scale = Math.round(s * 1e5) / 1e5;
  const nested = (markInner: string, x: number, y: number) =>
    `<g transform="translate(${r(x)} ${r(y)}) scale(${scale})">${markInner}</g>`;

  const horizontal = (markSvg: string, ink: string) => {
    const inner = innerSvg(markSvg);
    const wm = layoutWordmark(bold, regular, p.wordmark, hFont);
    const baselineY = X / 2 + wm.capHeight / 2; // cap-height centered on mark
    const wordX = markW + gap;
    const w = wordX + wm.width;
    const top = Math.min(0, baselineY - wm.ascent);
    const bottom = Math.max(X, baselineY + wm.descent);
    const body = `${nested(inner, 0, 0)}<path d="${wm.d}" fill="${ink}" transform="translate(${r(wordX)} ${r(baselineY)})"/>`;
    return svg(w, bottom - top, top, body);
  };

  const vertical = (markSvg: string, ink: string) => {
    const inner = innerSvg(markSvg);
    const wm = layoutWordmark(bold, regular, p.wordmark, vFont);
    const w = Math.max(markW, wm.width);
    const markX = (w - markW) / 2;
    const baselineY = X + gap + wm.capHeight; // cap-top a gap below the mark
    const wordX = (w - wm.width) / 2;
    const bottom = baselineY + wm.descent;
    const body = `${nested(inner, markX, 0)}<path d="${wm.d}" fill="${ink}" transform="translate(${r(wordX)} ${r(baselineY)})"/>`;
    return svg(w, bottom, 0, body);
  };

  return {
    hLight: horizontal(p.markLight, p.inkLight),
    hDark: horizontal(p.markDark, p.inkDark),
    vLight: vertical(p.markLight, p.inkLight),
    vDark: vertical(p.markDark, p.inkDark),
  };
}
