/**
 * Frame baker — renders the LOCKED reference animation to static SVG frames so
 * we can raster-export it (GIF/WebP/APNG/Lottie) deterministically with resvg.
 *
 * The live animation ([animated-template.ts]) is CSS and can't be sampled by a
 * headless rasterizer, so this module replicates its timeline exactly: the same
 * eased draw + travel keyframes, the reveal→settle handoff, the settle pulse and
 * the loop fade. Values below mirror the reference @keyframes verbatim; geometry
 * (artwork paths + travel path) mirrors the reference too. One source of timing.
 */

const VB = 1024; // reference canvas
const MASK_STROKE = 134;
const CORNER_R = 145;

type Kf = ReadonlyArray<readonly [number, number]>; // [percent, value]

/** Piecewise-linear interpolation of a keyframe table at percent x. */
function interp(kf: Kf, x: number): number {
  if (x <= kf[0]![0]) return kf[0]![1];
  const last = kf[kf.length - 1]!;
  if (x >= last[0]) return last[1];
  for (let i = 1; i < kf.length; i++) {
    const a = kf[i - 1]!;
    const b = kf[i]!;
    if (x <= b[0]) {
      const t = b[0] === a[0] ? 0 : (x - a[0]) / (b[0] - a[0]);
      return a[1] + (b[1] - a[1]) * t;
    }
  }
  return last[1];
}

// --- Reference @keyframes (verbatim values) --------------------------------
const DRAW: Kf = [
  [0, 2880.6], [1, 2873.0], [2, 2865.3], [3, 2857.7], [4, 2850.0], [5, 2842.2], [6, 2834.2], [7, 2826.0], [8, 2817.2],
  [9, 2807.7], [10, 2797.2], [11, 2785.3], [12, 2771.5], [13, 2755.2], [14, 2735.8], [15, 2712.6], [16, 2684.6],
  [17, 2650.8], [18, 2610.1], [19, 2561.2], [20, 2502.6], [21, 2432.8], [22, 2349.8], [23, 2251.9], [24, 2136.8],
  [25, 2002.3], [26, 1845.7], [27, 1664.4], [28, 1455.3], [29, 1246.2], [30, 1064.9], [31, 908.3], [32, 773.8],
  [33, 658.7], [34, 560.8], [35, 477.8], [36, 408.0], [37, 349.4], [38, 300.5], [39, 259.8], [40, 226.0], [41, 198.0],
  [42, 174.8], [43, 155.4], [44, 139.1], [45, 125.3], [46, 113.4], [47, 102.9], [48, 93.4], [49, 84.6], [50, 76.4],
  [51, 68.4], [52, 60.6], [53, 52.9], [54, 45.3], [55, 37.6], [56, 0], [100, 0],
];
const TRAVEL: Kf = [
  [0, 0], [1, 0], [2, 0.22], [3, 0.488], [4, 0.758], [5, 1.031], [6, 1.311], [7, 1.601], [8, 1.908], [9, 2.241],
  [10, 2.61], [11, 3.028], [12, 3.513], [13, 4.083], [14, 4.762], [15, 5.577], [16, 6.559], [17, 7.744], [18, 9.172],
  [19, 10.888], [20, 12.944], [21, 15.395], [22, 18.304], [23, 21.739], [24, 25.776], [25, 30.496], [26, 35.989],
  [27, 42.35], [28, 49.684], [29, 57.018], [30, 63.38], [31, 68.872], [32, 73.592], [33, 77.629], [34, 81.065],
  [35, 83.974], [36, 86.425], [37, 88.48], [38, 90.197], [39, 91.624], [40, 92.809], [41, 93.791], [42, 94.606],
  [43, 95.285], [44, 95.856], [45, 96.34], [46, 96.759], [47, 97.128], [48, 97.461], [49, 97.768], [50, 98.058],
  [51, 98.337], [52, 98.61], [53, 98.88], [54, 98.965], [100, 98.965],
];
const POP: Kf = [[0, 0.2], [1, 0.77], [2, 1.101], [3, 1.147], [5, 1], [100, 1]];
const SETTLE: Kf = [[0, 1], [56, 1], [58, 1.0112], [60, 1.0168], [62, 1.0167], [64, 1.0125], [66, 1.0067], [68, 1.0019], [70, 1], [100, 1]];
const FINAL: Kf = [[0, 0], [55.8, 0], [56, 1], [100, 1]];
const REVEAL: Kf = [[0, 1], [55.8, 1], [56, 0], [100, 0]];
const CYCLE: Kf = [[0, 1], [88.5, 1], [90.5, 0.85], [92.5, 0.5], [94.5, 0.15], [96.5, 0], [100, 0]];
const PEN_SWITCH = 26.43; // cA(primary) → cS(neutral) boundary
const PEN_SOLID = 50.5; // chevron → solid pen near the end

