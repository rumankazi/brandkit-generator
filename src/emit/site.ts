import type { SemanticTokens } from "../color/palette.js";
import type { PreviewFonts } from "../preview/palette-preview.js";

/**
 * The public brand-kit site (`index.html`) — a downloadable gallery of every
 * generated asset, published to GitHub Pages. Unlike `preview.html` (the inward
 * colour/QA surface), this is the outward "browse + download" hub.
 *
 * It is generated, never authored: the section model is derived from
 * `manifest.json` so the site can never drift from the assets on disk. Files
 * that belong to one logical asset (e.g. a lockup's SVG + PNG + @2x + PDF) are
 * merged into a single card with one download button per available format.
 */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

interface AppEntry {
  file: string;
  width: number;
  height: number;
  use: string;
}
interface StickerEntry {
  file: string;
  use: string;
}

/** The subset of `manifest.json` the site reads. */
export interface SiteManifest {
  docs: string[];
  tokens: string[];
  logo: string[];
  lockups: string[];
  diagram: string;
  motion: {
    centerline: string[];
    animated: string[];
    lockups: string[];
    variants: string[];
    lottie: string[];
    raster: string[];
  };
  print: string[];
  primitivesRaster: string[];
  apps: AppEntry[];
  stickers: StickerEntry[];
}

export interface SiteOpts {
  brandTitle: string;
  subtitle?: string;
  repoUrl?: string;
  fonts: PreviewFonts;
  themes: { light: SemanticTokens; dark: SemanticTokens };
  heroLight: string; // animated horizontal lockup (light) — inlined for the hero
  heroDark: string; // animated horizontal lockup (dark)
}

// Sections in display order. Each maps to a zip-by-directory bundle.
const SECTIONS = [
  { id: "logo", title: "Logo & marks", blurb: "Recoloured mark variants and the wordmark — the core identity.", zip: "logo.zip" },
  { id: "lockups", title: "Lockups", blurb: "Cap-height-aligned mark + wordmark combinations, plus clear-space diagram.", zip: "logo.zip" },
  { id: "motion", title: "Motion", blurb: "Animated marks & lockups — live SVG and Lottie, for launches and loaders.", zip: "logo.zip" },
  { id: "apps", title: "Applications", blurb: "Drop-in surfaces: favicons, avatar, OG card, headers, banners, social.", zip: "apps.zip" },
  { id: "stickers", title: "Stickers", blurb: "Print-ready die-cut assets — vector PDF + transparent 300 dpi PNG.", zip: "stickers.zip" },
  { id: "tokens", title: "Tokens", blurb: "Design tokens for code: DTCG JSON and a Tailwind theme.", zip: "tokens.zip" },
  { id: "docs", title: "Docs & guidelines", blurb: "Generated brand guidelines, colour spec, and the colour-QA preview.", zip: null },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

// Curated, human labels for the logo/lockup/motion/token/doc bases (apps &
// stickers carry their own `use` strings from the manifest). Falls back to a
// filename humaniser for anything not listed.
const LABELS: Record<string, string> = {
  "logo/mark-mono": "Mark · mono (currentColor)",
  "logo/mark-duotone-light": "Mark · duotone · light",
  "logo/mark-duotone-dark": "Mark · duotone · dark",
  "logo/mark-on-accent": "Mark · white knockout (on accent)",
  "logo/logo-original": "Original logo (as supplied)",
  "logo/wordmark-light": "Wordmark · light",
  "logo/wordmark-dark": "Wordmark · dark",
  "logo/lockup-horizontal-light": "Horizontal lockup · light",
  "logo/lockup-horizontal-dark": "Horizontal lockup · dark",
  "logo/lockup-vertical-light": "Vertical lockup · light",
  "logo/lockup-vertical-dark": "Vertical lockup · dark",
  "logo/lockup-horizontal-mono-black": "Horizontal lockup · mono black",
  "logo/lockup-horizontal-mono-white": "Horizontal lockup · mono white",
  "logo/lockup-horizontal-light-clearspace": "Horizontal lockup · light · clear-space padded",
  "logo/lockup-horizontal-dark-clearspace": "Horizontal lockup · dark · clear-space padded",
  "logo/clearspace-diagram": "Clear-space & exclusion-zone diagram",
  "logo/mark-centerline-light": "Centerline mark · light (motion base)",
  "logo/mark-centerline-dark": "Centerline mark · dark (motion base)",
  "logo/mark-centerline-mono": "Centerline mark · mono (motion base)",
  "logo/mark-animated-light": "Draw-on mark · light",
  "logo/mark-animated-dark": "Draw-on mark · dark",
  "logo/lockup-horizontal-animated-light": "Animated horizontal lockup · light",
  "logo/lockup-horizontal-animated-dark": "Animated horizontal lockup · dark",
  "logo/lockup-vertical-animated-light": "Animated vertical lockup · light",
  "logo/lockup-vertical-animated-dark": "Animated vertical lockup · dark",
  "logo/mark-flowdash-light": "Flow-dash mark · light (always running)",
  "logo/mark-flowdash-dark": "Flow-dash mark · dark (always running)",
  "logo/mark-pulse-light": "Pulse mark · light (breathe)",
  "logo/mark-pulse-dark": "Pulse mark · dark (breathe)",
  "logo/mark-assemble-light": "Assemble mark · light (pop-in)",
  "logo/mark-assemble-dark": "Assemble mark · dark (pop-in)",
  "tokens/tokens": "Design tokens · DTCG JSON",
  "tokens/tailwind.theme": "Tailwind theme · CSS",
  "guidelines": "Brand guidelines",
  "brand-spec": "Brand spec · colours",
  "preview": "Colour-system preview (QA)",
  "apps/site.webmanifest": "PWA web-app manifest",
  "apps/favicon-tags": "Favicon <head> snippet",
};

/** Strip extension, retina density, and size suffix so all formats of one asset share a key. */
function baseKey(file: string): string {
  return file
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/@\d+(x|dpi)$/i, "")
    .replace(/-\d+$/i, "");
}

