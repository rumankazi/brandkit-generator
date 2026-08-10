/**
 * Raster export of the animation — rasterizes baked frames with resvg (once,
 * transparent) and encodes an animated GIF, WebP, and APNG. GIF/WebP via sharp,
 * APNG via upng-js. Deterministic and offline.
 *
 * Each frame is rendered transparent one time, then: GIF is flattened over a
 * matte (GIF has no partial alpha), while WebP and APNG keep the alpha. libvips
 * collapses identical hold frames and extends their delay, so GIF/WebP timing is
 * preserved (within GIF's 10ms granularity); APNG keeps every frame.
 */

import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import UPNG from "upng-js";
import { bakeFrames, REFERENCE_DURATION_MS, type BakeColors } from "./bake.js";

export interface EncodeResult {
  gif: Buffer;
  webp: Buffer;
  apng: Buffer;
}

export interface EncodeFramesOpts {
  width: number;
  durationMs?: number;
  matte?: string; // solid background for the GIF (which lacks partial alpha); default white
}

/** Rasterize transparent SVG frames (one viewBox) and encode GIF + WebP + APNG. */
export async function encodeSvgFrames(frames: string[], opts: EncodeFramesOpts): Promise<EncodeResult> {
  const duration = opts.durationMs ?? REFERENCE_DURATION_MS;
  const matte = opts.matte ?? "#ffffff";
  const raws: Buffer[] = [];
  let height = 0;
  for (const svg of frames) {
    const rendered = new Resvg(svg, { fitTo: { mode: "width", value: opts.width } }).render();
    height = rendered.height;
    raws.push(await sharp(rendered.asPng()).ensureAlpha().raw().toBuffer());
  }
  const n = frames.length;
  const W = opts.width;
  const delay = Array(n).fill(Math.round(duration / n));
  const multi = { raw: { width: W, height: height * n, channels: 4, pageHeight: height } } as const;

  // GIF: flatten each transparent frame over the matte, then assemble.
  const flat = await Promise.all(
    raws.map((rf) => sharp(rf, { raw: { width: W, height, channels: 4 } }).flatten({ background: matte }).ensureAlpha().raw().toBuffer()),
  );
  const [gif, webp] = await Promise.all([
    sharp(Buffer.concat(flat), multi).gif({ loop: 0, delay }).toBuffer(),
    sharp(Buffer.concat(raws), multi).webp({ loop: 0, delay, effort: 4 }).toBuffer(),
  ]);

  // APNG (transparent, near-lossless) via upng-js — quantized to keep size sane.
  const arrs = raws.map((b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  const apng = Buffer.from(UPNG.encode(arrs, W, height, 0, delay));
  return { gif, webp, apng };
}

export interface EncodeOpts {
  size?: number; // output square edge in px (default 480)
  frames?: number; // frames per loop (default 60)
  durationMs?: number;
  matte?: string;
}

/** Bake + encode the standalone mark animation (square). */
export function encodeAnimation(colors: BakeColors, opts: EncodeOpts = {}): Promise<EncodeResult> {
  const size = opts.size ?? 480;
  const n = opts.frames ?? 60;
  return encodeSvgFrames(bakeFrames(n, colors), { width: size, durationMs: opts.durationMs, matte: opts.matte });
}
