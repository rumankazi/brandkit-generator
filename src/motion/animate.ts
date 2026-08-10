/**
 * Motion — the master "draw-on" animation, built on the centerline foundation.
 *
 * Technique (mirrors the approved reference): the REAL artwork is revealed
 * through a growing mask. The mask is the continuous centerline stroked wide,
 * dash-drawn from the bottom around the whole figure-8 and back, with a white
 * arrowhead riding the tip so the leading edge is always arrow-shaped. Because
 * the flow arrowheads are baked into the artwork being revealed (not painted on
 * a separate clock), the junction arrows appear exactly as the tip passes — no
 * lag. A coloured pen chevron rides the tip; at draw-end the frame swaps to the
 * raw artwork so the settle is pixel-exact, then fades for a seamless loop.
 *
 * Two coordinated outputs share ONE timing model:
 *   • frameAt(progress, art) — an analytic static SVG at a cycle position in
 *     [0,1); the source of truth for GIF/APNG/Lottie export via resvg.
 *   • renderAnimatedMark(art) — the same timeline as CSS keyframes for browsers.
 */

import {
  PIPE,
  VIEWBOX,
  continuousLength,
  continuousPath,
  continuousPrimaryStart,
  sampleContinuous,
} from "./centerline.js";

/** Cycle phases as fractions of the full loop: draw → hold → fade, +short fade-in. */
export const PHASES = { fadeIn: 0.03, drawEnd: 0.72, holdEnd: 0.9 } as const;

const MASK_STROKE = PIPE + 24; // wider than the pipe so the artwork reveals cleanly
const MASK_TIP = { neck: 20, depth: 46, half: PIPE / 2 }; // white arrowhead in the mask
const PEN = { depth: 46, notch: 16, half: PIPE / 2 }; // visible coloured pen chevron
// Black wedge at the start: the bottom start and the blue descender point sit
// side by side, so without this the growing edge bleeds into that point. The
// raw-artwork settle reveals the point properly at the end.
const START_WEDGE = "M281.5 918 L242 859.5 L281.5 800 Z";

const round2 = (n: number) => Math.round(n * 100) / 100;
const wrap = (p: number) => ((p % 1) + 1) % 1;

/** The recolored artwork to reveal, plus the pen colours (per theme). */
export interface AnimatedArt {
  artInner: string; // inner markup of the recolored duotone mark (914 viewBox)
  primary: string;
  neutral: string;
}

/** Group opacity over the cycle: fade in, hold, fade out (seamless loop). */
export function cycleOpacity(p: number): number {
  if (p < PHASES.fadeIn) return p / PHASES.fadeIn;
  if (p < PHASES.holdEnd) return 1;
  return Math.max(0, (1 - p) / (1 - PHASES.holdEnd));
}

/** How far the draw has progressed (0..1) at cycle position p. */
export const drawProgress = (p: number): number => (p <= PHASES.drawEnd ? p / PHASES.drawEnd : 1);

/** The white arrowhead placed in the mask so the revealed edge is arrow-shaped. */
const maskTip = () => `M ${-MASK_TIP.neck} ${-MASK_TIP.half} L ${MASK_TIP.depth} 0 L ${-MASK_TIP.neck} ${MASK_TIP.half} Z`;
/** The visible pen chevron (notched arrow) pointing +x. */
const penChevron = () => `M 0 ${-PEN.half} L ${PEN.depth} 0 L 0 ${PEN.half} L ${PEN.notch} 0 Z`;

const svgOpen = (bg: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${VIEWBOX}" height="${VIEWBOX}" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}" fill="none">${bg}`;

/**
 * Analytic static frame at cycle position `progress` ∈ [0,1). Reveals `art`
 * through a growing mask (resvg-friendly — no CSS). At/after draw-end the frame
 * is the raw artwork, so the settle is pixel-exact.
 */
export function frameAt(progress: number, art: AnimatedArt, opts: { background?: string } = {}): string {
  const p = wrap(progress);
  const dp = drawProgress(p);
  const groupOp = round2(cycleOpacity(p));
  const bg = opts.background ? `<rect width="${VIEWBOX}" height="${VIEWBOX}" fill="${opts.background}"/>` : "";

  // Settled / holding: the exact artwork (no mask composite).
  if (dp >= 1) return `${svgOpen(bg)}<g opacity="${groupOp}">${art.artInner}</g></svg>\n`;

  const L = continuousLength();
  const drawn = L * dp;
  const s = sampleContinuous(drawn);
  const at = (inner: string) => `<g transform="translate(${round2(s.x)} ${round2(s.y)}) rotate(${round2(s.angleDeg)})">${inner}</g>`;

  const mask =
    `<mask id="ptrev" maskUnits="userSpaceOnUse" x="0" y="0" width="${VIEWBOX}" height="${VIEWBOX}">` +
    `<rect width="${VIEWBOX}" height="${VIEWBOX}" fill="black"/>` +
    `<path d="${continuousPath()}" fill="none" stroke="#fff" stroke-width="${MASK_STROKE}" stroke-linecap="butt" stroke-linejoin="round" stroke-dasharray="${round2(drawn)} ${round2(L + 2)}"/>` +
    `${at(`<path d="${maskTip()}" fill="#fff"/>`)}` +
    `<path d="${START_WEDGE}" fill="black"/></mask>`;

  const revealed = `<g mask="url(#ptrev)">${art.artInner}</g>`;
  // Pen colour stays legible over whichever region it's crossing.
  const penColor = drawn < continuousPrimaryStart() ? art.primary : art.neutral;
  const pen = dp > 0 ? at(`<path d="${penChevron()}" fill="${penColor}"/>`) : "";

  return `${svgOpen(bg)}<defs>${mask}</defs><g opacity="${groupOp}">${revealed}${pen}</g></svg>\n`;
}

/** Evenly-spaced frames over one full cycle (for GIF/APNG/Lottie export). */
export function frames(count: number, art: AnimatedArt, opts?: { background?: string }): string[] {
  return Array.from({ length: count }, (_, i) => frameAt(i / count, art, opts));
}

// NOTE: the LIVE animated SVG is produced by ../motion/animated-template.ts
// (the approved reference, colour-substituted). frameAt() below stays as the
// analytic frame source for the future GIF/APNG/Lottie export path — the one
// output we can verify headlessly with resvg.
