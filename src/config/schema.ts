import { z } from "zod";

/**
 * The brand config contract.
 *
 * Prime directive: convention over configuration. Only three things are
 * required — brand.title, logo.src, color.primary. Every other field is
 * optional and carries an industry-standard default (see CLAUDE.md), so
 * downstream pipeline stages always receive a fully-resolved config.
 */

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const hex = z.string().regex(HEX, "must be a hex color like #3B82F6");

// ── brand ────────────────────────────────────────────────────────────────
const brand = z.object({
  title: z.string().min(1, "brand.title is required"),
  subtitle: z.string().min(1).optional(),
});

// ── logo ─────────────────────────────────────────────────────────────────
// `slots` maps a source hex in the SVG to a semantic role, so the mark can be
// recolored per theme without touching the source file.
const logo = z.object({
  src: z.string().min(1, "logo.src is required"),
  slots: z.record(z.string(), hex).default({}),
});

// ── color ────────────────────────────────────────────────────────────────
// primary is required; accent/secondary feed palette generation. `light`/`dark`
// let advanced users override specific derived semantic tokens.
const semanticOverride = z.record(z.string(), hex).optional();
const color = z.object({
  primary: hex,
  accent: hex.optional(),
  secondary: hex.optional(),
  light: semanticOverride,
  dark: semanticOverride,
});

// ── typography ─────────────────────────────────────────────────────────────
const fontRole = z.object({
  family: z.string().default("IBM Plex Sans"),
  weight: z.number().int().min(100).max(900).default(400),
});
const typography = z
  .object({
    source: z.enum(["google", "local"]).default("google"),
    base: z.number().positive().default(16),
    scale: z.number().positive().default(1.25), // major third
    // Roles: `title` = display/headings, `body` = running text, `mono` = code.
    title: fontRole.default({ family: "Space Grotesk", weight: 700 }),
    subtitle: fontRole.default({ family: "IBM Plex Sans", weight: 400 }),
    body: fontRole.default({ family: "IBM Plex Sans", weight: 400 }),
    mono: fontRole.default({ family: "JetBrains Mono", weight: 400 }),
    // subtitle size as a ratio of the title cap-height
    subtitleRatio: z.number().positive().default(0.4),
    trackingDisplay: z.number().default(-0.02), // em
    trackingSubtitle: z.number().default(0.05), // em, for small-caps
  })
  .default({});

// ── layout ───────────────────────────────────────────────────────────────
// All spacing is expressed as a multiple of the brand unit X (mark height).
const layout = z
  .object({
    unit: z.enum(["mark-height", "cap-height"]).default("mark-height"),
    clearSpace: z.number().nonnegative().default(0.5), // × X, exclusion zone
    gap: z.number().nonnegative().default(0.3), // × X, mark → text
    align: z.enum(["cap-height", "baseline", "optical"]).default("optical"),
    minSizePx: z.number().positive().default(24),
    faviconFloorPx: z.number().positive().default(16),
    gridPx: z.number().positive().default(8),
  })
  .default({});

// ── palette ──────────────────────────────────────────────────────────────
const palette = z
  .object({
    steps: z
      .array(z.number().int())
      .default([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]),
    // WCAG target for auto-correcting derived foregrounds
    contrast: z.enum(["AA", "AAA"]).default("AA"),
    // derive dark theme from light unless a full dark override is supplied
    deriveDark: z.boolean().default(true),
  })
  .default({});

// ── output ───────────────────────────────────────────────────────────────
const output = z
  .object({
    dir: z.string().default("dist"),
    formats: z
      .array(z.enum(["svg", "png", "webp", "avif", "pdf", "ico"]))
      .default(["svg", "png", "webp", "avif"]),
    densities: z.array(z.number().positive()).default([1, 2, 3]),
    tokens: z.array(z.enum(["dtcg", "tailwind"])).default(["dtcg", "tailwind"]),
    preview: z.boolean().default(true),
  })
  .default({});

// ── surfaces ───────────────────────────────────────────────────────────────
// Data-driven presets. Adding a platform (e.g. an X banner) is a new entry
// here — never bespoke rendering code.
const surface = z.object({
  preset: z.string(),
});
const DEFAULT_SURFACES = [
  { preset: "favicon" },
  { preset: "avatar" },
  { preset: "og-card" },
  { preset: "header" },
  { preset: "footer" },
  { preset: "banner" },
];
const surfaces = z.array(surface).default(DEFAULT_SURFACES);

// ── root ─────────────────────────────────────────────────────────────────
export const configSchema = z.object({
  brand,
  logo,
  color,
  typography,
  layout,
  palette,
  output,
  surfaces,
});

export type BrandConfig = z.input<typeof configSchema>;
export type ResolvedConfig = z.output<typeof configSchema>;
