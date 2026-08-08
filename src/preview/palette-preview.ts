import { contrast } from "../color/oklch.js";
import { rampEntries, type PaletteResult, type Ramp, type SemanticTokens } from "../color/palette.js";

/**
 * Self-contained palette preview. Renders the tonal ramps and the light + dark
 * semantic tokens side by side, each theme shown in its own colors, plus a
 * live mini-UI sample and the WCAG contrast audit. This is the visual QA surface.
 */

const readable = (bg: string) => (contrast("#ffffff", bg) >= contrast("#0b1120", bg) ? "#ffffff" : "#0b1120");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function rampRow(name: string, ramp: Ramp): string {
  const cells = rampEntries(ramp)
    .map(
      ([s, hex]) => `<div class="swatch" style="background:${hex};color:${readable(hex)}">
        <span class="step">${s}</span><span class="hex">${hex}</span>
      </div>`,
    )
    .join("");
  return `<div class="ramp"><div class="ramp-name">${esc(name)}</div><div class="ramp-cells">${cells}</div></div>`;
}

function tokenSwatches(t: SemanticTokens): string {
  return Object.entries(t)
    .map(
      ([k, v]) =>
        `<div class="token"><span class="chip" style="background:${v}"></span><span class="tk">${esc(k)}</span><span class="tv">${v}</span></div>`,
    )
    .join("");
}

// A small representative UI so the tokens are seen in composition, not isolation.
function uiSample(t: SemanticTokens): string {
  return `<div class="ui" style="background:${t.bg};color:${t.fg}">
      <div class="card" style="background:${t.surface};border:1px solid ${t.border}">
        <div class="ui-title">Aa Heading</div>
        <div class="ui-muted" style="color:${t["muted-fg"]}">Muted supporting copy sits here.</div>
        <div class="ui-actions">
          <span class="btn" style="background:${t.primary};color:${t["primary-fg"]}">Primary</span>
          <span class="btn" style="background:${t.accent};color:${t["accent-fg"]}">Accent</span>
          <span class="btn ghost" style="border:1px solid ${t.border};color:${t.fg}">Ghost</span>
        </div>
      </div>
    </div>`;
}

function themePanel(label: string, t: SemanticTokens): string {
  return `<div class="panel">
      <h3>${label}</h3>
      ${uiSample(t)}
      <div class="tokens">${tokenSwatches(t)}</div>
    </div>`;
}

function auditTable(result: PaletteResult): string {
  const rows = result.audit
    .map((r) => {
      const badge = r.pass ? `<span class="badge ok">PASS</span>` : `<span class="badge warn">WARN</span>`;
      return `<tr>
        <td>${r.theme}</td><td>${esc(r.pair)}</td>
        <td><span class="dot" style="background:${r.fg}"></span><span class="m">${r.fg}</span></td>
        <td><span class="dot" style="background:${r.bg}"></span><span class="m">${r.bg}</span></td>
        <td class="m">${r.ratio.toFixed(2)}:1</td><td class="m">${r.required}:1</td><td>${badge}</td>
      </tr>`;
    })
    .join("");
  return `<table class="audit">
      <thead><tr><th>Theme</th><th>Pairing</th><th>Foreground</th><th>Background</th><th>Ratio</th><th>Req</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table>`;
}

interface FontSpec {
  family: string;
  weight: number;
}
export interface PreviewFonts {
  title: FontSpec;
  body: FontSpec;
  mono: FontSpec;
}

// Build a Google Fonts import for the configured trio. (The preview is a
// convenience QA surface, so it loads fonts over the network; shipped SVG/raster
// assets embed outlined glyphs instead — see the fontkit stage.)
function googleFontsImport(fonts: PreviewFonts): string {
  const fam = (f: FontSpec, weights: number[]) =>
    `family=${f.family.replace(/ /g, "+")}:wght@${[...new Set(weights)].sort((a, b) => a - b).join(";")}`;
  const parts = [
    fam(fonts.title, [500, fonts.title.weight]),
    fam(fonts.body, [400, 600]),
    fam(fonts.mono, [400, fonts.mono.weight]),
  ];
  return `@import url('https://fonts.googleapis.com/css2?${parts.join("&")}&display=swap');`;
}

