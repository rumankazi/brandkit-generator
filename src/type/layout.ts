import type { Font } from "./fonts.js";

/**
 * Text → outlined SVG path geometry, with the metrics needed for optical
 * alignment. All output is in a baseline-at-y=0, y-down coordinate space so it
 * drops straight into an SVG with a translate to the baseline.
 */

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
export interface Run {
  d: string;
  width: number;
  bbox: BBox;
}

const EMPTY_BBOX: BBox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

function union(a: BBox, b: BBox): BBox {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/** Lay out one single-weight run; glyphs positioned from `offsetX`, baseline y=0. */
export function runToPaths(font: Font, text: string, fontSize: number, offsetX = 0): Run {
  const s = fontSize / font.unitsPerEm;
  const run = font.layout(text);
  let penX = offsetX;
  const parts: string[] = [];
  let bbox = { ...EMPTY_BBOX };
  for (let i = 0; i < run.glyphs.length; i++) {
    const g = run.glyphs[i]!;
    const pos = run.positions[i]!;
    // Scale to em size and flip Y (font space is y-up, SVG is y-down).
    const tp = g.path.transform(s, 0, 0, -s, penX + pos.xOffset * s, -(pos.yOffset * s));
    const d = tp.toSVG();
    if (d) {
      parts.push(d);
      bbox = union(bbox, tp.bbox); // only outlined glyphs count (skip spaces)
    }
    penX += pos.xAdvance * s;
  }
  return { d: parts.join(" "), width: penX - offsetX, bbox };
}

export interface Wordmark {
  d: string;
  width: number;
  capHeight: number;
  ascent: number;
  descent: number; // positive magnitude
  bbox: BBox; // tight geometric bounds of the outlines
}

/**
 * Two-weight wordmark: the first word (brand name) in the bold face, the rest in
 * the regular face. Metrics come from the bold face (they share em/family).
 */
export function layoutWordmark(bold: Font, regular: Font, text: string, fontSize: number): Wordmark {
  const upm = bold.unitsPerEm;
  const capHeight = (fontSize * bold.capHeight) / upm;
  const ascent = (fontSize * bold.ascent) / upm;
  const descent = (fontSize * Math.abs(bold.descent)) / upm;

  const space = text.indexOf(" ");
  if (space < 0) {
    const r = runToPaths(bold, text, fontSize, 0);
    return { d: r.d, width: r.width, capHeight, ascent, descent, bbox: r.bbox };
  }

  const first = text.slice(0, space);
  const rest = text.slice(space + 1);
  const r1 = runToPaths(bold, first, fontSize, 0);
  const spaceW = runToPaths(bold, " ", fontSize, 0).width;
  const r2 = runToPaths(regular, rest, fontSize, r1.width + spaceW);
  return {
    d: `${r1.d} ${r2.d}`,
    width: r1.width + spaceW + r2.width,
    capHeight,
    ascent,
    descent,
    bbox: union(r1.bbox, r2.bbox),
  };
}
