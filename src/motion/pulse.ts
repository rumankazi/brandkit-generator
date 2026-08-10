/**
 * Pulse variant — a calm "breathe": the settled mark gently scales in and out.
 * Live CSS SVG (ease-in-out) + bakeable frames (cosine breathe, visually identical).
 *
 * Tuned values (locked via the pulse tuner): scale 4%, 1500ms, dim 10% at rest.
 */

import { ART_BLUE, ART_INK } from "./bake.js";

const VB = 1024;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export interface PulseParams {
  primary: string;
  neutral: string;
  background?: string;
  scalePct?: number; // how much it grows
  durationMs?: number; // one breath (in + out)
  dimPct?: number; // opacity dip at rest
}
const DEFAULTS = { scalePct: 4, durationMs: 1500, dimPct: 10 };

const artwork = (primary: string, neutral: string) =>
  ART_BLUE.map((d) => `<path d="${d}" fill="${primary}"/>`).join("") + ART_INK.map((d) => `<path d="${d}" fill="${neutral}"/>`).join("");

/** Live CSS pulse SVG. */
export function renderPulse(params: PulseParams): string {
  const q = { ...DEFAULTS, ...params };
  const s = r3(1 + q.scalePct / 100);
  const rest = r3(1 - q.dimPct / 100);
  const bg = q.background ? `<rect width="${VB}" height="${VB}" fill="${q.background}"/>` : "";
  const css = `<style>.breathe{animation:breathe ${q.durationMs}ms ease-in-out infinite;transform-box:view-box;transform-origin:512px 512px}
    @keyframes breathe{0%{transform:scale(1);opacity:${rest}}50%{transform:scale(${s});opacity:1}100%{transform:scale(1);opacity:${rest}}}
    @media(prefers-reduced-motion:reduce){.breathe{animation:none;opacity:1}}</style>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${VB}" height="${VB}" viewBox="0 0 ${VB} ${VB}" fill="none">${css}${bg}<g class="breathe">${artwork(q.primary, q.neutral)}</g></svg>\n`;
}

/** One baked pulse frame at loop fraction f ∈ [0,1) (cosine breathe). */
export function bakePulseFrame(f: number, params: PulseParams): string {
  const q = { ...DEFAULTS, ...params };
  const t = (1 - Math.cos(2 * Math.PI * (((f % 1) + 1) % 1))) / 2; // 0→1→0
  const scale = r3(1 + (q.scalePct / 100) * t);
  const opacity = r3(1 - q.dimPct / 100 + (q.dimPct / 100) * t);
  const bg = q.background ? `<rect width="${VB}" height="${VB}" fill="${q.background}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${VB}" height="${VB}" viewBox="0 0 ${VB} ${VB}" fill="none">${bg}<g opacity="${opacity}" transform="translate(512 512) scale(${scale}) translate(-512 -512)">${artwork(q.primary, q.neutral)}</g></svg>\n`;
}

export function bakePulseFrames(count: number, params: PulseParams): string[] {
  return Array.from({ length: count }, (_, i) => bakePulseFrame(i / count, params));
}

export const pulseDuration = (params: PulseParams) => params.durationMs ?? DEFAULTS.durationMs;
