import type { ThemeTokens } from "../color/palette.js";
import type { BrandArt } from "../surfaces/compose.js";
import { innerSvg, viewBoxOf } from "../svg/util.js";
import type { Sticker } from "./presets.js";

/**
 * Die-cut sticker pieces (all on one shared canvas, so they composite in
 * register): the white `halo` contour, the crisp colour `art`, and a soft
 * `shadow`. The halo is a true morphological dilation (feMorphology preserves
 * thin letter strokes) rounded off with a small blur+threshold. The halo/shadow
 * are cheap to raster at low resolution and are composited under the full-res
 * art by the caller — feMorphology is far too slow at print DPI otherwise.
 */

const r = (n: number) => Math.round(n * 1000) / 1000;

function pickArt(s: Sticker, a: BrandArt): string {
  const dark = s.theme === "dark";
  if (s.source === "lockup-h") return dark ? a.lockups.hDark : a.lockups.hLight;
  if (s.source === "lockup-v") return dark ? a.lockups.vDark : a.lockups.vLight;
  return dark ? a.duotoneDark : a.duotoneLight;
}

// White contour: dilate (preserves thin strokes) → small blur + 0.5 threshold to
// round the square kernel's corners → flood white in the grown shape.
function haloFilter(id: string, border: number): string {
  return (
    `<filter id="${id}" x="-70%" y="-70%" width="240%" height="240%" color-interpolation-filters="sRGB">` +
    `<feMorphology in="SourceAlpha" operator="dilate" radius="${r(border)}" result="d"/>` +
    `<feGaussianBlur in="d" stdDeviation="${r(border * 0.35)}" result="b"/>` +
    `<feComponentTransfer in="b" result="m"><feFuncA type="linear" slope="80" intercept="-40"/></feComponentTransfer>` +
    `<feFlood flood-color="#FFFFFF" result="w"/>` +
    `<feComposite in="w" in2="m" operator="in"/>` +
    `</filter>`
  );
}

function shadowFilter(id: string, border: number): string {
  return (
    `<filter id="${id}" x="-90%" y="-90%" width="280%" height="280%" color-interpolation-filters="sRGB">` +
    `<feMorphology in="SourceAlpha" operator="dilate" radius="${r(border)}" result="d"/>` +
    `<feGaussianBlur in="d" stdDeviation="${r(border * 0.6)}" result="b"/>` +
    `<feOffset in="b" dx="0" dy="${r(border * 0.4)}" result="o"/>` +
    `<feFlood flood-color="#0b1220" flood-opacity="0.3" result="c"/>` +
    `<feComposite in="c" in2="o" operator="in"/>` +
    `</filter>`
  );
}

const doc = (w: number, h: number, vb: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${r(w)}" height="${r(h)}" viewBox="${vb}" fill="none">${body}</svg>\n`;

export interface StickerParts {
  svg: string; // standalone die-cut sticker (halo + art; renders in browsers/resvg)
  haloSvg: string; // white contour only
  artSvg: string; // crisp colour art only
  shadowSvg: string; // soft drop shadow only
  wMm: number;
  hMm: number;
}

export function composeSticker(s: Sticker, art: BrandArt, themes: ThemeTokens): StickerParts {
  const artSvg0 = pickArt(s, art);
  const p = viewBoxOf(artSvg0).split(/\s+/).map(Number);
  const x = p[0] ?? 0;
  const y = p[1] ?? 0;
  const w = p[2] ?? 100;
  const h = p[3] ?? 100;

  const mmPerUnit = s.sizeMm / Math.max(w, h);
  const border = s.borderMm / mmPerUnit; // white contour thickness, art units
  const artInner = innerSvg(artSvg0);

  const pad = border * 1.35;
  const cw = w + 2 * pad;
  const ch = h + 2 * pad;
  const vb = `${r(x - pad)} ${r(y - pad)} ${r(cw)} ${r(ch)}`;

  // Filter ids are namespaced by sticker name so multiple inline SVGs (preview)
  // don't collide in the shared HTML id space.
  const hid = `${s.name}-h`;
  const sid = `${s.name}-s`;
  const haloG = `<defs>${haloFilter(hid, border)}</defs><g filter="url(#${hid})">${artInner}</g>`;

  return {
    svg: doc(cw, ch, vb, `${haloG}${artInner}`),
    haloSvg: doc(cw, ch, vb, haloG),
    artSvg: doc(cw, ch, vb, artInner),
    shadowSvg: doc(cw, ch, vb, `<defs>${shadowFilter(sid, border)}</defs><g filter="url(#${sid})">${artInner}</g>`),
    wMm: cw * mmPerUnit,
    hMm: ch * mmPerUnit,
  };
}
