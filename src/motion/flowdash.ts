/**
 * Flow-dash variant — the "always running" CI/CD loop. The finished mark sits
 * static while bright pulses march continuously around the pipe (clipped to the
 * artwork so they respect the logo shape). A seamless infinite loop, no draw or
 * settle. Live CSS SVG + bakeable frames, mirroring the draw-on export path.
 *
 * Tuned values (locked via the flow-dash tuner): 1 pulse, length 8% of the loop,
 * 2400ms per lap, glow 0.60, white shine, forward.
 */

import { ART_BLUE, ART_INK, TRAVEL_PATH } from "./bake.js";

const VB = 1024;
const PATH_LEN = 2850.6; // analytic length of the continuous centerline (1024 space)

export interface FlowDashParams {
  primary: string;
  neutral: string;
  background?: string; // solid matte for GIF; omit for transparent SVG/WebP
  count?: number; // pulses travelling at once
  lenPct?: number; // pulse length as % of the loop
  durationMs?: number; // one lap
  opacity?: number; // glow strength 0..1
  pulseColor?: string; // the highlight
  reverse?: boolean;
}

const DEFAULTS = { count: 1, lenPct: 8, durationMs: 2400, opacity: 0.6, pulseColor: "#ffffff", reverse: false };
const r2 = (n: number) => Math.round(n * 100) / 100;

function resolve(p: FlowDashParams) {
  const q = { ...DEFAULTS, ...p };
  const unit = PATH_LEN / q.count;
  const dash = r2((q.lenPct / 100) * PATH_LEN);
  const gap = r2(Math.max(1, unit - dash));
  return { ...q, unit: r2(unit), dash, gap };
}

const artwork = (primary: string, neutral: string) =>
  ART_BLUE.map((d) => `<path d="${d}" fill="${primary}"/>`).join("") + ART_INK.map((d) => `<path d="${d}" fill="${neutral}"/>`).join("");

const clip = (id: string) =>
  `<clipPath id="${id}">${[...ART_BLUE, ...ART_INK].map((d) => `<path d="${d}"/>`).join("")}</clipPath>`;

const pulseStroke = (q: ReturnType<typeof resolve>, dashoffset: number, extra = "") =>
  `<path d="${TRAVEL_PATH}" fill="none" stroke="${q.pulseColor}" stroke-opacity="${q.opacity}" stroke-width="120" stroke-linecap="round" stroke-dasharray="${q.dash} ${q.gap}" stroke-dashoffset="${dashoffset}"${extra}/>`;

/** Live CSS flow-dash SVG (browsers / preview). */
export function renderFlowDash(params: FlowDashParams): string {
  const q = resolve(params);
  const to = q.reverse ? q.unit : -q.unit;
  const css = `<style>.fd{animation:fd ${q.durationMs}ms linear infinite}@keyframes fd{from{stroke-dashoffset:0}to{stroke-dashoffset:${to}}}@media(prefers-reduced-motion:reduce){.fd{animation:none;opacity:0}}</style>`;
  const bg = q.background ? `<rect width="${VB}" height="${VB}" fill="${q.background}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${VB}" height="${VB}" viewBox="0 0 ${VB} ${VB}" fill="none">${css}<defs>${clip("fd-pipe")}</defs>${bg}${artwork(q.primary, q.neutral)}<g clip-path="url(#fd-pipe)">${pulseStroke(q, 0, ' class="fd"')}</g></svg>\n`;
}

/** One baked flow-dash frame at loop fraction f ∈ [0,1). */
export function bakeFlowDashFrame(f: number, params: FlowDashParams): string {
  const q = resolve(params);
  const p = (((f % 1) + 1) % 1) * (q.reverse ? q.unit : -q.unit);
  const bg = q.background ? `<rect width="${VB}" height="${VB}" fill="${q.background}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${VB}" height="${VB}" viewBox="0 0 ${VB} ${VB}" fill="none"><defs>${clip("fd-pipe")}</defs>${bg}${artwork(q.primary, q.neutral)}<g clip-path="url(#fd-pipe)">${pulseStroke(q, r2(p))}</g></svg>\n`;
}

export function bakeFlowDashFrames(count: number, params: FlowDashParams): string[] {
  return Array.from({ length: count }, (_, i) => bakeFlowDashFrame(i / count, params));
}

/** Loop duration for the flow-dash (ms). */
export const flowDashDuration = (params: FlowDashParams) => params.durationMs ?? DEFAULTS.durationMs;
