/**
 * SVG path → Lottie shape converter. Lottie stores each path as vertices with
 * in/out bezier tangents (relative to the vertex); this parses an SVG `d`
 * (M/L/H/V/C/A/Z, absolute or relative) into one Lottie shape per subpath.
 * Arcs are converted to cubic beziers. `reconstructPath` goes the other way, so
 * conversions can be validated by round-tripping back to SVG and rendering.
 */

export interface LottieShape {
  i: [number, number][]; // in-tangents, relative to each vertex
  o: [number, number][]; // out-tangents, relative
  v: [number, number][]; // vertices (absolute)
  c: boolean; // closed
}

type Anchor = { v: [number, number]; i: [number, number]; o: [number, number] };

const near = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.01;

/** Arc (SVG endpoint form) → cubic bezier segments [[c1x,c1y,c2x,c2y,x,y], ...]. */
function arcToCubics(x0: number, y0: number, rx: number, ry: number, phiDeg: number, laf: number, sf: number, x: number, y: number): number[][] {
  if (rx === 0 || ry === 0) return [[x0, y0, x, y, x, y]];
  const phi = (phiDeg * Math.PI) / 180;
  const cosP = Math.cos(phi);
  const sinP = Math.sin(phi);
  // Step 1: transform to origin-centred
  const dx = (x0 - x) / 2;
  const dy = (y0 - y) / 2;
  const x1p = cosP * dx + sinP * dy;
  const y1p = -sinP * dx + cosP * dy;
  let rxA = Math.abs(rx);
  let ryA = Math.abs(ry);
  const lambda = (x1p * x1p) / (rxA * rxA) + (y1p * y1p) / (ryA * ryA);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rxA *= s;
    ryA *= s;
  }
  // Step 2: centre
  const sign = laf !== sf ? 1 : -1;
  let num = rxA * rxA * ryA * ryA - rxA * rxA * y1p * y1p - ryA * ryA * x1p * x1p;
  num = Math.max(0, num);
  const den = rxA * rxA * y1p * y1p + ryA * ryA * x1p * x1p;
  const co = sign * Math.sqrt(num / den);
  const cxp = (co * (rxA * y1p)) / ryA;
  const cyp = (co * -(ryA * x1p)) / rxA;
  const cx = cosP * cxp - sinP * cyp + (x0 + x) / 2;
  const cy = sinP * cxp + cosP * cyp + (y0 + y) / 2;
  // Step 3: angles
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    let a = Math.acos(Math.min(1, Math.max(-1, dot / len)));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };
  const theta1 = ang(1, 0, (x1p - cxp) / rxA, (y1p - cyp) / ryA);
  let dTheta = ang((x1p - cxp) / rxA, (y1p - cyp) / ryA, (-x1p - cxp) / rxA, (-y1p - cyp) / ryA);
  if (!sf && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sf && dTheta < 0) dTheta += 2 * Math.PI;
  // Split into <=90deg segments
  const segs = Math.max(1, Math.ceil(Math.abs(dTheta) / (Math.PI / 2)));
  const delta = dTheta / segs;
  const t = (4 / 3) * Math.tan(delta / 4);
  const out: number[][] = [];
  let th = theta1;
  let px = x0;
  let py = y0;
  for (let k = 0; k < segs; k++) {
    const th2 = th + delta;
    const cosT1 = Math.cos(th);
    const sinT1 = Math.sin(th);
    const cosT2 = Math.cos(th2);
    const sinT2 = Math.sin(th2);
    const e2x = cosP * rxA * cosT2 - sinP * ryA * sinT2 + cx;
    const e2y = sinP * rxA * cosT2 + cosP * ryA * sinT2 + cy;
    const d1x = -rxA * cosP * sinT1 - ryA * sinP * cosT1;
    const d1y = -rxA * sinP * sinT1 + ryA * cosP * cosT1;
    const d2x = -rxA * cosP * sinT2 - ryA * sinP * cosT2;
    const d2y = -rxA * sinP * sinT2 + ryA * cosP * cosT2;
    out.push([px + t * d1x, py + t * d1y, e2x - t * d2x, e2y - t * d2y, e2x, e2y]);
    px = e2x;
    py = e2y;
    th = th2;
  }
  return out;
}

