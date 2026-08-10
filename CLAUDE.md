# brandkit-generator

A config-driven, **opinionated** brand-asset generator. Feed it a tiny brand config (logo, title, primary color) and it deterministically produces a complete, reusable brand kit — logo variants, lockups, avatars, favicons, headers/footers, banners, OG cards — plus color tokens, a rendered preview, and generated guidelines.

## Prime directive: convention over configuration

The tool embodies the judgment of an experienced UI/UX + logo/identity designer. **Users supply the minimum; the tool dictates the rest** from industry standards. Overrides are always possible, never required. See design principles and defaults in the sections below (kept in sync with agent memory: `brandkit-design-principles`, `brandkit-defaults`, `convention-over-config`).

Required config is only: `brand.title`, `logo.src`, `color.primary`. Everything else (subtitle, typography, layout ratios, palette, dark theme, surfaces) is optional and defaulted. Config is a single YAML file, so a one-line change (e.g. adding a subtitle) regenerates the whole kit.

## Non-negotiable design principles

1. **Optical over mathematical.** Align/size by optical weight, not bounding boxes. Lockups align the mark to the wordmark cap-height / optical center; the mark is optically balanced to cap-height, not bbox height.
2. **Clear-space is a ratio, never a magic number.** All padding/gaps are multiples of the brand unit `X` (mark height) and hold at every size. Never hardcode px spacing in layout math.
3. **Never distort.** Preserve aspect ratio always — no stretch/skew/rotation/effects/unapproved recolor of the mark.
4. **Mark, not lockup, at small sizes.** Favicons/avatars/app icons use the isolated mark only. Favicon floor 16px; maskable safe zone 80%; avatars circle-safe.
5. **Accessibility is a gate.** Every fg/bg pairing meets WCAG 2.1 AA; ratios are reported; derived colors auto-corrected; failing user colors kept but flagged.
6. **Color discipline.** Palette derives perceptually in **OKLCH**; usage ~60/30/10; assets consume semantic tokens, not raw hexes.
7. **Two variants per asset:** a clear-space-padded variant (drop-in anywhere) and a tight-bbox variant (manual placement).
8. **One source of truth.** Everything derives from one config; nothing placed twice; **guidelines are generated, not authored**, so docs and assets never drift.

## Default standards (applied unless overridden)

| Concern | Default |
|---|---|
| Type scale | Modular, ratio 1.25, base 16px |
| Fonts | title/headings Space Grotesk · body/subtitle IBM Plex Sans · code JetBrains Mono (Google) |
| Weights | Title 700, subtitle 400 |
| Subtitle size | 0.4 × title cap-height |
| Tracking | Display −0.02em; small-caps subtitle +0.05em |
| Clear-space | 0.5 × X (X = mark height) |
| Lockup gap | 0.3 × X |
| Min size | 24px digital, 16px favicon floor |
| Baseline grid | 4 / 8 px |
| Palette | 11-step OKLCH ramp (50→950) from primary (+accent/secondary) |
| Semantic tokens | bg, surface, fg, muted-fg, border, ring, primary, primary-fg, accent, accent-fg |
| Dark theme | Auto-derived from light (OKLCH) unless overridden |
| Contrast | WCAG 2.1 AA; auto-nudge derived fg; report ratios |

## AI logo analysis (advisory, once, cached) — **DEFERRED / not yet built**

> Status: designed but **not implemented**. Current builds are 100% deterministic with no API dependency; `logo.slots` are hand-mapped in the config (which is exactly what this stage would automate). Revisit when generalizing to a multi-brand tool. The design below is the intended future state.

Static fill-mapping can't infer a logo's intent, so an optional AI pass supplies design judgment. **AI proposes; deterministic code makes all numbers and pixels — the AI never touches output.**

- `brandkit analyze` calls **Claude Opus 4.8** (`claude-opus-4-8`, vision + structured outputs) once with the rendered logo + raw SVG, and writes a schema-validated, **committed, human-reviewable `logo.analysis.json`** (roles, auto-filled `logo.slots`, per-theme recolor strategy, optical clear-space unit, monochrome viability, risk flags).
- `generate` **never calls the API** — it reads the cached `logo.analysis.json`, or falls back to deterministic heuristics (distinct-fill extraction, luminance knockout detection, largest-area = background) and prompts for slot confirmation. Zero runtime API dependency by default.
- **Recolor is AI-proposed, human-approved:** review in `preview.html`, override by editing `logo.analysis.json`. Re-run analysis only on `--reanalyze` or a logo-hash change.

## Pipeline (deterministic, cached — nothing hand-placed twice)

`config (+ cached logo.analysis.json) → [1] load+validate → [2] resolve theme (recolor SVG via approved color slots) → [3] primitives (isolated mark/wordmark/subtitle, both themes) → [4] lockups (h+v × mark/title/title+sub, font-metric layout, clear-space) → [5] applications (favicon/avatar/og/header/footer/banner) → [6] rasterize+export (svg/png/webp/avif/ico/pdf, densities) → [7] emit (DTCG + Tailwind tokens, preview.html, brand-spec.md, guidelines.md, manifest.json)`

Stage [0] `analyze` is separate from `generate`: it produces the cached artifact the pipeline consumes. Keep it out of the deterministic hot path.

## Stack

Node + TypeScript CLI. zod (validate) · culori (OKLCH + WCAG) · fontkit (glyph outlining) · resvg-js (SVG→PNG) · sharp (resize/WebP/AVIF/ICO) · pdfkit + svg-to-pdfkit (PDF) · Google fonts **bundled via `@fontsource`** (outlined into assets — deterministic, offline). `@anthropic-ai/sdk` is for the deferred analyze stage only. Config is YAML. Command: `npm run generate` (with `--validate-only` / `--help`).

## Output layout (`dist/`)

```
logo/     mark-{mono,duotone-light,duotone-dark,on-accent} · logo-original · wordmark-{light,dark}
          lockup-{horizontal,vertical}-{light,dark} · lockup-horizontal-mono-{black,white}
          lockup-horizontal-{light,dark}-clearspace · clearspace-diagram
          (every SVG above also emitted as PNG @1x/@2x; PDF for mark + h-lockups + wordmark)
apps/     favicon.svg/.ico + favicon-*.png · apple-touch · maskable · avatar · og-card
          header · footer · banner · x-banner · linkedin-* · site.webmanifest · favicon-tags.html
tokens/   tokens.json (DTCG) · tailwind.theme.css
preview.html · brand-spec.md · guidelines.md · manifest.json
```

(Note: `subtitle` primitive and clear-space-padded variants of *every* asset are per the design principles; currently the wordmark + padded/mono variants exist for the lockup. Subtitle is deferred until a config subtitle is set.)

## Conventions

- Every asset also appears in `manifest.json` with dimensions + intended use.
- Prefer pure functions per pipeline stage; stages take resolved config + prior artifacts and return artifacts.
- Determinism: no `Date.now()`/random in output; cache font + palette derivation.
- When adding a surface (e.g. an X/LinkedIn banner), add a **preset entry**, not bespoke code.
