# Palette-Tool Landscape Teardown — one stealable idea per tool

## ML / generative

**huemint.com** — *Contrast-graph-conditioned generation.* Palettes are conditioned on an **n×n adjacency matrix** of target CIE Delta-E contrasts (0 = don't care, 1 = no contrast, 100 = max). Each preset (`/website-1/`, `/illustration-1/`, `/brand-intersection/`, poster, transparent) is literally a different matrix + layout SVG. API: `POST https://api.huemint.com/color` with `{mode: "transformer"|"diffusion"|"random", num_colors: 2–12, temperature: 0–2.4 (default 1.2), num_results: ≤50 transformer / ≤5 diffusion, adjacency: [flat n² array of strings], palette: ["#ff0000","-","-"]}`. Transformer = 4096-token K-means color codebook, top-p 0.8. Trained on 1.2M flat-color designs.
**STEAL:** the adjacency matrix as the *primary UI object*. Let the user draw their layout and derive the matrix from element nesting — then generation is layout-aware for free. **BEAT:** huemint's matrix editor is a raw number grid and results are hex-only, no scales, no tokens, no dark mode. Nobody has fused "layout-conditioned generation" with "12-step token export."

**colormind.io** — *Lock-and-refill.* `POST http://colormind.io/api/` body `{"model":"default","input":[[44,43,44],[90,83,82],"N","N","N"]}`; `"N"` = fill me. Models `default` and `ui` always available; `GET http://colormind.io/list/` returns today's rotating model set. Note: *input colors may shift slightly* — it re-harmonizes rather than pinning.
**STEAL:** the `"N"` slot API shape — partial palette in, complete palette out. **BEAT:** it's HTTP-only (mixed-content blocked), 5 colors fixed, no HTTPS. A drop-in HTTPS clone with lock semantics that *actually* pins is a trivial win.

**khroma.co** — *Train-then-generate.* User picks ~50 liked colors once; a browser-side NN then generates only combos matching that taste. Outputs render as poster/typography/gradient/palette/custom-image. Search/filter by hue, tint, value, hex, rgb.
**STEAL:** the one-time 50-swatch onboarding as a *persistent personalization vector* stored locally — every later generation is re-ranked against it. **BEAT:** khroma only ever emits pairs/quads, never scales, and the taste vector is trapped in the site.

**Pantone × Microsoft "Palette Generator"** (2026) — conversational prompt → palette, backed by Pantone's licensed library. **STEAL:** nothing technical; note that "type a vibe" is now table stakes and brand-library backing is the moat.

## Live preview & state

**realtimecolors.com** — *URL-as-state + role model.* `https://www.realtimecolors.com/?colors=000000-ffffff-8fb3ff-ebf1ff-623046&fonts=Poppins-Poppins` — five dash-joined hexes, no `#`, in fixed role order **text-background-primary-secondary-accent**. Shortcuts: **Space** randomize, **←/→** undo/redo, **Alt+T** dark/light, **Ctrl+E** export, **Ctrl+S** share link. Exports HEX/RGB/HSL/OKLAB/OKLCH as CSS vars, Tailwind config, SCSS, plus **custom code templates** with a `${colorName.format.shade}` interpolation syntax (e.g. `${primary.rgb.50}`) and presets for daisyUI, shadcn, NextUI, Flutter, Bootstrap, MUI, Chakra. Contrast badge is tri-state (✗ red / – yellow AA / ✓ green AAA). There's even a third-party `tailwind-plugin-realtime-colors` that reads the URL at build time.
**STEAL (highest value on this list):** the **user-authorable export template with `${token.format.shade}` placeholders**. It turns "add support for framework X" from a code change into a user-created string. Also steal the flat, no-hash, dash-joined URL — it's human-editable and diffable.
**BEAT:** its 5 roles can't express semantic states (success/warn/danger), the preview is one fixed marketing page, and there's no OKLCH-native editing — only OKLCH *output*.

**happyhues.co** — 17 palettes, each shown on a live page where every swatch is labeled by **role**: background, headline, sub-headline, button, button-text, card, card-text, stroke, main, highlight, secondary, tertiary.
**STEAL:** the explicit *illustration* roles (stroke/main/highlight/secondary/tertiary) alongside UI roles — nobody else assigns palette slots to non-UI art. **BEAT:** hand-curated and static; role assignment could be generated.

## Harmony wheels

**paletton.com** — Works in a **RYB (artist's) wheel**, not RGB/HSL, so complements are red↔green, blue↔orange. 1–4 hues × 5 shades, monochromatic/adjacent/triad/tetrad ±complement, with an **adjustable angular distance** slider between hues rather than fixed 30/60/120° presets. Exports HTML/CSS/XML tables, plus web/UI/random-image preview modes and colorblind simulation.
**STEAL:** the **continuous hue-distance slider** (drag the satellites apart) instead of discrete harmony buttons — harmony as a spectrum. **BEAT:** RYB is legacy; do the same continuous-distance UI on the **OKLCH hue circle**, where equal angular steps are actually perceptually equal.

**Adobe Color** — Harmony wheel + **Accessibility Tools**: contrast checker (WCAG 2.1 AA/AAA), **Color Blind Safe** check that flags conflicting pairs for protanopia/deuteranopia/tritanopia *inside the wheel* and offers a one-click fix, plus extract-theme-from-image and extract-gradient-from-image.
**STEAL:** conflict detection surfaced **on the wheel itself** — mark the arc regions where a second hue would collide under each CVD type, so the user can't pick a bad hue in the first place. Prevention beats post-hoc auditing.

## Scale generation (the real engineering)

**Leonardo / leonardocolor.io** — *Contrast-first, not lightness-first.* npm `@adobe/leonardo-contrast-colors`. `new Color({name, colorKeys: [...], colorspace: 'CAM02'|'LCH'|'LAB'|'HSL'|'HSLuv'|'HSV'|'RGB', ratios: [3, 4.5, 7] or {'text-lo':4.5}, smooth: false})`; `new Theme({colors, backgroundColor, lightness: 0–100, contrast: 1, saturation: 0–100, output: 'HEX'|'RGB'|'HSL'|'LAB'|'LCH'|'CAM02'})`. Getters: `contrastColors`, `contrastColorPairs`, `contrastColorValues`.
**STEAL:** **you specify ratios, the tool solves for the color.** `theme.lightness` then slides the whole system light↔dark and every swatch *re-solves* to hold its ratio. That single knob is the cleanest dark-mode story in the entire landscape.

**apcach** (Evil Martians / antiflasher) — npm `apcach`, the JS engine under Harmonizer. `apcach(60, 0.2, 145) → oklch(62.5% 0.2 145)` — args are (APCA Lc 0–108, chroma 0–0.37, hue). Contrast configs: `crToBg("#E8E8E8", 60)`, `crToFg("white", 60)`, `crToBgBlack(60)`, `crToBgWhite(60)`. `maxChroma(0.25)` in the chroma slot finds the most saturated in-gamut color at that Lc+hue. Mutators `setContrast(c, 70 | cr => cr+10)`, `setChroma`, `setHue`. Output `apcachToCss(c, 'oklch'|'rgb'|'hex'|'p3'|'figma-p3')`, inverse `cssToApcach(css, {bg: '#fff'})`. Options: contrast model `"apca"` (default) or `"wcag"`; search direction `"lighter"|"darker"|"auto"`; color space `"p3"` (default) or `"srgb"`.
**STEAL:** `maxChroma()` — "give me the *most vivid* color that still hits Lc 60 on this background." That's the single most useful primitive nobody exposes in a UI.

**Harmony / Harmonizer** (Evil Martians) — npm `@evilmartians/harmony`. Sells two guarantees: **equal contrast within a lightness group** (every hue at level N has identical APCA Lc) and **mirrored contrast pairs** (level N on level M works iff M on N). Ships CSS vars, JS objects, P3, Tailwind v3+v4.
**STEAL:** the *invariant* framing. Don't market "nice colors" — market "level 500 of every hue is Lc 60 on white, guaranteed." That's a testable property.

**ColorBox by Lyft** (colorbox.io, `github.com/lyft/coloralgorithm`) — Curve-driven: inputs are `steps`, `hue` start/end + `hue curve`, `saturation` start/end + `saturation curve` + **`saturation rate`** (a multiplier that skews the curve), `luminosity` start/end + curve — curves are easing functions (`easeInQuad`, `easeOutQuad`, `linear`…). The published contract: **every step 0–50 is 4.5:1 on black, every step 60–100 is 4.5:1 on white.**
**STEAL:** separate easing curves per channel with a live curve graph. Hue-shift-across-the-ramp (warm highlights, cool shadows) is what makes generated scales stop looking machine-made.

**tints.dev / uicolors.app** — Tailwind 50→950 (11 stops). Controls: base hex (assignable to *any* stop, not just 500), **hue shift**, **saturation boost at the extremes**, and min/max with a **Lightness vs. Luminance toggle** — luminance mode spreads the ends toward true white/black perceptually. tints.dev has a REST API but it accepts base hex only, no HSL tweaks.
**STEAL:** "which stop is my brand color?" — pinning the input to stop 700 instead of 500 is a two-line feature that everyone needs and almost nobody offers. **BEAT:** their APIs don't round-trip the tweaks; make yours encode every knob in the URL.

**Material Color Utilities / HCT** — npm `@material/material-color-utilities`. **HCT** = CAM16 Hue + Chroma spliced onto **L\* tone** (0–100), so tone is a direct contrast proxy: a tone difference of 40 ≈ 3:1, 50 ≈ 4.5:1. Scheme variants (`SpecVersion.SPEC_2025` now available): **TonalSpot** (default), **Vibrant** (max chroma per position), **Expressive** (deliberately rotates primary hue off the seed), **Fidelity** (hugs the seed exactly), **Content**, **Rainbow**, **FruitSalad**, **Neutral**, **Monochrome**. Plus image quantization (Celebi) + scoring to pick a seed from a photo.
**STEAL:** **one seed → complete named role set** (primary/onPrimary/primaryContainer/onPrimaryContainer/surface/surfaceVariant/outline…) in both light and dark, with the variant enum as a *style dial*. Also steal "tone delta = contrast" as the mental model; it's far easier to teach than ratios.

**Radix Colors** — npm `@radix-ui/colors`, 12 steps with hard semantics: **1** app bg, **2** subtle bg, **3** component bg, **4** hover, **5** active/selected, **6** subtle border (non-interactive), **7** interactive border, **8** strong border/focus ring, **9** solid fill (highest chroma, the brand color), **10** hovered solid, **11** low-contrast text (**Lc 60 APCA on step 2**), **12** high-contrast text (**Lc 90 on step 2**). Matching **alpha** scales for blending onto colored backgrounds, and **P3 definitions specifically because alpha blending differs in P3 vs sRGB**. Light/dark scales are index-compatible. Sky/Mint/Lime/Yellow/Amber are flagged as "step 9 needs dark text."
**STEAL:** the **step→job mapping**, verbatim. It converts a palette from decoration into an API. Also steal the alpha companion scale — it's the difference between a palette that works on white and one that works on a photo. **BEAT:** Radix's own custom-palette generator is a black box that just matches you to existing scales; a transparent, parameterized 12-step generator with the same semantics is a genuine gap.

**Open Props** — npm `open-props`. 18 hues (gray, stone, red, pink, purple, violet, indigo, blue, cyan, teal, green, lime, yellow, orange, choco, brown, sand, camo, jungle) × 13 stops → `--blue-0` … `--blue-12`, plus `--{hue}-hsl` companions for `hsl(var(--gray-9-hsl) / 30%)`. Also 16 **OKLCH palette variables** driven by `--palette-hue`, `--palette-hue-rotate-by`, `--palette-chroma` — one hue variable repaints the whole system. Plus `--gradient-1..30`, `--shadow-1..6`, `--inner-shadow-0..4`, `--ease-1..5` + elastic/spring/bounce.
**STEAL:** **`--palette-hue-rotate-by`** — express the *whole* palette as relative offsets from one hue var so rebranding is one number. That's a runtime-themeable palette with zero build step.

**Tailwind v4 default palette** — 22 hues × 11 stops, all authored in **OKLCH** and exposed as `--color-blue-500` etc. (not a JS config), tuned so hexes stay near-identical to v3 while gaining P3 vividness at the saturated ends.
**STEAL:** ship colors as **CSS custom properties in OKLCH as the source of truth**, with sRGB hex as a derived fallback — not the reverse.

**atmos.style** — OKLCH/LCH playground with gamut-limit-aware pickers (sRGB / Display P3), easing-curve shade generator, **hue transition** across a ramp, **semantic generation** (derive success/warning/danger/info *from* the primary), APCA (WCAG 3) + WCAG 2.1 checkers, CVD vision simulator, **version history**, shared links, Figma plugin.
**STEAL:** **auto-derived semantic colors** — take the primary's chroma/tone profile and transplant it onto the canonical green/amber/red/blue hues so the status colors feel like they belong to the brand. Also steal version history; palettes are iterated, and nobody else lets you go back.

**Poline** (meodai) — npm `poline`. Palettes as **geometry**: anchor points in HSL mapped to polar/Cartesian space, colors sampled *along the curve between anchors*. `new Poline({anchorColors: [[309,0.72,0.8],[67,0.32,0.08]], numPoints: 6, positionFunctionX/Y/Z: sinusoidalPosition})` — position functions include `linearPosition`, `sinusoidalPosition` (default), `exponentialPosition`, `quadraticPosition`, `cubicPosition`, and can differ **per axis**. Methods: `shiftHue()` (animate the whole palette), `addAnchorPoint()`, `updateAnchorPoint()`, `getColorAt(t)`.
**STEAL:** **`getColorAt(t)` — the palette as a continuous function, not a list.** Any number of steps, on demand, plus free animation via `shiftHue()`. This is the cleanest data model in the whole space and almost nothing else has it.

## Curation & long tail

**colorhunt.co** — Fixed 4-color palettes, tag taxonomy, likes tied to IP (one per palette), permalink per palette, `/palettes/popular`. **STEAL:** the constraint — exactly 4, no options, infinite scroll. Zero-decision browsing is why it wins on traffic. **BEAT:** it's a dead end; a "open this in the editor" button from a curated grid converts browsers into users.

**colorffy.com** — 8 harmony types computed at once (complementary, analogous, monochromatic, split-complementary, triadic, tetradic, rectangle, double-split), **Oklab**-based generator, light-theme *and* dark-theme generators, mesh gradients + text gradients, 2000+ curated palettes. Exports Tailwind, CSS, PNG, PDF, and **native tokens for Swift, Flutter, Android, .NET**. **STEAL:** show *all* harmonies simultaneously rather than making the user pick a mode — comparison is faster than configuration. Also: native-platform token export is an under-served niche.

**tweakcn.com** — The current center of gravity for shadcn/Tailwind theming: paste your existing `globals.css`, edit visually (colors, radius, typography, shadows), live preview across real shadcn components, export back to `globals.css`; Tailwind v3+v4, OKLCH and HSL; AI theme from a prompt ("a theme inspired by Supabase") or an uploaded image. **STEAL:** **round-trip on the user's own file.** Import existing CSS → edit → export the same file. Every other tool assumes greenfield, which is why they lose to this one.

## Supporting stack
`culori` (fastest conversions, tree-shakeable), `colorjs.io` (spec-grade, gamut mapping), `@material/material-color-utilities`, `apcach`, `poline`, `@adobe/leonardo-contrast-colors`, `@evilmartians/harmony`, `@radix-ui/colors`, `open-props`. Figma plugins worth noting: **OkColor**, **Polychrom** (APCA contrast audit of live layers), **Harmonizer**.

## Where the gap actually is
No single tool combines: (1) huemint's **layout-conditioned** generation, (2) Radix's **semantic 12-step contract + alpha scales**, (3) Leonardo/apcach's **solve-for-contrast** math with `maxChroma`, (4) realtimecolors' **URL state + user-authored export templates**, (5) tweakcn's **round-trip on the user's existing file**, and (6) Poline's **continuous `getColorAt(t)`** data model. That combination is the product.