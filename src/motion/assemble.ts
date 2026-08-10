/**
 * Assemble variant — the mark's three pieces spring into place in sequence, then
 * hold and loop. Live CSS SVG (each piece scales about its own centre) + bakeable
 * frames (explicit per-piece centres, since resvg has no transform-box).
 *
 * Tuned values (locked via the assemble tuner): stagger 8%, pop 13%, overshoot
 * 1.00, start 0.55, 4000ms, order forward (ink loop → blue loop → descender).
 */

import { ART_BLUE, ART_INK } from "./bake.js";

const VB = 1024;
const HOLD_END = 86;
const FADE_END = 96;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

// Piece paths + measured bbox centres (for baked per-piece scaling).
const PIECES = [
  { key: "ink", d: ART_INK[0]!, cx: 388, cy: 713, role: "neutral" as const },
  { key: "blue", d: ART_BLUE[1]!, cx: 713, cy: 311, role: "primary" as const },
  { key: "desc", d: ART_BLUE[0]!, cx: 434, cy: 778, role: "primary" as const },
];

export interface AssembleParams {
  primary: string;
  neutral: string;
  background?: string;
  staggerPct?: number; // gap between piece starts
  popPct?: number; // pop duration per piece
  overshoot?: number; // spring past 1 (1.0 = none)
  startScale?: number; // how small each piece starts
  durationMs?: number; // whole loop (assemble + hold + fade)
  order?: "fwd" | "rev";
}
const DEFAULTS = { staggerPct: 8, popPct: 13, overshoot: 1.0, startScale: 0.55, durationMs: 4000, order: "fwd" as const };

const fill = (role: "primary" | "neutral", primary: string, neutral: string) => (role === "primary" ? primary : neutral);

/** Start percent for each piece index given the order. */
function starts(q: Required<Pick<AssembleParams, "staggerPct" | "order">>): number[] {
  const seq = q.order === "rev" ? [2, 1, 0] : [0, 1, 2];
  const s = [0, 0, 0];
  seq.forEach((pieceIdx, i) => (s[pieceIdx] = i * q.staggerPct));
  return s;
}

/** Live CSS assemble SVG. */
export function renderAssemble(params: AssembleParams): string {
  const q = { ...DEFAULTS, ...params };
  const st = starts(q);
  const over = r3(q.overshoot);
  const ss = r3(q.startScale);
  const kfs = PIECES.map((p, i) => {
    const start = st[i]!;
    const mid = Math.min(start + q.popPct * 0.55, 100);
    const end = Math.min(start + q.popPct, 100);
    return `@keyframes asm_${p.key}{0%{opacity:0;transform:scale(${ss})}${start}%{opacity:0;transform:scale(${ss})}${r3(mid)}%{opacity:1;transform:scale(${over})}${r3(end)}%{transform:scale(1)}100%{opacity:1;transform:scale(1)}}`;
  }).join("");
  const anims = PIECES.map((p) => `.${p.key}{animation:asm_${p.key} ${q.durationMs}ms linear infinite;transform-box:fill-box;transform-origin:center}`).join("");
  const body = PIECES.map((p) => `<g class="${p.key}"><path d="${p.d}" fill="${fill(p.role, q.primary, q.neutral)}"/></g>`).join("");
  const bg = q.background ? `<rect width="${VB}" height="${VB}" fill="${q.background}"/>` : "";
  const css = `<style>.grp{animation:asmcyc ${q.durationMs}ms linear infinite}@keyframes asmcyc{0%{opacity:1}${HOLD_END}%{opacity:1}${FADE_END}%{opacity:0}100%{opacity:0}}
    ${anims}${kfs}
    @media(prefers-reduced-motion:reduce){.grp *{animation:none!important}}</style>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${VB}" height="${VB}" viewBox="0 0 ${VB} ${VB}" fill="none">${css}${bg}<g class="grp">${body}</g></svg>\n`;
}

const lerp = (kf: Array<[number, number]>, x: number) => {
  if (x <= kf[0]![0]) return kf[0]![1];
  const last = kf[kf.length - 1]!;
  if (x >= last[0]) return last[1];
  for (let i = 1; i < kf.length; i++) {
    const a = kf[i - 1]!;
    const b = kf[i]!;
    if (x <= b[0]) return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0] || 1);
  }
  return last[1];
};

/** One baked assemble frame at loop fraction f ∈ [0,1). */
export function bakeAssembleFrame(f: number, params: AssembleParams): string {
  const q = { ...DEFAULTS, ...params };
  const p = (((f % 1) + 1) % 1) * 100;
  const st = starts(q);
  const groupOp = lerp([[0, 1], [HOLD_END, 1], [FADE_END, 0], [100, 0]], p);
  const bg = q.background ? `<rect width="${VB}" height="${VB}" fill="${q.background}"/>` : "";
  const body = PIECES.map((pc, i) => {
    const start = st[i]!;
    const mid = Math.min(start + q.popPct * 0.55, 100);
    const end = Math.min(start + q.popPct, 100);
    const op = lerp([[0, 0], [start, 0], [mid, 1], [100, 1]], p);
    const scale = lerp([[0, q.startScale], [start, q.startScale], [mid, q.overshoot], [end, 1], [100, 1]], p);
    const o = r3(op * groupOp);
    if (o <= 0) return "";
    return `<g opacity="${o}" transform="translate(${pc.cx} ${pc.cy}) scale(${r3(scale)}) translate(${-pc.cx} ${-pc.cy})"><path d="${pc.d}" fill="${fill(pc.role, q.primary, q.neutral)}"/></g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${VB}" height="${VB}" viewBox="0 0 ${VB} ${VB}" fill="none">${bg}${body}</svg>\n`;
}

export function bakeAssembleFrames(count: number, params: AssembleParams): string[] {
  return Array.from({ length: count }, (_, i) => bakeAssembleFrame(i / count, params));
}

export const assembleDuration = (params: AssembleParams) => params.durationMs ?? DEFAULTS.durationMs;
