/**
 * Motion foundation — the logo's animatable CENTERLINE.
 *
 * The mark is built from filled outlines, which cannot be "drawn on" (a
 * dash-offset reveal of a filled path traces its perimeter, not its spine). So
 * we derive the single continuous centerline of the pipe and stroke it at the
 * pipe width. Everything about the mark falls out of one exact grid:
 *
 *   • pipe width      110         (stroke width of the centerline)
 *   • centerlines     55 / 457 / 859   on both axes
 *   • corner radius   145         (centerline radius of every quarter-turn)
 *   • arrowheads      convex, base 110, depth 32, at 4 flow markers
 *
 * The flow is a figure-8 traced as ONE gesture that starts and ends at the
 * bottom — exactly the "arrow draws the logo, loops back to the bottom" idea,
 * and a seamless loop for GIF/animated output. It is drawn in three ordered,
 * color-roled subpaths: NEUTRAL loop (G) → PRIMARY top loop (B) → PRIMARY
 * descender (D). The gray→blue hand-off lands precisely on the middle » marker.
 *
 * This module is pure geometry: exact path data, analytic arc-length, and a
 * point/tangent sampler for placing a traveling arrowhead. No rasterization,
 * no color decisions — callers supply colors (theme accent = primary, theme
 * ink = neutral, matching the duotone mark).
 */

export const PIPE = 110; // stroke width = pipe thickness
export const CORNER_R = 145; // centerline radius of every quarter-turn
export const VIEWBOX = 914; // square canvas, matches the source mark
const ARROW_DEPTH = 32; // apex distance beyond the pipe cross-section
const ARROW_HALF = PIPE / 2; // arrowhead base half-width (= pipe half-width)
const QUARTER = (Math.PI / 2) * CORNER_R; // length of one corner arc

export type Role = "neutral" | "primary";
type Pt = readonly [number, number];

type Seg =
  | { kind: "line"; from: Pt; to: Pt }
  | { kind: "arc"; center: Pt; from: Pt; to: Pt; sweep: 0 | 1 };

/** One drawable stroke of the centerline: an ordered chain of segments. */
export interface Subpath {
  id: "G" | "B" | "D";
  role: Role;
  segs: Seg[];
}

const line = (from: Pt, to: Pt): Seg => ({ kind: "line", from, to });
const arc = (from: Pt, center: Pt, to: Pt, sweep: 0 | 1): Seg => ({ kind: "arc", center, from, to, sweep });

/**
 * The three subpaths, in DRAW order (start at the bottom, end at the bottom).
 * Endpoints sit on the arrowhead bases / flat pipe ends so a butt-cap stroke
 * lands exactly on the real mark; arrowheads (below) extend beyond.
 */
export const SUBPATHS: Subpath[] = [
  // G — neutral loop: bottom-left « marker → down/around → middle » marker.
  {
    id: "G",
    role: "neutral",
    segs: [
      line([260, 859], [200, 859]),
      arc([200, 859], [200, 714], [55, 714], 1),
      line([55, 714], [55, 602]),
      arc([55, 602], [200, 602], [200, 457], 1),
      line([200, 457], [630, 457]),
    ],
  },
  // B — primary top-right loop: middle » marker → around top → flat bowl end.
  {
    id: "B",
    role: "primary",
    segs: [
      line([653, 457], [714, 457]),
      arc([714, 457], [714, 312], [859, 312], 0),
      line([859, 312], [859, 200]),
      arc([859, 200], [714, 200], [714, 55], 0),
      line([714, 55], [602, 55]),
      arc([602, 55], [602, 200], [457, 200], 0),
      line([457, 200], [457, 382]),
    ],
  },
  // D — primary descender: flat stem top → down/around → bottom « marker.
  {
    id: "D",
    role: "primary",
    segs: [
      line([457, 532], [457, 714]),
      arc([457, 714], [312, 714], [311, 859], 1),
      line([311, 859], [283, 859]),
    ],
  },
];

/**
 * Flow markers at the four subpath endpoints. Each junction pairs a convex
 * `point` (the arrowhead) on one ribbon with a concave `notch` on the other
 * that the point aims into — exactly as the source mark is drawn. Points are
 * painted on top; notches are knocked out of the ribbon (see `notchMask`). The
 * two share identical geometry, so a uniform gap between them falls out for free.
 */
export type ArrowKind = "point" | "notch";
export interface Arrowhead {
  role: Role;
  base: Pt; // pipe cross-section center (a subpath endpoint)
  dirDeg: number; // apex direction, degrees (0 = +x/right, 180 = left)
  kind: ArrowKind;
}
export const ARROWHEADS: Arrowhead[] = [
  { role: "neutral", base: [630, 457], dirDeg: 0, kind: "point" }, // » middle, gray head
  { role: "primary", base: [653, 457], dirDeg: 0, kind: "notch" }, // » middle, blue socket
  { role: "primary", base: [283, 859], dirDeg: 180, kind: "point" }, // « bottom, blue head
  { role: "neutral", base: [260, 859], dirDeg: 180, kind: "notch" }, // « bottom, gray socket
];

