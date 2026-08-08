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
