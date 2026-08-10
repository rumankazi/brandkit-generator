/** Shared SVG helpers for nesting/compositing generated SVGs. */

/** Inner markup of an <svg> (drops the outer wrapper so it can be nested). */
export function innerSvg(svg: string): string {
  const open = svg.indexOf("<svg");
  const gt = svg.indexOf(">", open);
  const close = svg.lastIndexOf("</svg>");
  return svg.slice(gt + 1, close).trim();
}

/** The viewBox of an <svg>, falling back to its width/height, else 0 0 100 100. */
export function viewBoxOf(svg: string): string {
  const vb = svg.match(/viewBox\s*=\s*"([^"]+)"/);
  if (vb && vb[1]) return vb[1].trim();
  const w = svg.match(/\bwidth\s*=\s*"([\d.]+)"/);
  const h = svg.match(/\bheight\s*=\s*"([\d.]+)"/);
  return `0 0 ${w?.[1] ?? 100} ${h?.[1] ?? 100}`;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Expand an SVG's viewBox by `pad` on all sides (bakes in clear-space padding).
 * Content coordinates are unchanged; only the frame grows. */
export function padViewBox(svg: string, pad: number): string {
  const p = viewBoxOf(svg).split(/\s+/).map(Number);
  const x = p[0] ?? 0;
  const y = p[1] ?? 0;
  const w = p[2] ?? 100;
  const h = p[3] ?? 100;
  const nw = w + 2 * pad;
  const nh = h + 2 * pad;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${round2(nw)}" height="${round2(nh)}" viewBox="${round2(x - pad)} ${round2(y - pad)} ${round2(nw)} ${round2(nh)}" fill="none">${innerSvg(svg)}</svg>\n`;
}
