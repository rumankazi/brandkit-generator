/**
 * Lottie (Bodymovin JSON) builders for the motion variants. Artwork paths are
 * converted to Lottie shapes via lottie-path.ts. Vector, tiny, loops natively.
 *
 * Colours match the logo (blue = top-right loop + descender, ink = bottom-left
 * loop + middle bar). Verified in a browser via the inlined lottie-web preview.
 */

import { ART_BLUE, ART_INK, TRAVEL_PATH } from "./bake.js";
import { pathToLottieShapes } from "./lottie-path.js";

const W = 1024;
const FR = 30;

const rgb01 = (hex: string): [number, number, number, number] => {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255, 1];
};
const EASE = { i: { x: [0.833], y: [0.833] }, o: { x: [0.167], y: [0.167] } };

/** Animated scalar/2D property sampled from fn(t∈[0,1]) at `samples` keyframes. */
function sampled(fn: (t: number) => number[], op: number, samples: number) {
  const k = [];
  for (let s = 0; s <= samples; s++) k.push({ t: Math.round((op * s) / samples), s: fn(s / samples), ...EASE });
  return { a: 1, k };
}
/** Animated property from explicit [frame, value[]] breakpoints (linear-ish). */
function keyed(points: Array<[number, number[]]>) {
  return { a: 1, k: points.map(([t, s]) => ({ t, s, ...EASE })) };
}
const stat = (k: number | number[]) => ({ a: 0, k });

/** A shape group: converted paths sharing one fill colour. */
function group(paths: string[], hex: string) {
  const it: unknown[] = [];
  for (const d of paths) for (const shape of pathToLottieShapes(d)) it.push({ ty: "sh", ks: { a: 0, k: shape } });
  it.push({ ty: "fl", c: stat(rgb01(hex)), o: stat(100), r: 1 });
  it.push({ ty: "tr", p: stat([0, 0]), a: stat([0, 0]), s: stat([100, 100]), r: stat(0), o: stat(100) });
  return { ty: "gr", it };
}

interface LayerKs {
  o: unknown;
  r: unknown;
  p: unknown;
  a: unknown;
  s: unknown;
}
function shapeLayer(ind: number, nm: string, ks: LayerKs, shapes: unknown[], op: number) {
  return { ddd: 0, ind, ty: 4, nm, sr: 1, ks, ao: 0, shapes, ip: 0, op, st: 0, bm: 0 };
}
const doc = (op: number, nm: string, layers: unknown[]) => ({ v: "5.7.4", fr: FR, ip: 0, op, w: W, h: W, nm, ddd: 0, assets: [], layers });

export interface LottieColors {
  primary: string;
  neutral: string;
}

/** Pulse (breathe) — the whole mark scales/dims sinusoidally about its centre. */
export function buildPulseLottie(c: LottieColors, opts: { scalePct?: number; durationMs?: number; dimPct?: number } = {}): string {
  const scalePct = opts.scalePct ?? 4;
  const dimPct = opts.dimPct ?? 10;
  const op = Math.round(((opts.durationMs ?? 1500) / 1000) * FR);
  const wave = (t: number) => (1 - Math.cos(2 * Math.PI * t)) / 2;
  const ks: LayerKs = {
    o: sampled((t) => [100 * (1 - dimPct / 100 + (dimPct / 100) * wave(t))], op, 24),
    r: stat(0),
    p: stat([W / 2, W / 2]),
    a: stat([W / 2, W / 2]),
    s: sampled((t) => { const v = 100 * (1 + (scalePct / 100) * wave(t)); return [v, v]; }, op, 24),
  };
  const shapes = [group(ART_BLUE, c.primary), group(ART_INK, c.neutral)];
  return JSON.stringify(doc(op, "pulse", [shapeLayer(1, "mark", ks, shapes, op)]));
}

// Assemble pieces + measured centres (match assemble.ts).
const PIECES = [
  { nm: "ink", paths: [ART_INK[0]!], center: [388, 713] as [number, number], hex: (c: LottieColors) => c.neutral },
  { nm: "blue", paths: [ART_BLUE[1]!], center: [713, 311] as [number, number], hex: (c: LottieColors) => c.primary },
  { nm: "desc", paths: [ART_BLUE[0]!], center: [434, 778] as [number, number], hex: (c: LottieColors) => c.primary },
];

/** Assemble — pieces spring in (start→1) in sequence about their own centres, then hold + fade. */
export function buildAssembleLottie(
  c: LottieColors,
  opts: { staggerPct?: number; popPct?: number; startScale?: number; durationMs?: number; order?: "fwd" | "rev" } = {},
): string {
  const stagger = opts.staggerPct ?? 8;
  const pop = opts.popPct ?? 13;
  const startScale = (opts.startScale ?? 0.55) * 100;
  const op = Math.round(((opts.durationMs ?? 4000) / 1000) * FR);
  const order = opts.order === "rev" ? [2, 1, 0] : [0, 1, 2];
  const starts = [0, 0, 0];
  order.forEach((pieceIdx, i) => (starts[pieceIdx] = i * stagger));
  const pf = (pct: number) => Math.round((pct / 100) * op); // percent → frame

  const layers = PIECES.map((p, idx) => {
    const start = starts[idx]!;
    const end = start + pop;
    const sK: Array<[number, number[]]> = [
      [0, [startScale, startScale]],
      [pf(start), [startScale, startScale]],
      [pf(end), [100, 100]],
      [op, [100, 100]],
    ];
    const oK: Array<[number, number[]]> = [
      [0, [0]],
      [pf(start), [0]],
      [pf(start + pop * 0.6), [100]],
      [pf(86), [100]],
      [pf(96), [0]],
      [op, [0]],
    ];
    const ks: LayerKs = { o: keyed(oK), r: stat(0), p: stat(p.center), a: stat(p.center), s: keyed(sK) };
    return shapeLayer(idx + 1, p.nm, ks, [group(p.paths, p.hex(c))], op);
  });
  return JSON.stringify(doc(op, "assemble", layers));
}