// --- Reference geometry (1024 space) ---------------------------------------
const TRAVEL_PATH =
  "M313 914.5H255A145 145 0 0 1 110 769V657A145 145 0 0 1 255 512H769A145 145 0 0 0 914 367V255A145 145 0 0 0 769 110H657A145 145 0 0 0 512 255V769A145 145 0 0 1 367 914.5H305";
// By region (matching the real logo): blue on the top-right loop + descender,
// ink on the bottom-left loop + middle bar. (The reference had these swapped.)
const ART_BLUE = [
  "M567 769C567 879.457 477.457 969 367 969H334.016L302.548 914.497L334.589 859H367C416.706 859 457 818.706 457 769V587H567V769Z",
  "M769 55C879.457 55 969 144.543 969 255V367C969 477.457 879.457 567 769 567H712.111L743.549 512.551L711.477 457H769C818.706 457 859 416.706 859 367V255C859 205.294 818.706 165 769 165H657C607.294 165 567 205.294 567 255V437H457V255C457 144.543 546.543 55 657 55H769Z",
];
const ART_INK = [
  "M688.383 457L720.454 512.551L689.018 567H255C205.294 567 165 607.294 165 657V769C165 818.706 205.294 859 255 859H311.494L279.453 914.498L310.921 969H255C144.543 969 55 879.457 55 769V657C55 546.543 144.543 457 255 457H688.383Z",
];

// --- Travel-path sampler (lines + quarter arcs, radius 145) -----------------
type Pt = readonly [number, number];
type Seg = { line: [Pt, Pt] } | { arc: [Pt, Pt]; c: Pt; sweep: 0 | 1 };
const L = (a: Pt, b: Pt): Seg => ({ line: [a, b] });
const A = (a: Pt, b: Pt, c: Pt, sweep: 0 | 1): Seg => ({ arc: [a, b], c, sweep });
const QUARTER = (Math.PI / 2) * CORNER_R;
const TRAVEL_SEGS: Seg[] = [
  L([313, 914.5], [255, 914.5]),
  A([255, 914.5], [110, 769], [255, 769], 1),
  L([110, 769], [110, 657]),
  A([110, 657], [255, 512], [255, 657], 1),
  L([255, 512], [769, 512]),
  A([769, 512], [914, 367], [769, 367], 0),
  L([914, 367], [914, 255]),
  A([914, 255], [769, 110], [769, 255], 0),
  L([769, 110], [657, 110]),
  A([657, 110], [512, 255], [657, 255], 0),
  L([512, 255], [512, 769]),
  A([512, 769], [367, 914.5], [367, 769], 1),
  L([367, 914.5], [305, 914.5]),
];
const segLen = (s: Seg) => ("line" in s ? Math.hypot(s.line[1][0] - s.line[0][0], s.line[1][1] - s.line[0][1]) : QUARTER);
const TRAVEL_LEN = TRAVEL_SEGS.reduce((n, s) => n + segLen(s), 0);

/** Point + tangent (deg) at arc-length `s` along the reference travel path. */
function sampleTravel(s: number): { x: number; y: number; deg: number } {
  let acc = 0;
  for (const seg of TRAVEL_SEGS) {
    const len = segLen(seg);
    if (s <= acc + len || seg === TRAVEL_SEGS[TRAVEL_SEGS.length - 1]) {
      const t = len === 0 ? 0 : Math.min(1, Math.max(0, (s - acc) / len));
      if ("line" in seg) {
        const [a, b] = seg.line;
        return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, deg: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI };
      }
      const [a] = seg.arc;
      const a0 = Math.atan2(a[1] - seg.c[1], a[0] - seg.c[0]);
      const delta = (seg.sweep ? 1 : -1) * (Math.PI / 2);
      const ang = a0 + delta * t;
      return { x: seg.c[0] + CORNER_R * Math.cos(ang), y: seg.c[1] + CORNER_R * Math.sin(ang), deg: (ang * 180) / Math.PI + (seg.sweep ? 90 : -90) };
    }
    acc += len;
  }
  const end = TRAVEL_SEGS[TRAVEL_SEGS.length - 1]!;
  const p = "line" in end ? end.line[1] : end.arc[1];
  return { x: p[0], y: p[1], deg: 0 };
}