export interface LogoBundle {
  width: number;
  height: number;
  clearSpaceRatio: number;
  gapRatio: number;
  mono: string; // svg markup, fills = currentColor
  duotoneLight: string; // svg markup, accent P + ink loop (light theme)
  duotoneDark: string; // svg markup, accent P + ink loop (dark theme)
  onAccent: string; // svg markup, white knockout for accent backgrounds
  lockups: { hLight: string; hDark: string; vLight: string; vDark: string };
  wordmark: { light: string; dark: string }; // text-only logotype
}

const inlineMark = (svg: string, heightPx: number, color?: string) =>
  `<span class="markwrap" style="--mh:${heightPx}px${color ? `;color:${color}` : ""}">${svg}</span>`;

const figure = (bg: string, inner: string, label: string) =>
  `<figure class="fig"><div class="tile" style="background:${bg}">${inner}</div><figcaption>${esc(label)}</figcaption></figure>`;

function logoSection(logo: LogoBundle, result: PaletteResult): string {
  const l = result.themes.light;
  const d = result.themes.dark;
  const csPad = Math.round(logo.clearSpaceRatio * 64);
  return `
  <h2>Logo — mark variants</h2>
  <div class="logo-grid">
    ${figure(l.bg, inlineMark(logo.duotoneLight, 64), "Duotone · light")}
    ${figure(d.bg, inlineMark(logo.duotoneDark, 64), "Duotone · dark")}
    ${figure(l.bg, inlineMark(logo.mono, 64, l.fg), "Mono (currentColor) · light")}
    ${figure(d.bg, inlineMark(logo.mono, 64, d.fg), "Mono (currentColor) · dark")}
    ${figure(l.accent, inlineMark(logo.onAccent, 64), "On accent · light")}
    ${figure(d.accent, inlineMark(logo.onAccent, 64), "On accent · dark")}
  </div>

  <h2>Clear space & minimum size</h2>
  <div class="logo-grid">
    ${figure(l.bg, `<span class="clearspace" style="padding:${csPad}px">${inlineMark(logo.duotoneLight, 64)}</span>`, `Exclusion zone = ${logo.clearSpaceRatio}× mark height`)}
    ${figure(l.bg, `<span class="minsizes">${inlineMark(logo.duotoneLight, 48)}${inlineMark(logo.duotoneLight, 32)}${inlineMark(logo.duotoneLight, 24)}</span>`, "Min sizes · 48 / 32 / 24 px")}
  </div>`;
}

function lockupSection(logo: LogoBundle, result: PaletteResult): string {
  const l = result.themes.light;
  const d = result.themes.dark;
  const h = (svg: string) => `<span class="lockmark h">${svg}</span>`;
  const v = (svg: string) => `<span class="lockmark v">${svg}</span>`;
  return `
  <h2>Lockups <span class="tag">outlined SVG · cap-height aligned</span></h2>
  <div class="lock-grid">
    ${figure(l.bg, h(logo.lockups.hLight), "Horizontal · light")}
    ${figure(d.bg, h(logo.lockups.hDark), "Horizontal · dark")}
    ${figure(l.bg, v(logo.lockups.vLight), "Vertical · light")}
    ${figure(d.bg, v(logo.lockups.vDark), "Vertical · dark")}
  </div>

  <h2>Wordmark <span class="tag">text only · no mark</span></h2>
  <div class="lock-grid">
    ${figure(l.bg, h(logo.wordmark.light), "Logotype · light")}
    ${figure(d.bg, h(logo.wordmark.dark), "Logotype · dark")}
  </div>`;
}

export interface AppPreview {
  name: string;
  use: string;
  svg: string;
  w: number;
  h: number;
  group: "icon" | "banner";
}

function appsSection(apps: AppPreview[]): string {
  const card = (a: AppPreview) =>
    `<figure class="fig"><div class="apptile ${a.group}">${a.svg}</div><figcaption>${esc(a.name)} · ${a.w}×${a.h}</figcaption></figure>`;
  const icons = apps.filter((a) => a.group === "icon");
  const banners = apps.filter((a) => a.group === "banner");
  return `
  <h2>Applications <span class="tag">favicon · avatar · og · header/footer/banner</span></h2>
  <div class="apps-icons">${icons.map(card).join("")}</div>
  <div class="apps-banners">${banners.map(card).join("")}</div>`;
}

