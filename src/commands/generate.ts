import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildPalette, rampEntries, STEPS, type PaletteResult, type Ramp } from "../color/palette.js";
import { ConfigError, loadConfig } from "../config/load.js";
import { renderGuidelines } from "../emit/guidelines.js";
import { buildLockups, buildWordmark } from "../lockup/build.js";
import { loadLogo } from "../logo/load.js";
import { monoMap, recolorSvg } from "../logo/recolor.js";
import { faviconHeadSnippet, siteWebmanifest } from "../emit/webmanifest.js";
import { renderPalettePreview, type AppPreview, type LogoBundle } from "../preview/palette-preview.js";
import { svgToPdf } from "../render/pdf.js";
import { svgToPng, toAvif, toIco, toWebp } from "../render/raster.js";
import { composeSurface, type BrandArt } from "../surfaces/compose.js";
import { SURFACES } from "../surfaces/presets.js";
import { toDtcg } from "../tokens/dtcg.js";
import { toTailwind } from "../tokens/tailwind.js";
import type { ResolvedConfig } from "../config/schema.js";

interface Args {
  config: string;
  out?: string;
  validateOnly: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { config: "brandkit.config.yaml", validateOnly: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-c" || a === "--config") args.config = argv[++i] ?? args.config;
    else if (a === "-o" || a === "--out") args.out = argv[++i];
    else if (a === "--validate-only") args.validateOnly = true;
    else if (a === "-h" || a === "--help") args.help = true;
    else if (a && !a.startsWith("-")) args.config = a;
  }
  return args;
}

const HELP = `brandkit — opinionated brand-asset generator

Usage:
  brandkit [--config <file.yaml>] [--out <dir>] [--validate-only]

Options:
  -c, --config <file>   Brand config YAML (default: brandkit.config.yaml)
  -o, --out <dir>       Output directory (overrides output.dir)
      --validate-only   Validate + resolve the config and print the plan; no render
  -h, --help            Show this help
`;

/** Resolved-config plan for --validate-only. */
function summarize(cfg: ResolvedConfig): string {
  return [
    `  brand      : ${cfg.brand.title}${cfg.brand.subtitle ? ` — ${cfg.brand.subtitle}` : ""}`,
    `  logo       : ${cfg.logo.src}`,
    `  primary    : ${cfg.color.primary}`,
    `  themes     : light + dark`,
    `  type       : ${cfg.typography.title.family} ${cfg.typography.title.weight} / ${cfg.typography.body.family} / ${cfg.typography.mono.family}`,
    `  layout     : clear-space ${cfg.layout.clearSpace}·X, gap ${cfg.layout.gap}·X, min ${cfg.layout.minSizePx}px`,
    `  palette    : ${cfg.palette.steps.length}-step OKLCH ramp, WCAG ${cfg.palette.contrast}`,
    `  surfaces   : ${SURFACES.map((s) => s.name).join(", ")}`,
    `  output     : ${cfg.output.dir}/  formats [${cfg.output.formats.join(", ")}] @${cfg.output.densities.join("/")}x`,
  ].join("\n");
}

