/**
 * Surface presets — the data-driven catalog of application assets. Adding a new
 * platform (e.g. an X/LinkedIn banner) is a new entry here, never bespoke code.
 * Design rules baked in: small surfaces use the mark only; icons get safe-area
 * padding; banners use the horizontal lockup.
 */

export type Art = "duotone" | "on-accent" | "lockup-h" | "lockup-v";
export type BgKind = "bg" | "surface" | "accent" | "transparent";

export interface Surface {
  name: string;
  use: string; // human-readable intended use (→ manifest)
  w: number;
  h: number;
  art: Art;
  theme: "light" | "dark";
  bg: BgKind;
  pad: number; // padding as a fraction of min(w, h)
  radius?: number; // corner radius in px (icons)
  circleSafe?: boolean; // content fits the inscribed circle (avatars)
  raster: number[]; // widths (px) to rasterize to PNG
  webp?: boolean;
  avif?: boolean;
  ico?: number[]; // sizes bundled into favicon.ico
  group: "icon" | "banner";
}

export const SURFACES: Surface[] = [
  {
    name: "favicon",
    use: "Browser favicon (full mark, white on a rounded accent tile)",
    w: 512, h: 512, art: "on-accent", theme: "light", bg: "accent",
    pad: 0.18, radius: 96, raster: [16, 32, 48, 64, 512], ico: [16, 32, 48], group: "icon",
  },
  {
    name: "apple-touch-icon",
    use: "iOS home-screen icon (rounded, on white)",
    w: 180, h: 180, art: "duotone", theme: "light", bg: "bg",
    pad: 0.18, radius: 40, raster: [180], group: "icon",
  },
  {
    name: "maskable",
    use: "PWA maskable icon (80% safe zone, on accent)",
    w: 512, h: 512, art: "on-accent", theme: "light", bg: "accent",
    pad: 0.2, raster: [192, 512], group: "icon",
  },
  {
    name: "avatar",
    use: "Social avatar (circle-safe, white mark on accent)",
    w: 400, h: 400, art: "on-accent", theme: "light", bg: "accent",
    pad: 0.24, circleSafe: true, raster: [400], webp: true, group: "icon",
  },
  {
    name: "og-card",
    use: "Open Graph / social card (1200×630)",
    w: 1200, h: 630, art: "lockup-h", theme: "light", bg: "bg",
    pad: 0.3, raster: [1200], webp: true, group: "banner",
  },
  {
    name: "header",
    use: "Site / docs header",
    w: 1200, h: 240, art: "lockup-h", theme: "light", bg: "bg",
    pad: 0.34, raster: [1200], group: "banner",
  },
  {
    name: "footer",
    use: "Site / docs footer (on surface)",
    w: 1200, h: 160, art: "lockup-h", theme: "light", bg: "surface",
    pad: 0.36, raster: [1200], group: "banner",
  },
  {
    name: "banner",
    use: "Wide banner (dark theme)",
    w: 1200, h: 320, art: "lockup-h", theme: "dark", bg: "bg",
    pad: 0.34, raster: [1200], group: "banner",
  },
];