const segLength = (s: Seg): number =>
  s.kind === "line" ? Math.hypot(s.to[0] - s.from[0], s.to[1] - s.from[1]) : QUARTER;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** SVG path `d` for a chain of segments (M + L/A commands). */
export function segsPath(segs: Seg[]): string {
  const start = segs[0]!.from;
  const cmds = [`M ${start[0]} ${start[1]}`];
  for (const s of segs) {
    if (s.kind === "line") cmds.push(`L ${s.to[0]} ${s.to[1]}`);
    else cmds.push(`A ${CORNER_R} ${CORNER_R} 0 0 ${s.sweep} ${s.to[0]} ${s.to[1]}`);
  }
  return cmds.join(" ");
}

/** Total arc-length of a chain of segments. */
export const segsLength = (segs: Seg[]): number => segs.reduce((n, s) => n + segLength(s), 0);

/** Angle of a point on an arc, relative to its center. */
const ang = (c: Pt, p: Pt) => Math.atan2(p[1] - c[1], p[0] - c[0]);

/** Point + tangent at arc-length `s` along a chain of segments (for the traveling tip). */
export function sampleSegs(segs: Seg[], s: number): { x: number; y: number; angleDeg: number } {
  let acc = 0;
  for (const seg of segs) {
    const len = segLength(seg);
    if (s <= acc + len || seg === segs[segs.length - 1]) {
      const t = len === 0 ? 0 : Math.min(1, Math.max(0, (s - acc) / len));
      if (seg.kind === "line") {
        return {
          x: seg.from[0] + (seg.to[0] - seg.from[0]) * t,
          y: seg.from[1] + (seg.to[1] - seg.from[1]) * t,
          angleDeg: (Math.atan2(seg.to[1] - seg.from[1], seg.to[0] - seg.from[0]) * 180) / Math.PI,
        };
      }
      const a0 = ang(seg.center, seg.from);
      const delta = (seg.sweep ? 1 : -1) * (Math.PI / 2);
      const a = a0 + delta * t;
      // Tangent (travel) direction: +90° from the radius for sweep 1, −90° for sweep 0.
      return {
        x: seg.center[0] + CORNER_R * Math.cos(a),
        y: seg.center[1] + CORNER_R * Math.sin(a),
        angleDeg: ((a * 180) / Math.PI + (seg.sweep ? 90 : -90)) % 360,
      };
    }
    acc += len;
  }
  const end = segs[segs.length - 1]!.to;
  return { x: end[0], y: end[1], angleDeg: 0 };
}

/** SVG path `d` for a subpath. */
export const pathData = (sp: Subpath): string => segsPath(sp.segs);
/** Total arc-length of a subpath. */
export const subpathLength = (sp: Subpath): number => segsLength(sp.segs);
/** Point + tangent at arc-length `s` along a subpath. */
export const sampleSubpath = (sp: Subpath, s: number) => sampleSegs(sp.segs, s);

/**
 * The CONTINUOUS centerline — one unbroken gesture from the bottom, around the
 * whole figure-8, back to the bottom. Unlike the drawn subpaths (G/B/D), this
 * runs straight THROUGH the junction gaps (the » at the middle, the P gap at the
 * center): the gaps live in the artwork, not the path. This is the spine the
 * draw-on animation reveals the artwork along, so the pen never lifts.
 */
const CONTINUOUS_SEGS: Seg[] = [
  line([260, 859], [200, 859]),
  arc([200, 859], [200, 714], [55, 714], 1),
  line([55, 714], [55, 602]),
  arc([55, 602], [200, 602], [200, 457], 1),
  line([200, 457], [714, 457]), // across the middle, through the » gap
  arc([714, 457], [714, 312], [859, 312], 0),
  line([859, 312], [859, 200]),
  arc([859, 200], [714, 200], [714, 55], 0),
  line([714, 55], [602, 55]),
  arc([602, 55], [602, 200], [457, 200], 0),
  line([457, 200], [457, 714]), // down the centre, through the P gap
  arc([457, 714], [312, 714], [311, 859], 1),
  line([311, 859], [250, 859]),
];

/** The continuous centerline as an SVG path `d`. */
export const continuousPath = (): string => segsPath(CONTINUOUS_SEGS);
/** Total length of the continuous centerline. */
export const continuousLength = (): number => segsLength(CONTINUOUS_SEGS);
/** Point + tangent at arc-length `s` along the continuous centerline. */
export const sampleContinuous = (s: number) => sampleSegs(CONTINUOUS_SEGS, s);

/**
 * Arc-length at which the drawn flow crosses from the neutral region (bottom-left
 * loop + middle bar) into the primary region (top loop + descender) — used to
 * flip the traveling pen's colour so it stays legible over each ribbon. It is the
 * point where the middle bar's blue begins (x≈653 along the y=457 run).
 */
export const continuousPrimaryStart = (): number => segsLength(CONTINUOUS_SEGS.slice(0, 4)) + (653 - 200);

const POINT_OVERLAP = 10; // full-width neck sunk into the ribbon to bury the seam

