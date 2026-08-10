/**
 * Animated lockups — the mark draws on (the locked reference animation), then the
 * wordmark reveals (fade + a small slide), holds, and fades with the loop. Built
 * for horizontal and vertical, both themes, and bakeable to GIF/WebP frames.
 *
 * Layout mirrors src/lockup/build.ts (X = 100 mark units, cap-height alignment).
 * The animated mark lives in the reference's 1024 box with the 914 logo inset by
 * a 55u margin, so we nest it scaled + offset to land the logo exactly where the
 * static mark sits.
 */

import { loadFont } from "../type/fonts.js";
import { layoutWordmark } from "../type/layout.js";
import { renderAnimatedMark } from "./animated-template.js";
import { bakeFrame, REFERENCE_DURATION_MS, type BakeColors } from "./bake.js";

const X = 100;
const MARK_BOX = 1024;
const LOGO = 914;
const MARGIN = 55; // reference logo inset within its 1024 box
const r = (n: number) => Math.round(n * 100) / 100;

export type Orientation = "horizontal" | "vertical";

interface Layout {
  vbX: number;
  vbY: number;
  w: number;
  h: number;
  markX: number;
  markY: number;
  markSize: number; // logo display size (= X)
  wmD: string;
  wordX: number;
  baselineY: number;
}

export interface LockupAnimParams {
  wordmark: string;
  titleFamily: string;
  gapRatio: number;
  logoW: number;
  logoH: number;
  hFontRatio?: number;
  vFontRatio?: number;
}

/** Compute the lockup layout (positions + outlined wordmark) for an orientation. */
export function lockupLayout(p: LockupAnimParams, orientation: Orientation): Layout {
  const bold = loadFont(p.titleFamily, 700);
  const regular = loadFont(p.titleFamily, 400);
  const aspect = p.logoW && p.logoH ? p.logoW / p.logoH : 1;
  const markW = X * aspect;
  const gap = p.gapRatio * X;

  if (orientation === "horizontal") {
    const wm = layoutWordmark(bold, regular, p.wordmark, (p.hFontRatio ?? 0.72) * X);
    const baselineY = X / 2 + wm.capHeight / 2;
    const wordX = markW + gap;
    const w = wordX + wm.width;
    const top = Math.min(0, baselineY - wm.ascent);
    const bottom = Math.max(X, baselineY + wm.descent);
    return { vbX: 0, vbY: top, w, h: bottom - top, markX: 0, markY: 0, markSize: X, wmD: wm.d, wordX, baselineY };
  }
  const wm = layoutWordmark(bold, regular, p.wordmark, (p.vFontRatio ?? 0.34) * X);
  const w = Math.max(markW, wm.width);
  const baselineY = X + gap + wm.capHeight;
  return { vbX: 0, vbY: 0, w, h: baselineY + wm.descent, markX: (w - markW) / 2, markY: 0, markSize: X, wmD: wm.d, wordX: (w - wm.width) / 2, baselineY };
}

/** Nest a full mark SVG (1024 box, 914 logo inset) so its logo lands at (px,py) sized D. */
function nestMark(markSvg: string, px: number, py: number, D: number): string {
  const size = (D * MARK_BOX) / LOGO;
  const off = (MARGIN * D) / LOGO;
  return markSvg.replace(/<svg\b[^>]*?width="\d+"\s+height="\d+"/, (m) =>
    m.replace(/width="\d+"\s+height="\d+"/, `x="${r(px - off)}" y="${r(py - off)}" width="${r(size)}" height="${r(size)}"`),
  );
}

// Wordmark reveal timeline (percent of the loop): appears after the mark's draw
// (~56%), holds, then fades with the loop (matching the mark's cycle fade).
const WM_APPEAR = 56;
const WM_IN = 66;
const WM_SLIDE = 10; // lockup units the wordmark slides in from

const svgOpen = (l: Layout) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${r(l.w)}" height="${r(l.h)}" viewBox="${r(l.vbX)} ${r(l.vbY)} ${r(l.w)} ${r(l.h)}" fill="none">`;
const slideAxis = (o: Orientation) => (o === "horizontal" ? `${WM_SLIDE}px,0` : `0,${WM_SLIDE}px`);

export interface LockupColors {
  primary: string;
  neutral: string;
  ink: string; // wordmark colour (= theme foreground)
}

/** Live CSS animated lockup SVG. */
export function renderAnimatedLockup(l: Layout, colors: LockupColors, o: Orientation, durationMs = REFERENCE_DURATION_MS): string {
  const mark = nestMark(renderAnimatedMark({ primary: colors.primary, neutral: colors.neutral, durationMs }), l.markX, l.markY, l.markSize);
  const css = `<style>
    @keyframes lk_wm{0%{opacity:0;transform:translate(${slideAxis(o)})}${WM_APPEAR}%{opacity:0;transform:translate(${slideAxis(o)})}${WM_IN}%{opacity:1;transform:translate(0,0)}88.5%{opacity:1;transform:translate(0,0)}96.5%{opacity:0;transform:translate(0,0)}100%{opacity:0}}
    .lk_wm{animation:lk_wm ${durationMs}ms linear infinite;transform-box:fill-box}
    @media (prefers-reduced-motion:reduce){.lk_wm{animation:none;opacity:1;transform:none}}
  </style>`;
  const word = `<g transform="translate(${r(l.wordX)} ${r(l.baselineY)})"><g class="lk_wm"><path d="${l.wmD}" fill="${colors.ink}"/></g></g>`;
  return `${svgOpen(l)}${css}${mark}${word}</svg>\n`;
}

const interpStep = (p: number, a: number, b: number) => (p <= a ? 0 : p >= b ? 1 : (p - a) / (b - a));
const cycleFade = (p: number) => (p <= 88.5 ? 1 : p >= 96.5 ? 0 : 1 - (p - 88.5) / 8);

/** One baked lockup frame at cycle fraction f (static SVG, for GIF/WebP/APNG export). */
export function bakeLockupFrame(f: number, l: Layout, colors: LockupColors, o: Orientation, background?: string): string {
  const p = (((f % 1) + 1) % 1) * 100;
  const markColors: BakeColors = { primary: colors.primary, neutral: colors.neutral };
  const mark = nestMark(bakeFrame(f, markColors), l.markX, l.markY, l.markSize);
  const reveal = interpStep(p, WM_APPEAR, WM_IN);
  const wmOp = r(reveal * cycleFade(p));
  const slide = (1 - reveal) * WM_SLIDE;
  const dx = o === "horizontal" ? slide : 0;
  const dy = o === "horizontal" ? 0 : slide;
  const word = wmOp > 0 ? `<g transform="translate(${r(l.wordX + dx)} ${r(l.baselineY + dy)})" opacity="${wmOp}"><path d="${l.wmD}" fill="${colors.ink}"/></g>` : "";
  const bg = background ? `<rect x="${r(l.vbX)}" y="${r(l.vbY)}" width="${r(l.w)}" height="${r(l.h)}" fill="${background}"/>` : "";
  return `${svgOpen(l)}${bg}${mark}${word}</svg>\n`;
}

export function bakeLockupFrames(count: number, l: Layout, colors: LockupColors, o: Orientation, background?: string): string[] {
  return Array.from({ length: count }, (_, i) => bakeLockupFrame(i / count, l, colors, o, background));
}
