---
name: brandkit-generate
description: Generate or extend a brand kit with brandkit-generator — the recolor slot model, font-metric lockup layout, OKLCH palette derivation, surface presets, and output conventions. Use when working on generation logic, adding a surface/preset, debugging layout or contrast, or running a build.
---

# brandkit-generate

How to build/run/extend the generator. The governing principles and defaults live in `CLAUDE.md` — this skill is the operational how-to. Adhere strictly to the design principles; act as an experienced logo/product designer.

## Run

```bash
npm run generate                                  # build the full kit into dist/ (reads brandkit.config.yaml)
npm run generate -- --config c.yaml --out dir     # explicit config / output dir
npm run generate -- --validate-only               # resolve config + print plan, no render
npm test                                          # palette + layout unit tests
npm run typecheck                                 # tsc --noEmit
```

The single command is `generate` (`src/commands/generate.ts`). Output is fully deterministic — re-running produces byte-identical files (PDF metadata is pinned).

## Stage [0] — AI logo analysis (advisory, once, cached) — **DEFERRED / not built**

Designed but not implemented; there is no `analyze` command yet. `logo.slots` are hand-mapped in the config. When built: `analyze` is the only stage that calls the API, and it's optional. **AI proposes design judgment; deterministic code makes every number and pixel.**

- Render the logo SVG to PNG (resvg-js), send PNG + raw SVG text to **Claude Opus 4.8** (`claude-opus-4-8`) with a **structured-output schema** (`output_config.format`) so the returned JSON is schema-enforced. Auth via the Anthropic SDK chain (`ANTHROPIC_API_KEY` or `ant auth login` profile) — don't hardcode a key.
- Write `logo.analysis.json` next to the config: `{ unit, slots, roles[], recolor{light,dark}, variants, risks[], notes }`. It is **committed and human-editable** — treat it as truth once written.
- `generate` reads the cache; **it must never call the API.** If the file is absent, fall back to heuristics (distinct-fill extraction, luminance knockout detection, largest-area-fill = background) and prompt the user to confirm/hand-edit `logo.slots`.
- Recolor decisions are **AI-proposed, human-approved** — surfaced in `preview.html`, overridden by editing `logo.analysis.json`. Re-run only on `--reanalyze` or a logo-file hash change (record the hash in the artifact).
- The model may hallucinate; **never let it emit hexes it computed or contrast ratios** — those are code. It maps roles and proposes strategy only.

## The config contract

Required: `brand.title`, `logo.src`, `color.primary`. Everything else optional (defaults in CLAUDE.md). Validate with the zod schema in `src/config/schema.ts`; the schema *fills defaults*, so downstream code always sees a fully-resolved config. Exact per-theme anchors go in `color.light`/`color.dark` (`{bg,fg,accent}`) and win over derived values.

## Stage-by-stage

**[2] Theme resolve — recolor via color slots.** The input SVG's brand fills are mapped to token roles. `logo.slots` maps a source hex → a semantic token (e.g. `primary → color.brand.primary`). Recolor = replace slotted fills with the theme's resolved token value. Prefer rewriting fills to `currentColor` / CSS vars where the SVG allows; fall back to hex substitution. Never recolor outside the palette.

**[3] Primitives.** Emit the isolated `mark` (recolored variants) and the standalone `wordmark` (title text outlined via fontkit, tight-cropped, per-theme ink — no runtime font dependency). `subtitle` primitive is deferred until a config subtitle exists. These are masters; everything composes from them.

**[4] Lockups — font-metric layout.** Use `fontkit` to get cap-height, ascent/descent, and glyph advances. Compute `X = mark height`. Then:
- horizontal: `[mark][gap = 0.3X][text block]`; align mark cap-height to title cap-height (optical center), not bbox.
- vertical: mark above text, centered on optical axis; vertical gap = 0.3X.
- The tight-bbox lockup is the master; the clear-space padded variant (`padViewBox`, +0.5X all sides) is the drop-in. A `clearspace-diagram` visualizes the exclusion zone.
- Variants built: `{horizontal,vertical} × {light,dark}`, plus mono (single-ink black/white) horizontal lockups. (title+subtitle deferred.)
Never hardcode px — everything in units of X (the lockup builder uses X = 100).

**[5] Applications — surface presets.** Each preset is a data entry: `{ name, width, height, safeArea, source: mark|lockup, background: bg|primary|transparent }`. Small surfaces (favicon/avatar/app icon) MUST use `source: mark`. Respect safe areas (maskable 80%, avatar circle-safe, OG margins).

**[6] Rasterize/export.** SVG master → `resvg-js` → PNG; `sharp` for resize, WebP/AVIF, and ICO assembly; `svg-to-pdfkit` for PDF. Emit densities @1x/2x/3x. Determinism: no timestamps/random.

**[7] Emit.**
- Tokens: DTCG JSON (`$value`/`$type`) + Tailwind `@theme`/config. Both themes.
- `preview.html`: self-contained (inline assets), light/dark toggle, every asset in both themes.
- `brand-spec.md`: applied scale/weights/tracking/clear-space/gap + palette (hex+OKLCH) + WCAG contrast audit table.
- `guidelines.md`: generated from the same rules (clear-space diagram values, min-size, do/don't, color usage).
- `manifest.json`: every asset with dimensions + intended use.

## Palette derivation (OKLCH)

From `primary` (+ `accent`/`secondary` if given): build an 11-step ramp (50→950) by varying OKLCH lightness on a fixed curve while holding hue and clamping chroma in-gamut. Map ramp steps to semantic tokens for light; derive dark by inverting the lightness curve. Validate every fg/bg pairing at WCAG AA (4.5:1 text, 3:1 UI); auto-nudge *derived* fg lightness until it passes; keep but flag failing *user* colors.

## Adding a surface

Add a preset object to the surface preset list (`src/surfaces/presets.ts`) — name, dimensions, safe area, source, background. Do NOT write bespoke rendering code. Then it flows through stages 5–7 automatically and appears in preview + manifest.

## Checklists

Before considering a build correct:
- [ ] No px hardcoded in layout — all spacing in units of X.
- [ ] Small surfaces use the mark only.
- [ ] Aspect ratio preserved everywhere; no distortion.
- [ ] Every asset has padded + tight variants.
- [ ] Contrast audit passes AA or flags are surfaced.
- [ ] preview.html renders both themes; brand-spec.md explains decisions.
- [ ] Output is deterministic (re-run produces identical bytes).
