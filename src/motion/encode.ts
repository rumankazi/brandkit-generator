/**
 * Raster export of the animation — rasterizes baked frames with resvg and encodes
 * an animated GIF + WebP via sharp (both already in the stack — no new dependency).
 * Deterministic and offline.
 *
 * GIF has no partial alpha, so frames are baked over a solid background; WebP uses
 * the same matte. libvips collapses identical hold frames and extends their delay,
 * so timing is preserved (within GIF's 10ms granularity).
 */

import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import { bakeFrames, REFERENCE_DURATION_MS, type BakeColors } from "./bake.js";

export interface EncodeResult {
  gif: Buffer;
  webp: Buffer;
}

/** Rasterize baked SVG frames (all sharing one viewBox) and encode GIF + WebP. */
export async function encodeSvgFrames(frames: string[], opts: { width: number; durationMs?: number }): Promise<EncodeResult> {
  const duration = opts.durationMs ?? REFERENCE_DURATION_MS;
  const raws: Buffer[] = [];
  let height = 0;
  for (const svg of frames) {
    const rendered = new Resvg(svg, { fitTo: { mode: "width", value: opts.width } }).render();
    height = rendered.height;
    raws.push(await sharp(rendered.asPng()).ensureAlpha().raw().toBuffer());
  }
  const n = frames.length;
  const input = { raw: { width: opts.width, height: height * n, channels: 4, pageHeight: height } } as const;
  const delay = Array(n).fill(Math.round(duration / n));
  const [gif, webp] = await Promise.all([
    sharp(Buffer.concat(raws), input).gif({ loop: 0, delay }).toBuffer(),
    sharp(Buffer.concat(raws), input).webp({ loop: 0, delay, effort: 4 }).toBuffer(),
  ]);
  return { gif, webp };
}

export interface EncodeOpts {
  size?: number; // output square edge in px (default 480)
  frames?: number; // frames per loop (default 60)
  durationMs?: number;
}

/** Bake + encode the standalone mark animation (square). */
export function encodeAnimation(colors: BakeColors, opts: EncodeOpts = {}): Promise<EncodeResult> {
  const size = opts.size ?? 480;
  const n = opts.frames ?? 60;
  return encodeSvgFrames(bakeFrames(n, colors), { width: size, durationMs: opts.durationMs });
}