export function renderPalettePreview(
  result: PaletteResult,
  brandTitle: string,
  fonts: PreviewFonts,
  logo?: LogoBundle,
  apps?: AppPreview[],
): string {
  const ramps = [
    rampRow("brand", result.palette.primary),
    ...(result.hasAccent ? [rampRow("accent", result.palette.accent)] : []),
    rampRow("neutral", result.palette.neutral),
  ].join("");

  const warnings = result.audit.filter((r) => !r.pass).length;
  const auditNote = warnings
    ? `<p class="note warn-note">${warnings} pairing(s) fall short of the WCAG target — see the audit table.</p>`
    : `<p class="note ok-note">All pairings meet the WCAG target.</p>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(brandTitle)} — Brand Kit</title>
<style>
  ${googleFontsImport(fonts)}
  :root {
    color-scheme: light dark;
    --page-bg:#f6f7f9; --page-fg:#0b1120; --card:#fff; --line:#e2e8f0; --muted:#64748b;
    --shadow-sm: 0 1px 2px rgba(15,23,42,.06), 0 2px 6px rgba(15,23,42,.05);
    --shadow-md: 0 1px 2px rgba(15,23,42,.05), 0 8px 24px rgba(15,23,42,.09);
    --font-heading: '${fonts.title.family}', system-ui, sans-serif;
    --font-body: '${fonts.body.family}', system-ui, sans-serif;
    --font-mono: '${fonts.mono.family}', ui-monospace, "SF Mono", monospace;
  }
  @media (prefers-color-scheme: dark){ :root{
    --page-bg:#0b1120; --page-fg:#f8fafc; --card:#111827; --line:#1f2937; --muted:#94a3b8;
    --shadow-sm: 0 1px 2px rgba(0,0,0,.35), 0 2px 8px rgba(0,0,0,.4);
    --shadow-md: 0 2px 4px rgba(0,0,0,.4), 0 12px 32px rgba(0,0,0,.5);
  } }
  * { box-sizing:border-box; }
  body { margin:0; font-family:var(--font-body); font-size:15px; line-height:1.5; background:var(--page-bg); color:var(--page-fg); }
  .wrap { max-width:1040px; margin:0 auto; padding:40px 24px 80px; }
  h1 { font-family:var(--font-heading); font-size:28px; font-weight:700; margin:0 0 4px; letter-spacing:-0.02em; }
  h2 { font-family:var(--font-heading); font-size:13px; font-weight:500; text-transform:uppercase; letter-spacing:0.08em; color:var(--muted); margin:44px 0 14px; }
  h3 { font-family:var(--font-heading); font-size:14px; font-weight:500; margin:0 0 12px; }
  .sub { color:var(--muted); margin:0 0 8px; }
  .note { font-size:13px; border-radius:8px; padding:8px 12px; display:inline-block; }
  .ok-note { background:color-mix(in oklab,#16a34a 15%,transparent); }
  .warn-note { background:color-mix(in oklab,#f59e0b 22%,transparent); }
  .ramp { margin-bottom:14px; }
  .ramp-name { font-size:12px; color:var(--muted); margin-bottom:6px; text-transform:uppercase; letter-spacing:0.06em; }
  .ramp-cells { display:grid; grid-template-columns:repeat(11,1fr); gap:0; border-radius:10px; overflow:hidden; border:1px solid var(--line); box-shadow:var(--shadow-sm); }
  .swatch { aspect-ratio:1/1.15; padding:8px 6px; display:flex; flex-direction:column; justify-content:space-between; font-size:10px; font-family:var(--font-mono); }
  .swatch .step { font-weight:600; }
  .swatch .hex { opacity:.75; font-variant-numeric:tabular-nums; }
  .panels { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
  .panel { border:1px solid var(--line); border-radius:14px; padding:16px; background:var(--card); box-shadow:var(--shadow-md); }
  .ui { border-radius:10px; padding:18px; margin-bottom:14px; }
  .card { border-radius:10px; padding:16px; box-shadow:var(--shadow-md); }
  .ui-title { font-family:var(--font-heading); font-size:18px; font-weight:700; letter-spacing:-0.01em; }
  .ui-muted { font-size:13px; margin-top:4px; }
  .ui-actions { display:flex; gap:8px; margin-top:14px; flex-wrap:wrap; }
  .btn { font-size:13px; font-weight:600; padding:7px 14px; border-radius:8px; box-shadow:var(--shadow-sm); }
  .btn.ghost { background:transparent; box-shadow:none; }
  .tokens { display:grid; grid-template-columns:1fr 1fr; gap:6px 14px; }
  .token { display:flex; align-items:center; gap:8px; font-size:12px; }
  .chip { width:16px; height:16px; border-radius:4px; border:1px solid rgba(128,128,128,.3); flex:none; }
  .tk { flex:1; }
  .tv { color:var(--muted); font-family:var(--font-mono); font-variant-numeric:tabular-nums; }
  .m { font-family:var(--font-mono); font-variant-numeric:tabular-nums; }
  table.audit { width:100%; border-collapse:collapse; font-size:13px; }
  .audit th, .audit td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--line); }
  .audit th { font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); }
  .dot { display:inline-block; width:11px; height:11px; border-radius:3px; margin-right:6px; vertical-align:-1px; border:1px solid rgba(128,128,128,.3); }
  .badge { font-size:11px; font-weight:700; padding:2px 8px; border-radius:999px; }
  .badge.ok { background:#16a34a; color:#fff; }
  .badge.warn { background:#f59e0b; color:#0b1120; }
  /* logo + lockups */
  .markwrap { display:inline-flex; }
  .markwrap svg { height:var(--mh); width:auto; display:block; }
  .fig { margin:0; }
  .fig figcaption { font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:.05em; margin-top:8px; text-align:center; }
  .tile { border:1px solid var(--line); border-radius:12px; min-height:132px; padding:22px; display:flex; align-items:center; justify-content:center; box-shadow:var(--shadow-sm); }
  .logo-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
  .lock-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:16px; }
  .clearspace { border:1.5px dashed color-mix(in oklab,#0969DA 45%,transparent); border-radius:8px; display:inline-flex; }
  .minsizes { display:inline-flex; align-items:flex-end; gap:18px; }
  .lockup { display:inline-flex; }
  .lockup.h { align-items:center; }
  .lockup.v { flex-direction:column; align-items:center; text-align:center; }
  .lockmark svg { display:block; width:auto; }
  .lockmark.h svg { height:46px; }
  .lockmark.v svg { height:104px; }
  .tag { font-family:var(--font-mono); font-size:10px; font-weight:400; text-transform:none; letter-spacing:0; color:var(--muted); border:1px solid var(--line); border-radius:6px; padding:2px 7px; margin-left:8px; vertical-align:middle; }
  /* applications */
  .apps-icons { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-bottom:16px; }
  .apps-banners { display:grid; grid-template-columns:1fr; gap:16px; }
  .apptile { border:1px solid var(--line); border-radius:12px; overflow:hidden; box-shadow:var(--shadow-sm); display:flex; align-items:center; justify-content:center; background:repeating-conic-gradient(#e9edf1 0% 25%, #f6f7f9 0% 50%) 50% / 18px 18px; }
  .apptile svg { width:100%; height:auto; display:block; }
  @media (max-width:760px){ .apps-icons{ grid-template-columns:1fr 1fr; } }
  @media (max-width:760px){ .panels{ grid-template-columns:1fr; } .tokens{ grid-template-columns:1fr; } .logo-grid{ grid-template-columns:1fr 1fr; } .lock-grid{ grid-template-columns:1fr; } }
</style></head>
<body><div class="wrap">
  <h1>${esc(brandTitle)}</h1>
  <p class="sub">Brand kit preview — logo, lockups, color system, and typography.</p>
  ${auditNote}

  ${logo ? logoSection(logo, result) : ""}
  ${logo ? lockupSection(logo, result) : ""}
  ${apps && apps.length ? appsSection(apps) : ""}

  <h2>Tonal ramps</h2>
  ${ramps}

  <h2>Semantic tokens</h2>
  <div class="panels">
    ${themePanel("Light", result.themes.light)}
    ${themePanel("Dark", result.themes.dark)}
  </div>

  <h2>Contrast audit (WCAG)</h2>
  ${auditTable(result)}
</div></body></html>
`;
}
