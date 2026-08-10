import { Resvg } from "@resvg/resvg-js";
import pngToIco from "png-to-ico";
import sharp from "sharp";

/**
 * Rasterization. Our SVGs use outlined glyphs and plain shapes (no <text>), so
 * resvg needs no font configuration. sharp handles modern formats; png-to-ico
 * bundles the multi-size favicon.
 */

/** Render an SVG to PNG at a target pixel width (height scales to preserve ratio). */
export function svgToPng(svg: string, width: number): Buffer {
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: Math.max(1, Math.round(width)) } });
  return Buffer.from(resvg.render().asPng());
}

export function toWebp(png: Buffer): Promise<Buffer> {
  return sharp(png).webp({ quality: 90 }).toBuffer();
}

export function toAvif(png: Buffer): Promise<Buffer> {
  return sharp(png).avif({ quality: 55 }).toBuffer();
}

export function toIco(pngs: Buffer[]): Promise<Buffer> {
  return pngToIco(pngs);
}

export async function pngSize(png: Buffer): Promise<{ width: number; height: number }> {
  const m = await sharp(png).metadata();
  return { width: m.width ?? 0, height: m.height ?? 0 };
}

/** Resize a PNG to exact dimensions (used to register composite layers). */
export function resizePng(png: Buffer, width: number, height: number): Promise<Buffer> {
  return sharp(png).resize(width, height).png().toBuffer();
}

/** Stack layers (bottom→top) on a transparent or solid-colour canvas. */
export function stackPng(width: number, height: number, layers: Buffer[], bg?: string): Promise<Buffer> {
  const background = bg ?? { r: 0, g: 0, b: 0, alpha: 0 };
  return sharp({ create: { width, height, channels: 4, background } })
    .composite(layers.map((input) => ({ input })))
    .png()
    .toBuffer();
}
