/**
 * Sticker presets — die-cut stickers: the artwork gets a thick white contour
 * that hugs the mark + wordmark silhouette (the classic laptop-sticker look),
 * on transparent. Sizes are physical (mm) for print at 300 DPI + vector PDF.
 * Add a variant = a new entry here.
 */

export type StickerSource = "mark" | "lockup-h" | "lockup-v";

export interface Sticker {
  name: string;
  use: string;
  source: StickerSource;
  theme: "light" | "dark";
  sizeMm: number; // longest edge of the artwork (excl. the white border)
  borderMm: number; // white contour thickness
}

export const STICKER_DPI = 300;

export const STICKERS: Sticker[] = [
  {
    name: "sticker-mark",
    use: "Die-cut mark · white contour · ~45mm",
    source: "mark", theme: "light", sizeMm: 45, borderMm: 5,
  },
  {
    name: "sticker-lockup",
    use: "Die-cut horizontal lockup · white contour · ~90mm",
    source: "lockup-h", theme: "light", sizeMm: 90, borderMm: 5,
  },
  {
    name: "sticker-lockup-vertical",
    use: "Die-cut vertical lockup · white contour · ~55mm",
    source: "lockup-v", theme: "light", sizeMm: 55, borderMm: 5,
  },
];
