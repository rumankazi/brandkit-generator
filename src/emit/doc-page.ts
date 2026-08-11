import type { SemanticTokens } from "../color/palette.js";
import type { PreviewFonts } from "../preview/palette-preview.js";

/**
 * Renders the generated markdown docs (guidelines, brand-spec) as proper,
 * styled HTML pages for the published site — so they read as real pages, not
 * raw markdown. The `.md` files are still emitted for repo/handoff; these are
 * the web view. The markdown is self-generated (a known subset: headings, GFM
 * tables, `-` lists, **bold**, _italic_, `code`), so this small deterministic
 * converter is sufficient — no markdown dependency.
 */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Inline spans: escape first, then code → bold → italic (content is controlled). */
function inline(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])_([^_]+)_(?=[\s.,)]|$)/g, "$1<em>$2</em>");
}

const cells = (row: string) =>
  row
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

/** Convert the generated markdown subset to HTML. */
export function mdToHtml(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let i = 0;
  const isTable = (l: string) => /^\s*\|.*\|\s*$/.test(l);
  const isDelim = (l: string) => /^\s*\|?[\s:|-]*-+[\s:|-]*\|?\s*$/.test(l) && l.includes("-");

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const t = line.trim();

    if (!t) {
      i++;
      continue;
    }

    // Heading
    const h = t.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = h[1]!.length;
      out.push(`<h${level}>${inline(h[2]!)}</h${level}>`);
      i++;
      continue;
    }

    // Table: header row, delimiter row, then body rows
    if (isTable(line) && i + 1 < lines.length && isDelim(lines[i + 1] ?? "")) {
      const head = cells(line);
      i += 2;
      const body: string[][] = [];
      while (i < lines.length && isTable(lines[i] ?? "")) {
        body.push(cells(lines[i] ?? ""));
        i++;
      }
      const thead = `<thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead>`;
      const tbody = `<tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody>`;
      out.push(`<div class="tablewrap"><table>${thead}${tbody}</table></div>`);
      continue;
    }

    // Unordered list
    if (/^-\s+/.test(t)) {
      const items: string[] = [];
      while (i < lines.length && /^-\s+/.test((lines[i] ?? "").trim())) {
        items.push(`<li>${inline((lines[i] ?? "").trim().replace(/^-\s+/, ""))}</li>`);
        i++;
      }
      out.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(t)) {
      out.push("<hr>");
      i++;
      continue;
    }

    // Paragraph (gather until blank)
    const para: string[] = [];
    while (i < lines.length && (lines[i] ?? "").trim() && !/^(#{1,6}\s|-\s|---+$)/.test((lines[i] ?? "").trim()) && !isTable(lines[i] ?? "")) {
      para.push((lines[i] ?? "").trim());
      i++;
    }
    out.push(`<p>${inline(para.join(" "))}</p>`);
  }
  return out.join("\n");
}

export interface DocPageOpts {
  brandTitle: string;
  fonts: PreviewFonts;
  themes: { light: SemanticTokens; dark: SemanticTokens };
  /** Other docs to link in the top bar: [label, href]. */
  nav: Array<[string, string]>;
}

function fontsImport(fonts: PreviewFonts): string {
  const fam = (f: { family: string; weight: number }, weights: number[]) =>
    `family=${f.family.replace(/ /g, "+")}:wght@${[...new Set(weights)].sort((a, b) => a - b).join(";")}`;
  return `@import url('https://fonts.googleapis.com/css2?${[fam(fonts.title, [500, 700]), fam(fonts.body, [400, 600]), fam(fonts.mono, [400])].join("&")}&display=swap');`;
}

/** Wrap converted markdown in a styled, theme-aware page matching the gallery. */
export function renderDocPage(md: string, pageTitle: string, opts: DocPageOpts): string {
  const { light, dark } = opts.themes;
  const nav = opts.nav.map(([label, href]) => `<a href="${href}">${esc(label)}</a>`).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(pageTitle)} — ${esc(opts.brandTitle)}</title>
<link rel="icon" href="apps/favicon.svg">
<style>
  ${fontsImport(opts.fonts)}
  :root {
    color-scheme: light dark;
    --bg:#f6f7f9; --fg:#0b1120; --card:#fff; --line:#e2e8f0; --muted:#64748b; --accent:${light.accent};
    --font-heading:'${opts.fonts.title.family}',system-ui,sans-serif;
    --font-body:'${opts.fonts.body.family}',system-ui,sans-serif;
    --font-mono:'${opts.fonts.mono.family}',ui-monospace,"SF Mono",monospace;
  }
  @media (prefers-color-scheme: dark){ :root{
    --bg:#0b1120; --fg:#f8fafc; --card:#111827; --line:#1f2937; --muted:#94a3b8; --accent:${dark.accent};
  } }
  * { box-sizing:border-box; }
  body { margin:0; font-family:var(--font-body); font-size:15.5px; line-height:1.65; background:var(--bg); color:var(--fg); }
  .bar { border-bottom:1px solid var(--line); background:color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter:blur(8px); position:sticky; top:0; z-index:5; }
  .bar-in { max-width:860px; margin:0 auto; padding:12px 24px; display:flex; gap:14px; align-items:center; flex-wrap:wrap; }
  .bar a { font-size:13px; color:var(--muted); text-decoration:none; padding:5px 9px; border-radius:7px; }
  .bar a:hover { color:var(--fg); background:var(--card); }
  .bar a.home { color:var(--fg); font-weight:600; }
  main { max-width:860px; margin:0 auto; padding:16px 24px 96px; }
  h1 { font-family:var(--font-heading); font-size:30px; font-weight:700; letter-spacing:-0.02em; margin:28px 0 8px; }
  h2 { font-family:var(--font-heading); font-size:21px; font-weight:700; letter-spacing:-0.01em; margin:40px 0 12px; padding-top:14px; border-top:1px solid var(--line); }
  h3 { font-family:var(--font-heading); font-size:16px; font-weight:600; margin:26px 0 8px; }
  p { margin:12px 0; }
  ul { margin:12px 0; padding-left:22px; }
  li { margin:5px 0; }
  a { color:var(--accent); }
  code { font-family:var(--font-mono); font-size:.88em; background:color-mix(in srgb, var(--muted) 16%, transparent); padding:1.5px 5px; border-radius:5px; }
  hr { border:0; border-top:1px solid var(--line); margin:28px 0; }
  em { color:var(--muted); }
  .tablewrap { overflow-x:auto; margin:16px 0; border:1px solid var(--line); border-radius:12px; }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  th, td { text-align:left; padding:9px 14px; border-bottom:1px solid var(--line); vertical-align:top; }
  th { font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); background:color-mix(in srgb, var(--muted) 7%, transparent); }
  tr:last-child td { border-bottom:0; }
  td code, th code { background:transparent; padding:0; }
</style></head>
<body>
  <nav class="bar"><div class="bar-in"><a class="home" href="index.html">← Brand kit</a>${nav}</div></nav>
  <main>${mdToHtml(md)}</main>
</body></html>
`;
}