const humanize = (base: string) =>
  base
    .replace(/^.*\//, "")
    .replace(/[-_.]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

const EXT_LABEL: Record<string, string> = {
  svg: "SVG",
  png: "PNG",
  webp: "WebP",
  avif: "AVIF",
  pdf: "PDF",
  ico: "ICO",
  json: "Lottie",
  gif: "GIF",
  apng: "APNG",
  css: "CSS",
  md: "Markdown",
  html: "HTML",
  webmanifest: "Manifest",
};

const PREVIEW_ORDER = ["svg", "png", "webp", "gif", "apng"];

function extOf(file: string): string {
  return (file.match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase();
}

/** A short button label per file: format + retina density or explicit pixel size. */
function formatLabel(file: string): string {
  const ext = extOf(file);
  const dens = file.match(/@(\d+)x\.[a-z0-9]+$/i)?.[1];
  const size = file.match(/-(\d+)\.[a-z0-9]+$/i)?.[1];
  let label = EXT_LABEL[ext] ?? ext.toUpperCase();
  if (dens) label += ` @${dens}x`;
  else if (size) label += ` ${size}px`;
  return label;
}

interface Card {
  base: string;
  label: string;
  files: string[]; // every format/density for this asset
  preview: string | null; // best previewable file, or null → glyph
  animated: boolean;
}

/** Which section a base belongs to. First match wins (motion > lockups > logo …). */
function sectionOf(base: string, sets: Record<SectionId, Set<string>>): SectionId | null {
  for (const id of ["apps", "stickers", "motion", "lockups", "logo", "tokens", "docs"] as SectionId[]) {
    if (sets[id].has(base)) return id;
  }
  return null;
}

function buildModel(m: SiteManifest): Record<SectionId, Card[]> {
  // Every file, tagged with the section(s) that claim its base.
  const memberships: Array<[SectionId, string[]]> = [
    ["motion", [...m.motion.centerline, ...m.motion.animated, ...m.motion.lockups, ...m.motion.variants, ...m.motion.lottie, ...m.motion.raster]],
    ["lockups", [...m.lockups, m.diagram]],
    ["logo", m.logo],
    ["apps", m.apps.map((a) => a.file)],
    ["stickers", m.stickers.map((s) => s.file)],
    ["tokens", m.tokens],
    ["docs", m.docs],
  ];
  const sets = Object.fromEntries(SECTIONS.map((s) => [s.id, new Set<string>()])) as Record<SectionId, Set<string>>;
  for (const [id, files] of memberships) for (const f of files) sets[id].add(baseKey(f));

  // Merge every file (including print PDFs + primitive rasters, which have no
  // section of their own) into its base card by filename.
  const allFiles = [
    ...m.logo,
    ...m.lockups,
    m.diagram,
    ...m.motion.centerline,
    ...m.motion.animated,
    ...m.motion.lockups,
    ...m.motion.variants,
    ...m.motion.lottie,
    ...m.motion.raster,
    ...m.print,
    ...m.primitivesRaster,
    ...m.apps.map((a) => a.file),
    ...m.stickers.map((s) => s.file),
    ...m.tokens,
    ...m.docs,
  ];
  const useByBase = new Map<string, string>();
  for (const a of m.apps) useByBase.set(baseKey(a.file), a.use);
  for (const s of m.stickers) useByBase.set(baseKey(s.file), s.use.replace(/ — .*$/, "")); // strip the "— PDF" tail; formats show as buttons

  const cards = new Map<string, Card>();
  for (const file of allFiles) {
    const base = baseKey(file);
    let card = cards.get(base);
    if (!card) {
      const label = LABELS[base] ?? useByBase.get(base) ?? humanize(base);
      card = { base, label, files: [], preview: null, animated: /animated|flowdash|pulse|assemble/.test(base) };
      cards.set(base, card);
    }
    if (!card.files.includes(file)) card.files.push(file);
  }

  // Order the format buttons predictably and choose a preview per card.
  const rank = (f: string) => {
    const i = ["html", "svg", "png", "webp", "avif", "pdf", "ico", "json", "gif", "apng", "css", "md", "webmanifest"].indexOf(extOf(f));
    const dens = Number(f.match(/@(\d+)x\./)?.[1] ?? 1);
    return i * 10 + dens;
  };
  const byId: Record<SectionId, Card[]> = Object.fromEntries(SECTIONS.map((s) => [s.id, [] as Card[]])) as Record<SectionId, Card[]>;
  for (const card of cards.values()) {
    card.files.sort((a, b) => rank(a) - rank(b));
    card.preview =
      PREVIEW_ORDER.map((ext) => card.files.find((f) => extOf(f) === ext && !/@\d+x\./.test(f))).find(Boolean) ?? null;
    const id = sectionOf(card.base, sets);
    if (id) byId[id].push(card);
  }
  return byId;
}

// A neutral checkerboard reads assets with their own background correctly;
// transparent white marks (on-accent / mono-white) need a dark tile to be seen.
const tileClass = (base: string) => (/on-accent|mono-white/.test(base) ? "tile dark" : "tile");

const GLYPH: Record<string, string> = { pdf: "PDF", ico: "ICO", json: "{ }", md: "MD", css: "{ }", html: "&lt;/&gt;", webmanifest: "{ }" };

function cardHtml(c: Card): string {
  const first = c.files[0] ?? "";
  const preview = c.preview
    ? `<img loading="lazy" src="${c.preview}" alt="${esc(c.label)}">`
    : `<span class="glyph">${GLYPH[extOf(first)] ?? extOf(first).toUpperCase()}</span>`;
  const buttons = c.files
    .map((f) =>
      extOf(f) === "html"
        ? `<a class="dl open" href="${f}" target="_blank" rel="noopener">View ↗</a>`
        : `<a class="dl" href="${f}" download title="${esc(f)}">${esc(formatLabel(f))}</a>`,
    )
    .join("");
  const badge = c.animated ? `<span class="anim" title="Animated">▶ live</span>` : "";
  return `<figure class="card" data-name="${esc((c.label + " " + c.base).toLowerCase())}">
      <div class="${tileClass(c.base)}">${preview}${badge}</div>
      <figcaption>${esc(c.label)}</figcaption>
      <div class="dls">${buttons}</div>
    </figure>`;
}

function sectionHtml(def: (typeof SECTIONS)[number], cards: Card[]): string {
  if (!cards.length) return "";
  const zip = def.zip ? `<a class="zip" href="${def.zip}" download>Download ${def.zip}</a>` : "";
  return `<section class="sec" id="sec-${def.id}">
    <div class="sec-head">
      <div>
        <h2>${esc(def.title)} <span class="count">${cards.length}</span></h2>
        <p class="blurb">${esc(def.blurb)}</p>
      </div>
      ${zip}
    </div>
    <div class="grid">${cards.map(cardHtml).join("")}</div>
  </section>`;
}

// A Google Fonts import for the configured trio (network-loaded on the site, like
// preview.html; shipped assets embed outlined glyphs).
function fontsImport(fonts: PreviewFonts): string {
  const fam = (f: { family: string; weight: number }, weights: number[]) =>
    `family=${f.family.replace(/ /g, "+")}:wght@${[...new Set(weights)].sort((a, b) => a - b).join(";")}`;
  return `@import url('https://fonts.googleapis.com/css2?${[fam(fonts.title, [500, 700]), fam(fonts.body, [400, 600]), fam(fonts.mono, [400])].join("&")}&display=swap');`;
}

export function renderSite(m: SiteManifest, opts: SiteOpts): string {
  const model = buildModel(m);
  const totalAssets = Object.values(model).reduce((n, cs) => n + cs.length, 0);
  const totalFiles = Object.values(model).reduce((n, cs) => n + cs.reduce((k, c) => k + c.files.length, 0), 0);
  const formats = new Set<string>();
  for (const cs of Object.values(model)) for (const c of cs) for (const f of c.files) formats.add(extOf(f));

  const { light, dark } = opts.themes;
  const sectionsHtml = SECTIONS.map((def) => sectionHtml(def, model[def.id])).join("\n");
  const repoLink = opts.repoUrl ? `<a class="ghlink" href="${opts.repoUrl}">Source ↗</a>` : "";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.brandTitle)} — Brand Kit</title>
<meta name="description" content="Downloadable brand kit for ${esc(opts.brandTitle)} — logo, lockups, motion, applications, tokens.">
<link rel="icon" href="apps/favicon.svg">
<style>
  ${fontsImport(opts.fonts)}
  :root {
    color-scheme: light dark;
    --bg:#f6f7f9; --fg:#0b1120; --card:#fff; --line:#e2e8f0; --muted:#64748b;
    --accent:${light.accent}; --accent-fg:${light["accent-fg"]};
    --hero-bg:${light.bg}; --hero-fg:${light.fg};
    --tile-a:#e9edf1; --tile-b:#f6f7f9; --tile-dark:${dark.bg};
    --shadow-sm:0 1px 2px rgba(15,23,42,.06),0 2px 6px rgba(15,23,42,.05);
    --shadow-md:0 1px 2px rgba(15,23,42,.05),0 8px 24px rgba(15,23,42,.09);
    --font-heading:'${opts.fonts.title.family}',system-ui,sans-serif;
    --font-body:'${opts.fonts.body.family}',system-ui,sans-serif;
    --font-mono:'${opts.fonts.mono.family}',ui-monospace,"SF Mono",monospace;
  }
  @media (prefers-color-scheme: dark){ :root{
    --bg:#0b1120; --fg:#f8fafc; --card:#111827; --line:#1f2937; --muted:#94a3b8;
    --accent:${dark.accent}; --accent-fg:${dark["accent-fg"]};
    --hero-bg:${dark.bg}; --hero-fg:${dark.fg};
    --tile-a:#0f1526; --tile-b:#131a2c; --tile-dark:${light.bg};
    --shadow-sm:0 1px 2px rgba(0,0,0,.35),0 2px 8px rgba(0,0,0,.4);
    --shadow-md:0 2px 4px rgba(0,0,0,.4),0 12px 32px rgba(0,0,0,.5);
  } }
  * { box-sizing:border-box; }
  body { margin:0; font-family:var(--font-body); font-size:15px; line-height:1.55; background:var(--bg); color:var(--fg); }
  a { color:inherit; }
  .wrap { max-width:1120px; margin:0 auto; padding:0 24px 96px; }
  /* hero */
  .hero { background:var(--hero-bg); color:var(--hero-fg); border-bottom:1px solid var(--line); }
  .hero-in { max-width:1120px; margin:0 auto; padding:56px 24px 48px; }
  .hero .mark { display:block; }
  .hero .mark.light { display:block; } .hero .mark.dark { display:none; }
  @media (prefers-color-scheme: dark){ .hero .mark.light{ display:none; } .hero .mark.dark{ display:block; } }
  .hero .mark svg { height:88px; width:auto; max-width:100%; display:block; }
  .hero h1 { font-family:var(--font-heading); font-size:32px; font-weight:700; letter-spacing:-0.02em; margin:26px 0 6px; }
  .hero .tagline { color:var(--muted); margin:0 0 20px; font-size:16px; }
  .stats { display:flex; flex-wrap:wrap; gap:8px 10px; align-items:center; }
  .stat { font-family:var(--font-mono); font-size:12px; color:var(--muted); border:1px solid var(--line); border-radius:999px; padding:4px 11px; }
  .cta { display:inline-flex; align-items:center; gap:7px; background:var(--accent); color:var(--accent-fg); font-weight:600; font-size:14px; padding:8px 16px; border-radius:9px; text-decoration:none; box-shadow:var(--shadow-sm); }
  .cta:hover { filter:brightness(1.05); }
  .ghlink { font-size:13px; color:var(--muted); text-decoration:none; margin-left:2px; }
  /* toolbar */
  .toolbar { position:sticky; top:0; z-index:5; background:color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter:blur(8px); border-bottom:1px solid var(--line); }
  .toolbar-in { max-width:1120px; margin:0 auto; padding:12px 24px; display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
  .search { flex:1; min-width:200px; font:inherit; font-size:14px; padding:9px 13px; border:1px solid var(--line); border-radius:9px; background:var(--card); color:var(--fg); }
  .search:focus { outline:2px solid var(--accent); outline-offset:1px; }
  .navlinks { display:flex; gap:2px; flex-wrap:wrap; }
  .navlinks a { font-size:12.5px; color:var(--muted); text-decoration:none; padding:6px 9px; border-radius:7px; }
  .navlinks a:hover { color:var(--fg); background:var(--card); }
  /* sections */
  .sec { padding-top:44px; }
  .sec-head { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; margin-bottom:18px; flex-wrap:wrap; }
  h2 { font-family:var(--font-heading); font-size:20px; font-weight:700; letter-spacing:-0.01em; margin:0; }
  h2 .count { font-family:var(--font-mono); font-size:12px; font-weight:400; color:var(--muted); border:1px solid var(--line); border-radius:999px; padding:1px 8px; vertical-align:middle; margin-left:4px; }
  .blurb { color:var(--muted); margin:4px 0 0; font-size:13.5px; max-width:60ch; }
  .zip { flex:none; font-size:13px; font-weight:600; text-decoration:none; color:var(--fg); border:1px solid var(--line); border-radius:9px; padding:8px 14px; background:var(--card); box-shadow:var(--shadow-sm); white-space:nowrap; }
  .zip:hover { border-color:var(--accent); color:var(--accent); }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(230px,1fr)); gap:18px; }
  .card { margin:0; border:1px solid var(--line); border-radius:14px; background:var(--card); box-shadow:var(--shadow-sm); overflow:hidden; display:flex; flex-direction:column; transition:box-shadow .15s, transform .15s; }
  .card:hover { box-shadow:var(--shadow-md); transform:translateY(-2px); }
  .tile { position:relative; min-height:150px; padding:22px; display:flex; align-items:center; justify-content:center; background:repeating-conic-gradient(var(--tile-a) 0% 25%, var(--tile-b) 0% 50%) 50% / 18px 18px; }
  .tile.dark { background:var(--tile-dark); }
  .tile img { max-width:100%; max-height:150px; width:auto; height:auto; display:block; }
  .glyph { font-family:var(--font-mono); font-size:22px; font-weight:700; color:var(--muted); letter-spacing:.02em; }
  .anim { position:absolute; top:10px; right:10px; font-family:var(--font-mono); font-size:10px; font-weight:600; color:var(--accent-fg); background:var(--accent); border-radius:999px; padding:2px 8px; }
  figcaption { font-size:13px; font-weight:600; padding:12px 14px 2px; }
  .dls { display:flex; flex-wrap:wrap; gap:6px; padding:8px 14px 14px; margin-top:auto; }
  .dl { font-family:var(--font-mono); font-size:11px; text-decoration:none; color:var(--fg); border:1px solid var(--line); border-radius:7px; padding:4px 9px; background:var(--bg); }
  .dl:hover { border-color:var(--accent); color:var(--accent); }
  .dl.open { border-color:var(--accent); color:var(--accent); font-weight:600; }
  .dl.open:hover { background:var(--accent); color:var(--accent-fg); }
  .empty { color:var(--muted); font-size:14px; padding:40px 0; text-align:center; display:none; }
  footer { color:var(--muted); font-size:12.5px; text-align:center; padding:40px 24px 0; border-top:1px solid var(--line); margin-top:56px; }
  footer code { font-family:var(--font-mono); }
  @media (max-width:640px){ .hero h1{ font-size:26px; } .hero .mark svg{ height:64px; } }
</style></head>
<body>
  <header class="hero">
    <div class="hero-in">
      <span class="mark light">${opts.heroLight}</span>
      <span class="mark dark">${opts.heroDark}</span>
      <h1>${esc(opts.brandTitle)} — Brand Kit</h1>
      <p class="tagline">${esc(opts.subtitle ?? "Every logo, lockup, application, and token — ready to download.")}</p>
      <div class="stats">
        <a class="cta" href="brandkit-all.zip" download>↓ Download everything</a>
        <span class="stat">${totalAssets} assets</span>
        <span class="stat">${totalFiles} files</span>
        <span class="stat">${[...formats].length} formats</span>
        ${repoLink}
      </div>
    </div>
  </header>

  <nav class="toolbar">
    <div class="toolbar-in">
      <input id="q" class="search" type="search" placeholder="Filter assets by name…" aria-label="Filter assets">
      <div class="navlinks">
        ${SECTIONS.map((s) => `<a href="#sec-${s.id}">${esc(s.title)}</a>`).join("")}
      </div>
    </div>
  </nav>

  <div class="wrap">
    ${sectionsHtml}
    <p class="empty" id="empty">No assets match your filter.</p>
    <footer>
      Generated by <code>brandkit-generator</code> from one config — assets and this page never drift.
      Read the <a href="guidelines.html">brand guidelines</a> · <a href="preview.html">colour preview</a>.
    </footer>
  </div>

  <script>
    (function () {
      var q = document.getElementById('q');
      var cards = Array.prototype.slice.call(document.querySelectorAll('.card'));
      var secs = Array.prototype.slice.call(document.querySelectorAll('.sec'));
      var empty = document.getElementById('empty');
      function apply() {
        var term = q.value.trim().toLowerCase();
        cards.forEach(function (c) {
          c.style.display = !term || c.getAttribute('data-name').indexOf(term) !== -1 ? '' : 'none';
        });
        var anyVisible = false;
        secs.forEach(function (s) {
          var vis = s.querySelectorAll('.card:not([style*="display: none"])').length;
          s.style.display = vis ? '' : 'none';
          if (vis) anyVisible = true;
        });
        empty.style.display = anyVisible ? 'none' : 'block';
      }
      q.addEventListener('input', apply);
    })();
  </script>
</body></html>
`;
}
