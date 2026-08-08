import * as fontkit from "fontkit";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

// Minimal structural types for the fontkit surface we use — avoids coupling to
// the @types shape and keeps the compiler honest about what we touch.
export interface FKPath {
  transform(a: number, b: number, c: number, d: number, e: number, f: number): FKPath;
  toSVG(): string;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
}
export interface Font {
  unitsPerEm: number;
  capHeight: number;
  ascent: number;
  descent: number;
  layout(text: string): { glyphs: { path: FKPath }[]; positions: { xAdvance: number; xOffset: number; yOffset: number }[] };
}

// Family → @fontsource package. Fonts are bundled as deps so builds are
// deterministic and offline after install (glyphs get outlined, not linked).
const PKG: Record<string, string> = {
  "Space Grotesk": "@fontsource/space-grotesk",
  "IBM Plex Sans": "@fontsource/ibm-plex-sans",
  "JetBrains Mono": "@fontsource/jetbrains-mono",
};

const cache = new Map<string, Font>();

/** Open a bundled Google font (woff2) for a family + weight, cached. */
export function loadFont(family: string, weight: number): Font {
  const key = `${family}:${weight}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const pkg = PKG[family];
  if (!pkg) throw new Error(`No bundled font for "${family}". Add it to the font package map in fonts.ts.`);

  const slug = family.toLowerCase().replace(/ /g, "-");
  const pkgDir = dirname(require.resolve(`${pkg}/package.json`));
  const file = join(pkgDir, "files", `${slug}-latin-${weight}-normal.woff2`);
  const font = fontkit.create(readFileSync(file)) as unknown as Font;
  cache.set(key, font);
  return font;
}
