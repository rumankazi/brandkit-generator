# brandkit-generator

An **opinionated, config-driven brand-asset generator**. Give it a logo, a title, and a primary color; it deterministically produces a complete, reusable brand kit — recolored logo variants, cap-height-aligned lockups, favicons/avatars/OG cards/headers/footers/banners — plus color tokens (DTCG + Tailwind), a rendered preview in light and dark, and generated brand guidelines.

It behaves like an experienced logo/product designer: you supply the minimum, and the tool applies industry-standard rules for scale, weight, spacing, palette, and contrast — explaining every decision. Overrides are always possible, never required.

## Quick start

```bash
npm install
npm run generate                    # build the full kit into dist/ (reads brandkit.config.yaml)
npm run generate -- --validate-only # just resolve the config and print the plan
open dist/preview.html              # visual QA: everything, light + dark
```

The minimal config is three fields; everything else is defaulted:

```yaml
brand:
  title: "Pipeline Team"
logo:
  src: "./assets/logo.svg"
  slots: { primary: "#0969DA", neutral: "#868686" }   # source fills → roles
color:
  primary: "#0969DA"
  light: { bg: "#FFFFFF", fg: "#0D1117", accent: "#0969DA" }   # optional exact anchors
  dark:  { bg: "#0D1117", fg: "#F0F6FC", accent: "#4493F8" }
```

See `brandkit.config.example.yaml` for every overridable field.

## What it generates (`dist/`)

```
logo/     mark-{mono,duotone-light,duotone-dark,on-accent}.svg
          lockup-{horizontal,vertical}-{light,dark}.svg   (outlined glyphs, cap-height aligned)
apps/     favicon.svg (theme-adaptive) + favicon-{16..512}.png + favicon.ico
          apple-touch-icon · maskable · avatar · og-card · header · footer · banner
          (SVG + PNG, WebP where useful, @2x/@3x for display surfaces)
tokens/   tokens.json (DTCG) · tailwind.theme.css
preview.html · brand-spec.md · guidelines.md · manifest.json
```

## How it works

Deterministic pipeline, one config in:

1. **Palette** — OKLCH ramps (50→950) from the primary; semantic tokens for light + dark; every fg/bg pairing auto-corrected + audited to WCAG AA.
2. **Logo** — recolor the source SVG into duotone / mono (`currentColor`) / on-accent variants via the color slots.
3. **Lockups** — outline the wordmark with fontkit and align its cap-height to the mark; spacing in ratios of X (mark height).
4. **Applications** — data-driven surface presets composited on themed backgrounds, then rasterized (resvg → sharp → png-to-ico).
5. **Emit** — tokens, preview, generated guidelines, and a manifest.

## Design principles & standards

See [`CLAUDE.md`](./CLAUDE.md) for the non-negotiable design principles, the default standards table, and the pipeline. Operational how-to lives in the `brandkit-generate` skill under `.claude/skills/`.

## Stack

Node + TypeScript. `zod` (validate) · `culori` (OKLCH + WCAG) · `fontkit` (glyph outlining) · `@resvg/resvg-js` (SVG→PNG) · `sharp` (WebP/AVIF) · `png-to-ico` · Google fonts bundled via `@fontsource` for deterministic offline builds. Config is YAML.

## Status

Built for the Pipeline Team brand as the first fixture; the architecture is config-driven so generalizing to any brand is "add a second config." An optional AI logo-analysis step (Claude vision) is designed but deferred — see `CLAUDE.md`.
