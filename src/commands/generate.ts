import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildPalette, rampEntries, STEPS, type PaletteResult, type Ramp } from "../color/palette.js";
import { ConfigError, loadConfig } from "../config/load.js";
import { renderGuidelines } from "../emit/guidelines.js";
import { buildClearSpaceDiagram, buildLockups, buildWordmark } from "../lockup/build.js";
import { loadLogo } from "../logo/load.js";
import { monoMap, recolorSvg } from "../logo/recolor.js";
import { centerlineTiming, renderCenterlineMark } from "../motion/centerline.js";
import { renderAnimatedMark } from "../motion/animated-template.js";
import { encodeAnimation, encodeSvgFrames } from "../motion/encode.js";
import { bakeLockupFrames, lockupLayout, renderAnimatedLockup, type LockupColors } from "../motion/lockup-anim.js";
import { padViewBox } from "../svg/util.js";
import { faviconHeadSnippet, siteWebmanifest } from "../emit/webmanifest.js";
import { renderPalettePreview, type AppPreview, type LogoBundle, type StickerPreview } from "../preview/palette-preview.js";
import { pngToPdfMm, svgToPdf } from "../render/pdf.js";
import { pngSize, resizePng, stackPng, svgToPng, toAvif, toIco, toWebp } from "../render/raster.js";
import { composeSticker } from "../stickers/compose.js";
import { STICKER_DPI, STICKERS } from "../stickers/presets.js";
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
  // Motion foundation: the animatable centerline — the pipe's single continuous
  // spine, stroked at pipe width + flow arrowheads. It reproduces the mark but,
  // unlike the filled art, it can be "drawn on"; every animated variant builds
  // on it. Colors follow the duotone (accent = primary, ink = neutral).
  const centerline = {
    light: renderCenterlineMark({ primary: light.accent, neutral: light.fg }),
    dark: renderCenterlineMark({ primary: dark.accent, neutral: dark.fg }),
    mono: renderCenterlineMark({ primary: "currentColor", neutral: "currentColor" }),
  };
  const centerlineMotion = centerlineTiming();

  // Master "draw-on" animation (CSS, browser-native, self-contained). The arrow
  // draws the mark G→B→D from the bottom and loops back — the brand-launch reveal.
  // GIF/APNG/Lottie exports (deferred) sample the same timeline analytically.
  const animated = {
    light: renderAnimatedMark({ primary: light.accent, neutral: light.fg }),
    dark: renderAnimatedMark({ primary: dark.accent, neutral: dark.fg }),
  };
  // Raster exports of the animation (GIF + WebP), baked from the same reference
  // timeline over a solid theme background.
  const [animRasterLight, animRasterDark] = await Promise.all([
    encodeAnimation({ primary: light.accent, neutral: light.fg, background: light.bg }),
    encodeAnimation({ primary: dark.accent, neutral: dark.fg, background: dark.bg }),
  ]);

  // Animated lockups: mark draws on, then the wordmark reveals. Horizontal +
  // vertical, both themes, as live SVG + baked GIF/WebP.
  const lkParams = { wordmark: cfg.brand.title, titleFamily: cfg.typography.title.family, gapRatio: cfg.layout.gap, logoW: logo.width, logoH: logo.height };
  const hLayout = lockupLayout(lkParams, "horizontal");
  const vLayout = lockupLayout(lkParams, "vertical");
  const lkColor = (t: typeof light): LockupColors => ({ primary: t.accent, neutral: t.fg, ink: t.fg });
  const animLockups = {
    hLight: renderAnimatedLockup(hLayout, lkColor(light), "horizontal"),
    hDark: renderAnimatedLockup(hLayout, lkColor(dark), "horizontal"),
    vLight: renderAnimatedLockup(vLayout, lkColor(light), "vertical"),
    vDark: renderAnimatedLockup(vLayout, lkColor(dark), "vertical"),
  };
  const LK_N = 48;
  const [lkHL, lkHD, lkVL, lkVD] = await Promise.all([
    encodeSvgFrames(bakeLockupFrames(LK_N, hLayout, lkColor(light), "horizontal", light.bg), { width: 1080 }),
    encodeSvgFrames(bakeLockupFrames(LK_N, hLayout, lkColor(dark), "horizontal", dark.bg), { width: 1080 }),
    encodeSvgFrames(bakeLockupFrames(LK_N, vLayout, lkColor(light), "vertical", light.bg), { width: 440 }),
    encodeSvgFrames(bakeLockupFrames(LK_N, vLayout, lkColor(dark), "vertical", dark.bg), { width: 440 }),
  ]);

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

  // Mono (single-color) lockups — one ink throughout, for print/stamps.
  const monoLockups = buildLockups({
    markLight: recolorSvg(logo.svg, monoMap(slotHexes, light.fg)),
    markDark: recolorSvg(logo.svg, monoMap(slotHexes, dark.fg)),
    logoW: logo.width,
    logoH: logo.height,
    inkLight: light.fg,
    inkDark: dark.fg,
    wordmark: cfg.brand.title,
    titleFamily: cfg.typography.title.family,
    gapRatio: cfg.layout.gap,
  });

  // Clear-space padded (drop-in) lockups + a clear-space spec diagram.
  const clearPad = cfg.layout.clearSpace * 100; // 0.5 · X (lockup unit X = 100)
  const lockupPadded = {
    light: padViewBox(lockups.hLight, clearPad),
    dark: padViewBox(lockups.hDark, clearPad),
  };
  const clearSpaceDiagram = buildClearSpaceDiagram(lockups.hLight, cfg.layout.clearSpace, light["muted-fg"], light.accent);

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

  // PNG exports of the primitives (mark, lockups, wordmark, diagram) — base + @2x.
  const primitivePngs: Array<[string, string, number]> = [
    ["mark-duotone-light", variants.duotoneLight, 512],
    ["mark-duotone-dark", variants.duotoneDark, 512],
    ["mark-on-accent", variants.onAccent, 512],
    ["mark-centerline-light", centerline.light, 512],
    ["mark-centerline-dark", centerline.dark, 512],
    ["lockup-horizontal-light", lockups.hLight, 1200],
    ["lockup-horizontal-dark", lockups.hDark, 1200],
    ["lockup-vertical-light", lockups.vLight, 700],
    ["lockup-vertical-dark", lockups.vDark, 700],
    ["wordmark-light", wordmark.light, 1200],
    ["wordmark-dark", wordmark.dark, 1200],
    ["lockup-horizontal-mono-black", monoLockups.hLight, 1200],
    ["lockup-horizontal-mono-white", monoLockups.hDark, 1200],
    ["clearspace-diagram", clearSpaceDiagram, 1400],
  ];
  const logoPngWrites = primitivePngs.flatMap(([name, svg, width]) => [
    writeFile(resolve(logoDir, `${name}.png`), svgToPng(svg, width)),
    writeFile(resolve(logoDir, `${name}@2x.png`), svgToPng(svg, width * 2)),
  ]);

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

  // Stickers: print-ready die-cut assets (bleed + cut line + safe margin).
  const stickersDir = resolve(outDir, "stickers");
  await rm(stickersDir, { recursive: true, force: true });
  await mkdir(stickersDir, { recursive: true });
  const px = (mm: number, dpi: number) => Math.round((mm / 25.4) * dpi);
  const stickerPreview: StickerPreview[] = [];
  const manifestStickers: Array<{ file: string; use: string }> = [];
  const stickerWrites: Array<Promise<void>> = [];
  const MASK_DPI = 150; // white contour is low-frequency — cheap here, then upscaled
  for (const s of STICKERS) {
    const sk = composeSticker(s, art, result.themes);
    const artHi = svgToPng(sk.artSvg, px(sk.wMm, STICKER_DPI)); // crisp colour art @300dpi
    const { width: W, height: H } = await pngSize(artHi);
    const halo = await resizePng(svgToPng(sk.haloSvg, px(sk.wMm, MASK_DPI)), W, H);
    const shadow = await resizePng(svgToPng(sk.shadowSvg, px(sk.wMm, MASK_DPI)), W, H);
    const artwork = await stackPng(W, H, [halo, artHi]); // transparent die-cut sticker
    const proof = await stackPng(W, H, [shadow, halo, artHi], "#e5e7eb");

    stickerWrites.push(writeFile(resolve(stickersDir, `${s.name}.svg`), sk.svg));
    stickerWrites.push(writeFile(resolve(stickersDir, `${s.name}@${STICKER_DPI}dpi.png`), artwork));
    stickerWrites.push(pngToPdfMm(artwork, sk.wMm, sk.hMm).then((b) => writeFile(resolve(stickersDir, `${s.name}.pdf`), b)));
    stickerWrites.push(writeFile(resolve(stickersDir, `${s.name}-proof.png`), proof));
    stickerPreview.push({ name: s.name, use: s.use, proof: sk.svg });
    manifestStickers.push({ file: `stickers/${s.name}.pdf`, use: `${s.use} — die-cut print PDF` });
    manifestStickers.push({ file: `stickers/${s.name}@${STICKER_DPI}dpi.png`, use: `${s.use} — ${STICKER_DPI}dpi PNG (transparent)` });
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
      "logo/mark-centerline-light.svg",
      "logo/mark-centerline-dark.svg",
      "logo/mark-centerline-mono.svg",
      "logo/logo-original.svg",
      "logo/wordmark-light.svg",
      "logo/wordmark-dark.svg",
    ],
    lockups: [
      "logo/lockup-horizontal-light.svg",
      "logo/lockup-horizontal-dark.svg",
      "logo/lockup-vertical-light.svg",
      "logo/lockup-vertical-dark.svg",
      "logo/lockup-horizontal-mono-black.svg",
      "logo/lockup-horizontal-mono-white.svg",
      "logo/lockup-horizontal-light-clearspace.svg",
      "logo/lockup-horizontal-dark-clearspace.svg",
    ],
    diagram: "logo/clearspace-diagram.svg",
    // Motion foundation: the animatable centerline + analytic draw timing.
    // Draw order G→B→D (neutral loop → primary top loop → primary descender),
    // one continuous gesture from the bottom back to the bottom (seamless loop).
    motion: {
      centerline: ["logo/mark-centerline-light.svg", "logo/mark-centerline-dark.svg", "logo/mark-centerline-mono.svg"],
      animated: ["logo/mark-animated-light.svg", "logo/mark-animated-dark.svg"],
      raster: [
        "logo/mark-animated-light.gif",
        "logo/mark-animated-light.webp",
        "logo/mark-animated-dark.gif",
        "logo/mark-animated-dark.webp",
      ],
      lockups: [
        "logo/lockup-horizontal-animated-light.svg",
        "logo/lockup-horizontal-animated-dark.svg",
        "logo/lockup-vertical-animated-light.svg",
        "logo/lockup-vertical-animated-dark.svg",
        "logo/lockup-horizontal-animated-light.gif",
        "logo/lockup-horizontal-animated-light.webp",
        "logo/lockup-horizontal-animated-dark.gif",
        "logo/lockup-horizontal-animated-dark.webp",
        "logo/lockup-vertical-animated-light.gif",
        "logo/lockup-vertical-animated-light.webp",
        "logo/lockup-vertical-animated-dark.gif",
        "logo/lockup-vertical-animated-dark.webp",
      ],
      timing: centerlineMotion,
    },
    print: pdfs.map(([f]) => f),
    primitivesRaster: primitivePngs.flatMap(([name]) => [`logo/${name}.png`, `logo/${name}@2x.png`]),
    apps: manifestApps,
    stickers: manifestStickers,
  };

  await Promise.all([
    writeFile(resolve(tokensDir, "tokens.json"), toDtcg(result)),
    writeFile(resolve(tokensDir, "tailwind.theme.css"), toTailwind(result)),
    writeFile(resolve(logoDir, "logo-original.svg"), variants.original),
    writeFile(resolve(logoDir, "mark-mono.svg"), variants.mono),
    writeFile(resolve(logoDir, "mark-duotone-light.svg"), variants.duotoneLight),
    writeFile(resolve(logoDir, "mark-duotone-dark.svg"), variants.duotoneDark),
    writeFile(resolve(logoDir, "mark-on-accent.svg"), variants.onAccent),
    writeFile(resolve(logoDir, "mark-centerline-light.svg"), centerline.light),
    writeFile(resolve(logoDir, "mark-centerline-dark.svg"), centerline.dark),
    writeFile(resolve(logoDir, "mark-centerline-mono.svg"), centerline.mono),
    writeFile(resolve(logoDir, "mark-animated-light.svg"), animated.light),
    writeFile(resolve(logoDir, "mark-animated-dark.svg"), animated.dark),
    writeFile(resolve(logoDir, "mark-animated-light.gif"), animRasterLight.gif),
    writeFile(resolve(logoDir, "mark-animated-light.webp"), animRasterLight.webp),
    writeFile(resolve(logoDir, "mark-animated-dark.gif"), animRasterDark.gif),
    writeFile(resolve(logoDir, "mark-animated-dark.webp"), animRasterDark.webp),
    writeFile(resolve(logoDir, "lockup-horizontal-animated-light.svg"), animLockups.hLight),
    writeFile(resolve(logoDir, "lockup-horizontal-animated-dark.svg"), animLockups.hDark),
    writeFile(resolve(logoDir, "lockup-vertical-animated-light.svg"), animLockups.vLight),
    writeFile(resolve(logoDir, "lockup-vertical-animated-dark.svg"), animLockups.vDark),
    writeFile(resolve(logoDir, "lockup-horizontal-animated-light.gif"), lkHL.gif),
    writeFile(resolve(logoDir, "lockup-horizontal-animated-light.webp"), lkHL.webp),
    writeFile(resolve(logoDir, "lockup-horizontal-animated-dark.gif"), lkHD.gif),
    writeFile(resolve(logoDir, "lockup-horizontal-animated-dark.webp"), lkHD.webp),
    writeFile(resolve(logoDir, "lockup-vertical-animated-light.gif"), lkVL.gif),
    writeFile(resolve(logoDir, "lockup-vertical-animated-light.webp"), lkVL.webp),
    writeFile(resolve(logoDir, "lockup-vertical-animated-dark.gif"), lkVD.gif),
    writeFile(resolve(logoDir, "lockup-vertical-animated-dark.webp"), lkVD.webp),
    writeFile(resolve(logoDir, "lockup-horizontal-light.svg"), lockups.hLight),
    writeFile(resolve(logoDir, "lockup-horizontal-dark.svg"), lockups.hDark),
    writeFile(resolve(logoDir, "lockup-vertical-light.svg"), lockups.vLight),
    writeFile(resolve(logoDir, "lockup-vertical-dark.svg"), lockups.vDark),
    writeFile(resolve(logoDir, "wordmark-light.svg"), wordmark.light),
    writeFile(resolve(logoDir, "wordmark-dark.svg"), wordmark.dark),
    writeFile(resolve(logoDir, "lockup-horizontal-mono-black.svg"), monoLockups.hLight),
    writeFile(resolve(logoDir, "lockup-horizontal-mono-white.svg"), monoLockups.hDark),
    writeFile(resolve(logoDir, "lockup-horizontal-light-clearspace.svg"), lockupPadded.light),
    writeFile(resolve(logoDir, "lockup-horizontal-dark-clearspace.svg"), lockupPadded.dark),
    writeFile(resolve(logoDir, "clearspace-diagram.svg"), clearSpaceDiagram),
    ...logoPngWrites,
    ...appWrites,
    ...stickerWrites,
    writeFile(resolve(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n"),
    writeFile(
      resolve(outDir, "preview.html"),
      renderPalettePreview(
        result,
        cfg.brand.title,
        { title: cfg.typography.title, body: cfg.typography.body, mono: cfg.typography.mono },
        logoBundle,
        appsPreview,
        stickerPreview,
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
  process.stdout.write(`  motion    : mark draw-on (SVG + GIF/WebP) + animated lockups h/v (SVG + GIF/WebP), light/dark\n`);
  process.stdout.write(`  lockups   : horizontal + vertical × light/dark + mono(black/white) + clear-space padded\n`);
  process.stdout.write(`  primitives: marks/lockups/wordmark also as PNG (@1x + @2x) + clear-space diagram\n`);
  process.stdout.write(`  apps      : ${SURFACES.map((s) => s.name).join(", ")} (SVG + PNG${SURFACES.some((s) => s.webp) ? "/WebP" : ""} + favicon.ico)\n`);
  process.stdout.write(`  stickers  : ${STICKERS.map((s) => s.name.replace(/^sticker-/, "")).join(", ")} (print PDF + ${STICKER_DPI}dpi PNG + proof)\n`);
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