/** A generated brand-spec fragment — the "explain what we decided" deliverable. */
function brandSpec(result: PaletteResult, brandTitle: string): string {
  const ramp = (name: string, r: Ramp) =>
    `### ${name}\n\n| ${STEPS.join(" | ")} |\n|${STEPS.map(() => "---").join("|")}|\n| ${rampEntries(r)
      .map(([, hex]) => hex)
      .join(" | ")} |\n`;

  const auditRows = result.audit
    .map((a) => `| ${a.theme} | ${a.pair} | ${a.fg} | ${a.bg} | ${a.ratio.toFixed(2)}:1 | ${a.required}:1 | ${a.pass ? "✅" : "⚠️"} |`)
    .join("\n");

  return `# ${brandTitle} — Brand spec (colors)

Generated from the brand config. Palette derived perceptually in OKLCH; every
foreground/background pairing audited against WCAG.

## Tonal ramps

${ramp("brand", result.palette.primary)}
${result.hasAccent ? ramp("accent", result.palette.accent) + "\n" : ""}${ramp("neutral", result.palette.neutral)}

## Contrast audit

| Theme | Pairing | Foreground | Background | Ratio | Required | Status |
|---|---|---|---|---|---|---|
${auditRows}
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return;
  }

  let cfg;
  try {
    cfg = await loadConfig(args.config);
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`\n✗ ${err.message}\n`);
      for (const issue of err.issues ?? []) process.stderr.write(`    • ${issue}\n`);
      process.exit(1);
    }
    throw err;
  }
  if (args.out) cfg.output.dir = args.out;

  if (args.validateOnly) {
    process.stdout.write(`\n✓ Config valid — resolved plan:\n\n${summarize(cfg)}\n\n`);
    return;
  }

  const result = buildPalette(cfg);

  // Logo: recolor into theme variants (deterministic fill remap).
  //  - mono: all fills → currentColor (inherits text color — one file, any theme)
  //  - duotone: the P slot carries the accent; the loop slot becomes ink
  //  - on-accent: white knockout for placement on the brand blue
  const logo = await loadLogo(cfg.logo.src);
  const slotHexes = Object.values(cfg.logo.slots);
  const pSlot = cfg.logo.slots.primary ?? slotHexes[0] ?? cfg.color.primary;
  const loopSlot = cfg.logo.slots.neutral ?? slotHexes[1] ?? pSlot;
  const duotone = (accent: string, ink: string) => recolorSvg(logo.svg, { [pSlot]: accent, [loopSlot]: ink });

  const light = result.themes.light;
  const dark = result.themes.dark;
  const variants = {
    original: logo.svg,
    mono: recolorSvg(logo.svg, monoMap(slotHexes, "currentColor")),
    duotoneLight: duotone(light.accent, light.fg),
    duotoneDark: duotone(dark.accent, dark.fg),
    onAccent: recolorSvg(logo.svg, monoMap(slotHexes, "#FFFFFF")),
  };
  // Lockups: deterministic, outlined-glyph SVGs with cap-height alignment.
  const lockups = buildLockups({
    markLight: variants.duotoneLight,
    markDark: variants.duotoneDark,
    logoW: logo.width,
    logoH: logo.height,
    inkLight: light.fg,
    inkDark: dark.fg,
    wordmark: cfg.brand.title,
    titleFamily: cfg.typography.title.family,
    gapRatio: cfg.layout.gap,
  });

  // Wordmark (logotype): the text only, no mark — outlined, per theme ink.
  const wordmark = {
    light: buildWordmark(cfg.brand.title, cfg.typography.title.family, light.fg),
    dark: buildWordmark(cfg.brand.title, cfg.typography.title.family, dark.fg),
  };

  const logoBundle: LogoBundle = {
    width: logo.width,
    height: logo.height,
    clearSpaceRatio: cfg.layout.clearSpace,
    gapRatio: cfg.layout.gap,
    mono: variants.mono,
    duotoneLight: variants.duotoneLight,
    duotoneDark: variants.duotoneDark,
    onAccent: variants.onAccent,
    lockups,
    wordmark,
  };

  const outDir = resolve(process.cwd(), cfg.output.dir);
  const tokensDir = resolve(outDir, "tokens");
  const logoDir = resolve(outDir, "logo");
  const appsDir = resolve(outDir, "apps");
  await mkdir(tokensDir, { recursive: true });
  await rm(logoDir, { recursive: true, force: true }); // drop stale variants
  await rm(appsDir, { recursive: true, force: true });
  await mkdir(logoDir, { recursive: true });
  await mkdir(appsDir, { recursive: true });

  // Applications: compose each surface preset (SVG), then rasterize per its spec.
  const art: BrandArt = {
    duotoneLight: variants.duotoneLight,
    duotoneDark: variants.duotoneDark,
    onAccent: variants.onAccent,
    lockups,
  };
  const appsPreview: AppPreview[] = [];
  const manifestApps: Array<{ file: string; width: number; height: number; use: string }> = [];
  const appWrites: Array<Promise<void>> = [];

  for (const s of SURFACES) {
    const svg = composeSurface(s, art, result.themes);
    appWrites.push(writeFile(resolve(appsDir, `${s.name}.svg`), svg));
    appsPreview.push({ name: s.name, use: s.use, svg, w: s.w, h: s.h, group: s.group });
    manifestApps.push({ file: `apps/${s.name}.svg`, width: s.w, height: s.h, use: s.use });

    const multi = s.raster.length > 1;
    for (const width of s.raster) {
      const png = svgToPng(svg, width);
      const fname = multi ? `${s.name}-${width}.png` : `${s.name}.png`;
      appWrites.push(writeFile(resolve(appsDir, fname), png));
      manifestApps.push({ file: `apps/${fname}`, width, height: Math.round((width * s.h) / s.w), use: s.use });
    }

    // Retina densities for display surfaces (icons already emit explicit sizes).
    if (s.group === "banner") {
      for (const d of cfg.output.densities) {
        if (d <= 1) continue;
        const w = Math.round(s.w * d);
        appWrites.push(writeFile(resolve(appsDir, `${s.name}@${d}x.png`), svgToPng(svg, w)));
        manifestApps.push({ file: `apps/${s.name}@${d}x.png`, width: w, height: Math.round((w * s.h) / s.w), use: `${s.use} (@${d}x)` });
      }
    }

    const nativePng = svgToPng(svg, s.w);
    if (s.webp) {
      appWrites.push(toWebp(nativePng).then((b) => writeFile(resolve(appsDir, `${s.name}.webp`), b)));
      manifestApps.push({ file: `apps/${s.name}.webp`, width: s.w, height: s.h, use: s.use });
    }
    if (s.avif) {
      appWrites.push(toAvif(nativePng).then((b) => writeFile(resolve(appsDir, `${s.name}.avif`), b)));
    }
    if (s.ico) {
      const ico = await toIco(s.ico.map((sz) => svgToPng(svg, sz)));
      appWrites.push(writeFile(resolve(appsDir, "favicon.ico"), ico));
      manifestApps.push({ file: "apps/favicon.ico", width: 0, height: 0, use: "Multi-size favicon (16/32/48)" });
    }
  }

  // Web integration: PWA manifest + a paste-ready favicon <head> snippet.
  manifestApps.push({ file: "apps/site.webmanifest", width: 0, height: 0, use: "PWA web-app manifest" });
  manifestApps.push({ file: "apps/favicon-tags.html", width: 0, height: 0, use: "Favicon <head> snippet" });

  // Vector PDF (print/handoff) for the flat assets — mark + horizontal lockups.
  const pdfs: Array<[string, string]> = [
    ["logo/mark-duotone-light.pdf", variants.duotoneLight],
    ["logo/lockup-horizontal-light.pdf", lockups.hLight],
    ["logo/lockup-horizontal-dark.pdf", lockups.hDark],
    ["logo/wordmark-light.pdf", wordmark.light],
  ];

  const manifest = {
    brand: cfg.brand.title,
    generator: "brandkit-generator",
    docs: ["guidelines.md", "brand-spec.md", "preview.html"],
    tokens: ["tokens/tokens.json", "tokens/tailwind.theme.css"],
    logo: [
      "logo/mark-mono.svg",
      "logo/mark-duotone-light.svg",
      "logo/mark-duotone-dark.svg",
      "logo/mark-on-accent.svg",
      "logo/logo-original.svg",
      "logo/wordmark-light.svg",
      "logo/wordmark-dark.svg",
    ],
    lockups: [
      "logo/lockup-horizontal-light.svg",
      "logo/lockup-horizontal-dark.svg",
      "logo/lockup-vertical-light.svg",
      "logo/lockup-vertical-dark.svg",
    ],
    print: pdfs.map(([f]) => f),
    apps: manifestApps,
  };

  await Promise.all([
    writeFile(resolve(tokensDir, "tokens.json"), toDtcg(result)),
    writeFile(resolve(tokensDir, "tailwind.theme.css"), toTailwind(result)),
    writeFile(resolve(logoDir, "logo-original.svg"), variants.original),
    writeFile(resolve(logoDir, "mark-mono.svg"), variants.mono),
    writeFile(resolve(logoDir, "mark-duotone-light.svg"), variants.duotoneLight),
    writeFile(resolve(logoDir, "mark-duotone-dark.svg"), variants.duotoneDark),
    writeFile(resolve(logoDir, "mark-on-accent.svg"), variants.onAccent),
    writeFile(resolve(logoDir, "lockup-horizontal-light.svg"), lockups.hLight),
    writeFile(resolve(logoDir, "lockup-horizontal-dark.svg"), lockups.hDark),
    writeFile(resolve(logoDir, "lockup-vertical-light.svg"), lockups.vLight),
    writeFile(resolve(logoDir, "lockup-vertical-dark.svg"), lockups.vDark),
    writeFile(resolve(logoDir, "wordmark-light.svg"), wordmark.light),
    writeFile(resolve(logoDir, "wordmark-dark.svg"), wordmark.dark),
    ...appWrites,
    writeFile(resolve(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n"),
    writeFile(
      resolve(outDir, "preview.html"),
      renderPalettePreview(
        result,
        cfg.brand.title,
        { title: cfg.typography.title, body: cfg.typography.body, mono: cfg.typography.mono },
        logoBundle,
        appsPreview,
      ),
    ),
    writeFile(resolve(outDir, "brand-spec.md"), brandSpec(result, cfg.brand.title)),
    writeFile(resolve(outDir, "guidelines.md"), renderGuidelines(cfg, result)),
    writeFile(resolve(appsDir, "site.webmanifest"), siteWebmanifest(cfg, result.themes)),
    writeFile(resolve(appsDir, "favicon-tags.html"), faviconHeadSnippet(cfg, result.themes)),
    ...pdfs.map(([file, svg]) => svgToPdf(svg).then((b) => writeFile(resolve(outDir, file), b))),
  ]);

  const warnings = result.audit.filter((r) => !r.pass);
  process.stdout.write(`\n✓ Color system generated for "${cfg.brand.title}"\n\n`);
  process.stdout.write(`  primary   : ${cfg.color.primary}\n`);
  process.stdout.write(`  accent    : ${cfg.color.accent ?? cfg.color.secondary ?? "(derived from primary)"}\n`);
  process.stdout.write(`  ramps     : brand${result.hasAccent ? ", accent" : ""}, neutral (${STEPS.length} steps each, OKLCH)\n`);
  process.stdout.write(`  contrast  : WCAG ${cfg.palette.contrast} — ${result.audit.length - warnings.length}/${result.audit.length} pairings pass\n`);
  if (warnings.length) {
    for (const w of warnings) {
      process.stdout.write(`      ⚠️  ${w.theme}: ${w.pair} = ${w.ratio.toFixed(2)}:1 (need ${w.required}:1)\n`);
    }
  }
  process.stdout.write(`  logo      : mono(currentColor) + duotone-light/dark + on-accent (${logo.width}×${logo.height})\n`);
  process.stdout.write(`  lockups   : horizontal + vertical × light/dark — outlined SVG, cap-height aligned\n`);
  process.stdout.write(`  apps      : ${SURFACES.map((s) => s.name).join(", ")} (SVG + PNG${SURFACES.some((s) => s.webp) ? "/WebP" : ""} + favicon.ico)\n`);
  process.stdout.write(`  print     : mark + horizontal lockups → vector PDF\n`);
  process.stdout.write(`  web       : site.webmanifest + favicon-tags.html (paste-ready)\n`);
  process.stdout.write(`\n  → ${cfg.output.dir}/tokens/tokens.json · tailwind.theme.css\n`);
  process.stdout.write(`  → ${cfg.output.dir}/logo/  (marks + 4 lockups, SVG + PDF)\n`);
  process.stdout.write(`  → ${cfg.output.dir}/apps/  (${SURFACES.length} surfaces: SVG + PNG/WebP + favicon.ico + webmanifest)\n`);
  process.stdout.write(`  → ${cfg.output.dir}/manifest.json\n`);
  process.stdout.write(`  → ${cfg.output.dir}/preview.html   (open this)\n`);
  process.stdout.write(`  → ${cfg.output.dir}/guidelines.md · brand-spec.md\n\n`);
}

main().catch((err) => {
  process.stderr.write(`\nUnexpected error: ${(err as Error).stack ?? err}\n`);
  process.exit(1);
});
