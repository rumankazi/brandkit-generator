import { readFile } from "node:fs/promises";

export interface LoadedLogo {
  svg: string;
  width: number;
  height: number;
}

/** Load an SVG logo and read its intrinsic size from viewBox (or width/height). */
export async function loadLogo(src: string): Promise<LoadedLogo> {
  const svg = await readFile(src, "utf8");

  const vb = svg.match(/viewBox\s*=\s*"([^"]+)"/);
  if (vb && vb[1]) {
    const parts = vb[1].trim().split(/\s+/).map(Number);
    return { svg, width: parts[2] ?? 0, height: parts[3] ?? 0 };
  }

  const w = svg.match(/\bwidth\s*=\s*"([\d.]+)"/);
  const h = svg.match(/\bheight\s*=\s*"([\d.]+)"/);
  return { svg, width: w?.[1] ? Number(w[1]) : 0, height: h?.[1] ? Number(h[1]) : 0 };
}