/** A convex arrowhead triangle as an SVG path `d` — the exact source geometry (sockets/masks). */
export function arrowheadPath(base: Pt, dirDeg: number, depth = ARROW_DEPTH, half = ARROW_HALF): string {
  const a = (dirDeg * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const apex: Pt = [base[0] + dx * depth, base[1] + dy * depth];
  const l: Pt = [base[0] - dy * half, base[1] + dx * half];
  const r: Pt = [base[0] + dy * half, base[1] - dx * half];
  return `M ${round2(l[0])} ${round2(l[1])} L ${round2(apex[0])} ${round2(apex[1])} L ${round2(r[0])} ${round2(r[1])} Z`;
}

/**
 * A convex point for painting on top of the ribbon: a full-width neck sunk
 * `overlap` into the ribbon (buries the anti-aliased seam) plus the exact source
 * triangle (base stays on the ribbon end, so the visible shape is unchanged).
 */
export function pointHeadPath(a: Arrowhead, overlap = POINT_OVERLAP): string {
  const rad = (a.dirDeg * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const px = -dy; // perpendicular
  const py = dx;
  const [bx, by] = a.base;
  const nx = bx - dx * overlap; // neck (sunk into the ribbon)
  const ny = by - dy * overlap;
  const ax = bx + dx * ARROW_DEPTH; // apex
  const ay = by + dy * ARROW_DEPTH;
  const P = (x: number, y: number) => `${round2(x)} ${round2(y)}`;
  return `M ${P(nx + px * ARROW_HALF, ny + py * ARROW_HALF)} L ${P(bx + px * ARROW_HALF, by + py * ARROW_HALF)} L ${P(ax, ay)} L ${P(bx - px * ARROW_HALF, by - py * ARROW_HALF)} L ${P(nx - px * ARROW_HALF, ny - py * ARROW_HALF)} Z`;
}

/** Convex arrowheads (painted on top of the ribbon) for a role. */
export const pointHeads = (role: Role): Arrowhead[] => ARROWHEADS.filter((a) => a.role === role && a.kind === "point");

/** Whether a role has any concave sockets to knock out of its ribbon. */
export const hasNotch = (role: Role): boolean => ARROWHEADS.some((a) => a.role === role && a.kind === "notch");

/** A mask that knocks the role's concave sockets out of its ribbon (transparent-bg safe). */
export function notchMask(role: Role, id: string): string {
  const holes = ARROWHEADS.filter((a) => a.role === role && a.kind === "notch")
    .map((a) => `<path d="${arrowheadPath(a.base, a.dirDeg)}" fill="black"/>`)
    .join("");
  if (!holes) return "";
  return `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${VIEWBOX}" height="${VIEWBOX}"><rect width="${VIEWBOX}" height="${VIEWBOX}" fill="white"/>${holes}</mask>`;
}

/** Combined `d` for a color role (may contain multiple M subpaths). */
export function rolePath(role: Role): string {
  return SUBPATHS.filter((s) => s.role === role)
    .map(pathData)
    .join(" ");
}

/** Analytic timing metadata — for constant-speed, seamless-loop animation. */
export interface CenterlineTiming {
  pipe: number;
  cornerRadius: number;
  total: number;
  drawOrder: Array<{ id: Subpath["id"]; role: Role; length: number }>;
}
export function centerlineTiming(): CenterlineTiming {
  const drawOrder = SUBPATHS.map((s) => ({ id: s.id, role: s.role, length: round2(subpathLength(s)) }));
  return {
    pipe: PIPE,
    cornerRadius: CORNER_R,
    total: round2(drawOrder.reduce((n, s) => n + s.length, 0)),
    drawOrder,
  };
}

export interface CenterlineColors {
  primary: string;
  neutral: string;
  background?: string;
}

/**
 * Static centerline mark: the ribbon stroked at pipe width + flow arrowheads.
 * With butt caps this reproduces the source mark exactly. `background` fills
 * the canvas; omit for transparent.
 */
export function renderCenterlineMark(colors: CenterlineColors, opts: { arrows?: boolean } = {}): string {
  const arrows = opts.arrows ?? true;
  const col = (r: Role) => (r === "primary" ? colors.primary : colors.neutral);
  const bg = colors.background ? `<rect width="${VIEWBOX}" height="${VIEWBOX}" fill="${colors.background}"/>` : "";
  const roles: Role[] = ["neutral", "primary"];
  const defs = arrows ? `<defs>${roles.map((r) => notchMask(r, `nm-${r}`)).join("")}</defs>` : "";
  const groups = roles
    .map((r) => {
      const mask = arrows && hasNotch(r) ? ` mask="url(#nm-${r})"` : "";
      const ribbon = `<path d="${rolePath(r)}" fill="none" stroke="${col(r)}" stroke-width="${PIPE}" stroke-linecap="butt" stroke-linejoin="round"/>`;
      const pts = arrows ? pointHeads(r).map((a) => `<path d="${pointHeadPath(a)}" fill="${col(r)}"/>`).join("") : "";
      return `<g${mask}>${ribbon}${pts}</g>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${VIEWBOX}" height="${VIEWBOX}" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}" fill="none">${defs}${bg}${groups}</svg>\n`;
}
