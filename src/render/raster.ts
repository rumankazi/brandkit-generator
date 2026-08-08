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