export interface BakeColors {
  primary: string;
  neutral: string;
  background?: string; // solid bg for GIF (which has no partial alpha); omit for transparent
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const artwork = (primary: string, neutral: string) =>
  ART_BLUE.map((d) => `<path d="${d}" fill="${primary}"/>`).join("") + ART_INK.map((d) => `<path d="${d}" fill="${neutral}"/>`).join("");
// Pen shapes match the reference depth (32) so the GIF matches the live SVG.
const chevron = "M0 -55 L32 0 L0 55 L9 0 Z";
const solidPen = "M-20 -55 L0 -55 L32 0 L0 55 L-20 55 Z";
const maskTip = "M-20 -55 L32 0 L-20 55 Z";
const RETRACT_START = 52; // pen shrinks into the tip over 52→56% instead of overshooting the settled arrow
const RETRACT_END = 56;
const WEDGE_END = 28; // the start-wedge only hides the descender tip early; after this the tip reveals as it's drawn

/** A single baked frame at cycle fraction `f` ∈ [0,1). */
export function bakeFrame(f: number, colors: BakeColors): string {
  const p = (((f % 1) + 1) % 1) * 100;
  const cyc = r2(interp(CYCLE, p));
  const bg = colors.background ? `<rect width="${VB}" height="${VB}" fill="${colors.background}"/>` : "";
  const art = artwork(colors.primary, colors.neutral);

  const drawing = p < 56;
  const pos = sampleTravel((interp(TRAVEL, p) / 100) * TRAVEL_LEN);
  const place = (inner: string, scale = 1) =>
    `<g transform="translate(${r2(pos.x)} ${r2(pos.y)}) rotate(${r2(pos.deg)}) scale(${r2(scale)})">${inner}</g>`;

  // Mask: reveal stroke + white tip at the travelling head + black start wedge.
  const dash = r2(interp(DRAW, p));
  const pop = interp(POP, p);
  const retract = p < RETRACT_START ? 1 : Math.max(0, 1 - (p - RETRACT_START) / (RETRACT_END - RETRACT_START));
  const penScale = pop * retract; // shrink the leading arrowhead into the tip at the end
  // Mask tip stays full size so the reveal completes (only the visible pen retracts);
  // the start-wedge hides the descender tip only early, then clears so it reveals as drawn.
  const mask =
    `<mask id="bk" maskUnits="userSpaceOnUse" x="0" y="0" width="${VB}" height="${VB}">` +
    `<rect width="${VB}" height="${VB}" fill="black"/>` +
    `<path d="${TRAVEL_PATH}" fill="none" stroke="#fff" stroke-width="${MASK_STROKE}" stroke-linecap="butt" stroke-linejoin="round" stroke-dasharray="2880.6 2880.6" stroke-dashoffset="${dash}"/>` +
    `${drawing ? place(`<path d="${maskTip}" fill="#fff"/>`, pop) : ""}` +
    `${p < WEDGE_END ? `<path d="M336.5 973L297 914.5L336.5 855Z" fill="black"/>` : ""}</mask>`;

  const revOp = r2(interp(REVEAL, p));
  const finOp = r2(interp(FINAL, p));
  const settle = r2(interp(SETTLE, p));
  const revealed = revOp > 0 ? `<g mask="url(#bk)" opacity="${revOp}">${art}</g>` : "";
  const settled = finOp > 0 ? `<g opacity="${finOp}" transform="translate(512 512) scale(${settle}) translate(-512 -512)">${art}</g>` : "";

  // Travelling pen matches the region being drawn: ink over the bottom-left loop
  // + middle bar (early), blue over the top-right loop + descender (later).
  let pen = "";
  if (drawing && penScale > 0.01) {
    const color = p <= PEN_SWITCH ? colors.neutral : colors.primary;
    const shape = p >= PEN_SOLID ? solidPen : chevron;
    pen = place(`<path d="${shape}" fill="${color}"/>`, penScale);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${VB}" height="${VB}" viewBox="0 0 ${VB} ${VB}" fill="none"><defs>${mask}</defs>${bg}<g opacity="${cyc}">${revealed}${settled}${pen}</g></svg>\n`;
}

/** Evenly-spaced baked frames over one full loop. */
export function bakeFrames(count: number, colors: BakeColors): string[] {
  return Array.from({ length: count }, (_, i) => bakeFrame(i / count, colors));
}

/** Reference loop duration (ms) — matches animated-template.ts default. */
export const REFERENCE_DURATION_MS = 3200;