/** Convert an SVG path `d` into one Lottie shape per subpath. */
export function pathToLottieShapes(d: string): LottieShape[] {
  const toks = d.match(/[MLHVCSQTAZmlhvcsqtaz]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const shapes: LottieShape[] = [];
  let anchors: Anchor[] = [];
  let cur: [number, number] = [0, 0];
  let startPt: [number, number] = [0, 0];
  let i = 0;
  let cmd = "";

  const push = (v: [number, number]) => anchors.push({ v, i: [0, 0], o: [0, 0] });
  const num = () => parseFloat(toks[i++]!);
  const flush = (closed: boolean) => {
    if (anchors.length === 0) return;
    if (closed && anchors.length > 1 && near(anchors[anchors.length - 1]!.v, anchors[0]!.v)) {
      anchors[0]!.i = anchors[anchors.length - 1]!.i; // move closing in-tangent onto the first vertex
      anchors.pop();
    }
    shapes.push({ i: anchors.map((a) => a.i), o: anchors.map((a) => a.o), v: anchors.map((a) => a.v), c: closed });
    anchors = [];
  };
  const cubic = (c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number) => {
    anchors[anchors.length - 1]!.o = [c1x - cur[0], c1y - cur[1]];
    anchors.push({ v: [x, y], i: [c2x - x, c2y - y], o: [0, 0] });
    cur = [x, y];
  };
  const line = (x: number, y: number) => {
    anchors.push({ v: [x, y], i: [0, 0], o: [0, 0] });
    cur = [x, y];
  };

  while (i < toks.length) {
    const tk = toks[i]!;
    if (/[A-Za-z]/.test(tk)) {
      cmd = tk;
      i++;
    }
    const rel = cmd === cmd.toLowerCase();
    const bx = rel ? cur[0] : 0;
    const by = rel ? cur[1] : 0;
    const C = cmd.toUpperCase();
    if (C === "M") {
      flush(false);
      cur = [num() + bx, num() + by];
      startPt = cur;
      push(cur);
      cmd = rel ? "l" : "L";
    } else if (C === "L") line(num() + bx, num() + by);
    else if (C === "H") line(num() + bx, cur[1]);
    else if (C === "V") line(cur[0], num() + by);
    else if (C === "C") cubic(num() + bx, num() + by, num() + bx, num() + by, num() + bx, num() + by);
    else if (C === "A") {
      const rx = num();
      const ry = num();
      const rot = num();
      const laf = num();
      const sf = num();
      const ex = num() + bx;
      const ey = num() + by;
      for (const seg of arcToCubics(cur[0], cur[1], rx, ry, rot, laf, sf, ex, ey)) cubic(seg[0]!, seg[1]!, seg[2]!, seg[3]!, seg[4]!, seg[5]!);
    } else if (C === "Z") {
      flush(true);
      cur = startPt;
    } else {
      i++; // unsupported (S/Q/T) — skip a number to avoid infinite loop
    }
  }
  flush(false);
  return shapes;
}

/** Reconstruct an SVG path `d` from a Lottie shape (for validation). */
export function reconstructPath(s: LottieShape): string {
  if (s.v.length === 0) return "";
  const n = s.v.length;
  let d = `M ${s.v[0]![0]} ${s.v[0]![1]}`;
  const seg = (a: number, b: number) => {
    const va = s.v[a]!;
    const vb = s.v[b]!;
    const c1 = [va[0] + s.o[a]![0], va[1] + s.o[a]![1]];
    const c2 = [vb[0] + s.i[b]![0], vb[1] + s.i[b]![1]];
    d += ` C ${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${vb[0]} ${vb[1]}`;
  };
  for (let k = 1; k < n; k++) seg(k - 1, k);
  if (s.c) {
    seg(n - 1, 0);
    d += " Z";
  }
  return d;
}