const PATH_LEN = 2850.6;
const centreKs = (): LayerKs => ({ o: stat(100), r: stat(0), p: stat([W / 2, W / 2]), a: stat([W / 2, W / 2]), s: stat([100, 100]) });
const artworkGroups = (c: LottieColors) => [group(ART_BLUE, c.primary), group(ART_INK, c.neutral)];
const travelShape = () => pathToLottieShapes(TRAVEL_PATH)[0]!;

/** A stroked travel path with optional trim/dash modifiers. lc: 1 butt, 2 round. */
function travelStroke(hex: string, width: number, mods: unknown[], lc = 2) {
  return {
    ty: "gr",
    it: [
      { ty: "sh", ks: { a: 0, k: travelShape() } },
      ...mods,
      { ty: "st", c: stat(rgb01(hex)), o: stat(100), w: stat(width), lc, lj: 2, ml: 4 },
      { ty: "tr", p: stat([0, 0]), a: stat([0, 0]), s: stat([100, 100]), r: stat(0), o: stat(100) },
    ],
  };
}

/** Draw-on — the artwork revealed by a growing trim-path stroke (track matte). */
export function buildDrawOnLottie(c: LottieColors, opts: { durationMs?: number } = {}): string {
  const op = Math.round(((opts.durationMs ?? 3000) / 1000) * FR);
  const drawEnd = Math.round(0.56 * op);
  // Matte: the travel path stroked wide (butt cap — no backward disc at the
  // start), trimmed 0→100% over the draw.
  const trim = { ty: "tm", s: stat(0), e: { a: 1, k: [{ t: 0, s: [0], ...EASE }, { t: drawEnd, s: [100], ...EASE }, { t: op, s: [100], ...EASE }] }, o: stat(0), m: 1 };
  const matte = { ...shapeLayer(1, "reveal-matte", centreKs(), [travelStroke("#ffffff", 134, [trim], 1)], op), td: 1 };
  // Wedge: subtract-mask hiding the descender tip until it arrives (~55%), so the
  // trim start doesn't reveal that point early (mirrors the baker). Apex widened
  // to cover the whole descender base.
  const wedge = {
    inv: false,
    mode: "s",
    pt: { a: 0, k: pathToLottieShapes("M340 979L278 914.5L340 850Z")[0]! },
    o: { a: 1, k: [{ t: 0, s: [100], ...EASE }, { t: Math.round(0.53 * op), s: [100], ...EASE }, { t: Math.round(0.55 * op), s: [0], ...EASE }] },
    x: { a: 0, k: 0 },
    nm: "wedge",
  };
  // Reveal: artwork shown through the matte during the draw, then handed off.
  const reveal = shapeLayer(2, "reveal", { ...centreKs(), o: keyed([[0, [100]], [drawEnd, [100]], [drawEnd + 1, [0]], [op, [0]]]) }, artworkGroups(c), op);
  // Settle: the raw artwork (with arrow tips), appears at draw-end, then fades to loop.
  const settle = shapeLayer(3, "settle", { ...centreKs(), o: keyed([[0, [0]], [drawEnd, [0]], [drawEnd + 1, [100]], [Math.round(0.88 * op), [100]], [Math.round(0.97 * op), [0]], [op, [0]]]) }, artworkGroups(c), op);
  return JSON.stringify(doc(op, "draw-on", [matte, { ...reveal, tt: 1, hasMask: true, masksProperties: [wedge] }, settle]));
}

/** Flow-dash — a pulse (dashed stroke) circulating the pipe, clipped to the artwork. */
export function buildFlowDashLottie(c: LottieColors, opts: { durationMs?: number; lenPct?: number } = {}): string {
  const op = Math.round(((opts.durationMs ?? 2400) / 1000) * FR);
  const dash = (opts.lenPct ?? 8) / 100 * PATH_LEN;
  const dashes = [
    { n: "d", nm: "dash", v: stat(dash) },
    { n: "g", nm: "gap", v: stat(PATH_LEN - dash) },
    { n: "o", nm: "offset", v: { a: 1, k: [{ t: 0, s: [0], ...EASE }, { t: op, s: [-PATH_LEN], ...EASE }] } },
  ];
  const pulseStroke = {
    ty: "gr",
    it: [
      { ty: "sh", ks: { a: 0, k: travelShape() } },
      { ty: "st", c: stat([1, 1, 1, 1]), o: stat(60), w: stat(120), lc: 2, lj: 2, ml: 4, d: dashes },
      { ty: "tr", p: stat([0, 0]), a: stat([0, 0]), s: stat([100, 100]), r: stat(0), o: stat(100) },
    ],
  };
  // matte = artwork; content = pulse (clipped to artwork); plus static artwork behind.
  const matte = { ...shapeLayer(1, "pipe-matte", centreKs(), artworkGroups(c), op), td: 1 };
  const pulse = { ...shapeLayer(2, "pulse", centreKs(), [pulseStroke], op), tt: 1 };
  const base = shapeLayer(3, "mark", centreKs(), artworkGroups(c), op);
  return JSON.stringify(doc(op, "flow-dash", [matte, pulse, base]));
}
