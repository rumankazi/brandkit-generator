/**
 * Raster export of the animation — bakes the locked reference frames (bake.ts),
 * rasterizes each with resvg, and encodes an animated GIF + WebP via sharp (both
 * already in the stack — no new dependency). Deterministic and offline.
 *
 * GIF has no partial alpha, so frames are baked over a solid theme background;
 * WebP uses the same matte for consistency. libvips collapses identical hold
 * frames and extends their delay, so timing is preserved (within GIF's 10ms
 * granularity).
 */

import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import { bakeFrames, REFERENCE_DURATION_MS, type BakeColors } from "./bake.js";

export interface EncodeOpts {
  size?: number; // output square edge in px (default 480)
  frames?: number; // frames per loop (default 60)
  durationMs?: number; // loop duration (default reference 3200ms)
}

/** Bake + rasterize the animation into an animated GIF and WebP (both looping). */
export async function encodeAnimation(colors: BakeColors, opts: EncodeOpts = {}): Promise<{ gif: Buffer; webp: Buffer }> {
  const size = opts.size ?? 480;
  const n = opts.frames ?? 60;
  const duration = opts.durationMs ?? REFERENCE_DURATION_MS;

  const raws: Buffer[] = [];
  for (const svg of bakeFrames(n, colors)) {
    const png = new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
    raws.push(await sharp(png).ensureAlpha().raw().toBuffer());
  }

  const input = { raw: { width: size, height: size * n, channels: 4, pageHeight: size } } as const;
  const delay = Array(n).fill(Math.round(duration / n));
  const [gif, webp] = await Promise.all([
    sharp(Buffer.concat(raws), input).gif({ loop: 0, delay }).toBuffer(),
    sharp(Buffer.concat(raws), input).webp({ loop: 0, delay, effort: 4 }).toBuffer(),
  ]);
  return { gif, webp };
}
