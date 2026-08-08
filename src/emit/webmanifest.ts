import type { ThemeTokens } from "../color/palette.js";
import type { ResolvedConfig } from "../config/schema.js";

/**
 * Web-app manifest + a ready-to-paste favicon <head> snippet. These make the
 * generated icon set immediately usable on a real site — the practical payoff of
 * producing the whole favicon/maskable/apple-touch matrix.
 */

export function siteWebmanifest(cfg: ResolvedConfig, themes: ThemeTokens): string {
  const manifest = {
    name: cfg.brand.title,
    short_name: cfg.brand.title,
    icons: [
      { src: "maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "favicon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
    theme_color: themes.light.accent,
    background_color: themes.light.bg,
    display: "standalone",
  };
  return JSON.stringify(manifest, null, 2) + "\n";
}

export function faviconHeadSnippet(cfg: ResolvedConfig, themes: ThemeTokens): string {
  return `<!-- ${cfg.brand.title} — favicons & PWA (paste into <head>; assets live in /apps or your web root) -->
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="${themes.light.bg}" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="${themes.dark.bg}" media="(prefers-color-scheme: dark)">
`;
}
