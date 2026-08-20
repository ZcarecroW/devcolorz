# Design-Token Export Formats — What a Color Tool Should Emit in 2026

## 1. Plain CSS Custom Properties (the baseline, must be format-switchable)

Offer a **color-notation picker**: `hex`, `rgb()`, `hsl()`, `lab()`, `lch()`, `oklab()`, `oklch()`, `color(display-p3 …)`. Space-separated modern syntax, no commas. As of 2026 `oklch()` is in all evergreen browsers (Chrome/Edge 111+, Safari 15.4+, Firefox 113+, ~93–95% global); relative color syntax is Baseline since Sept 2024; `light-dark()` Baseline since May 2024.

```css
:root {
  color-scheme: light dark;
  --brand-500: oklch(62.8% 0.199 258.3);            /* primary notation */
  --brand-500-p3: color(display-p3 0.243 0.463 0.949);
  --surface: light-dark(oklch(98% 0 0), oklch(18% 0.01 258));
}
@supports not (color: oklch(0% 0 0)) {              /* sRGB fallback tier */
  :root { --brand-500: #3b76f2; }
}
```

Also emit a **relative-color-syntax variant** (`oklch(from var(--brand-500) calc(l - .08) c h)`) and a `@property` block for animatable tokens — almost no competitor ships either. Differentiator.

## 2. Tailwind v4 `@theme`

The **`--color-` prefix is mandatory**: Tailwind derives utilities from the namespace, not from a config. Namespaces: `--color-*`, `--spacing-*`, `--font-*`, `--text-*`, `--font-weight-*`, `--tracking-*`, `--leading-*`, `--radius-*`, `--shadow-*`, `--inset-shadow-*`, `--drop-shadow-*`, `--blur-*`, `--breakpoint-*`, `--container-*`, `--ease-*`, `--animate-*`, `--aspect-*`, `--perspective-*`, `--tab-size-*`, `--zoom-*`.

```css
@import "tailwindcss";
@theme {
  --color-*: initial;                 /* wipe default palette */
  --color-brand-50:  oklch(97.1% 0.014 258.3);
  --color-brand-500: oklch(62.8% 0.199 258.3);
  --color-brand-950: oklch(28.2% 0.091 258.3);
}
```
Variants to expose: `@theme inline` (emit value, not `var()` — required when the token references another variable, e.g. `--color-primary: var(--brand-500)`), `@theme static` (emit all vars even if unused). Note `--color-*: initial` vs `--*: initial` (nukes everything).

## 3. Tailwind v3 config (still needed — huge installed base)

```js
// tailwind.config.js
module.exports = { theme: { extend: { colors: {
  brand: { 50:'#f2f6ff', 500:'#3b76f2', 950:'#101f42' },
}}}}
```
Plus the "CSS-var indirection" flavor v3 users want for theming: `brand: { 500: 'rgb(var(--brand-500) / <alpha-value>)' }` with `--brand-500: 59 118 242;` — the channel-triple trick. Pitfall to warn about: don't reuse an existing scale key (`base` collides with `text-base`).

## 4. SCSS / LESS — variables **and** maps

```scss
$brand-50: #f2f6ff !default;
$brand-500: #3b76f2 !default;
$brand: (
  50: $brand-50,
  500: $brand-500,
);              // flat: scss/map-flat, nested: scss/map-deep
```
```less
@brand-500: #3b76f2;
#brand() { .500() { @value: #3b76f2; } }   // LESS detached-ruleset "map"
```
Emit `!default` flags (Style Dictionary does) so consumers can override before import.

## 5. W3C / DTCG Design Tokens JSON — **current shape matters**

Latest published draft: **Design Tokens Format Module 2025.10** (Draft CG Report, 30 July 2026). Big change most tools haven't caught up on: **`$value` for `color` is now an object, not a hex string.**

```json
{
  "$schema": "https://www.designtokens.org/schemas/2025.10/format.json",
  "brand": {
    "$type": "color",
    "500": {
      "$value": { "colorSpace": "oklch", "components": [0.628, 0.199, 258.3], "alpha": 1, "hex": "#3b76f2" },
      "$description": "Primary action color.",
      "$extensions": { "com.yourtool.contrast": { "onWhite": 4.62 } }
    },
    "primary": { "$type": "color", "$value": "{brand.500}", "$deprecated": false }
  }
}
```
Rules to implement exactly: `colorSpace` ∈ `srgb`, `srgb-linear`, `hsl`, `hwb`, `lab`, `lch`, `oklab`, `oklch`, `display-p3`, `a98-rgb`, `prophoto-rgb`, `rec2020`, `xyz-d65`, `xyz-d50`. Each component is a number **or the `none` keyword**. `alpha` defaults to 1. `hex` is an optional fallback and **MUST be 6-digit** (no alpha, to avoid conflict with `alpha`). `$deprecated` (bool or string reason) is new. Aliases use `{group.token}`; there is also a `$ref` JSON-Pointer form (`{ "$ref": "#/colors/blue/$value/components/0" }`). `$type` is inheritable from the group. Reserved: token names can't contain `{`, `}`, `$`.

**Differentiator:** ship a toggle for *legacy hex-string DTCG* vs *2025.10 object form*, since Penpot (issue #9305) and others still only accept hex strings, and Tokens Studio/Style Dictionary support is partial. Being the tool that emits both, correctly, is a real win.

## 6. Style Dictionary

Current major is **v5** (Node ≥ 22; default export is DTCG JSON; DTCG files use `.tokens.json`; reference syntax aligned to spec; all color transforms accept both string and `colorSpace/components/alpha/hex` object). Emit a ready-to-run `config.json` plus the token files.

```json
{ "source": ["tokens/**/*.tokens.json"],
  "platforms": {
    "css":     { "transformGroup": "css", "buildPath": "build/css/",
                 "files": [{ "destination": "vars.css", "format": "css/variables" }] },
    "android": { "transformGroup": "android", "files": [{ "destination":"colors.xml", "format":"android/colors" }] },
    "compose": { "transformGroup": "compose", "files": [{ "destination":"Color.kt", "format":"compose/object" }] }
  } }
```
Predefined formats worth naming in your UI: `css/variables`, `scss/variables`, `scss/map-deep`, `scss/map-flat`, `less/variables`, `javascript/es6`, `javascript/module`, `typescript/es6-declarations`, `json/nested`, `json/flat`, `android/resources`, `android/colors`, `compose/object`, `ios-swift/class.swift`, `ios-swift/enum.swift`, `ios/colors.h|.m`, `ios/plist`, `flutter/class.dart`, **`sketch/palette` / `sketch/palette/v2`**.

## 7. Tokens Studio (Figma Tokens) JSON

Two dialects, user-selectable in the plugin — emit both.

```json
// legacy
{ "core": { "brand": { "500": { "value": "#3b76f2", "type": "color", "description": "Primary" } } } }
// W3C DTCG mode
{ "core": { "brand": { "500": { "$value": "#3b76f2", "$type": "color", "$description": "Primary" } } } }
```
Multi-file sets carry sibling `$metadata.json` (`{"tokenSetOrder":["core","semantic","light","dark"]}`) and `$themes.json` (theme objects mapping set names to `enabled`/`source`). Shipping those two files is what makes a drop-in Figma import work — most exporters skip them. **Differentiator.**

## 8. Adobe ASE (+ ACO)

`.ase` = Adobe Swatch Exchange: binary, magic `ASEF`, version 1.0, blocks of color entries + group start/end, RGB/CMYK/LAB/Gray, components as **float32**, spot/global/process flag, UTF-16BE names. `.aco` = Photoshop, binary, v1 = 2-word header + 5-word (uint16) color blocks; v2 appends name-bearing blocks after a full v1 section for backward compat. Color spaces by id: 0 RGB, 1 HSB, 2 CMYK, 7 Lab, 8 Grayscale. JS libs: **`ase-utils`** (0.1.1, `encode`/`decode`), `adobe-swatch-exchange`, `ase-util` (CLI), `swatch` (Python, `swatch.write()`). GIMP 2.10.36+ (Nov 2023) reads `.ase` too.

## 9. GIMP / Inkscape GPL

Trivial to emit, high goodwill:
```
GIMP Palette
Name: Brand
Columns: 11
# Generated 2026-08-20
 59 118 242	brand-500
242 246 255	brand-50
```
Magic first line is literal `GIMP Palette`; three sRGB ints then optional name; `#` = comment.

## 10. Sketch `.sketchpalette`

```json
{ "compatibleVersion": "2.0", "pluginVersion": "2.22",
  "colors": [ { "name": "brand-500", "red": 0.231, "green": 0.463, "blue": 0.949, "alpha": 1 } ],
  "gradients": [], "images": [] }
```
Floats 0–1. (Style Dictionary's `sketch/palette/v2` emits exactly this.)

## 11. SVG swatches & PNG

SVG: one `<rect>` per swatch + `<text>` label + `<title>` for a11y, plus embed the hex in `id`/`data-*` so it round-trips. Ship two layouts (strip and grid-with-labels), `viewBox`-based so it scales.
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 550 100">
  <rect id="brand-500" data-hex="#3b76f2" x="0" y="0" width="50" height="100" fill="#3b76f2"/>
  <text x="25" y="118" font-size="10" text-anchor="middle">500</text>
</svg>
```
PNG: render at 1x/2x, include labels + contrast ratios; the "share on Slack/Twitter" export. Coolors monetizes PDF here — a **PDF with hue/sat/brightness variations** is the thing to beat.

## 12. Android `colors.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<resources>
  <color name="brand_500">#ff3b76f2</color>   <!-- #AARRGGBB, alpha FIRST -->
</resources>
```
Snake_case, alpha-first 8-digit hex. Emit `values/` + `values-night/` pairs for dark mode.

## 13. iOS — SwiftUI + Asset Catalog

```swift
public enum DesignTokens {
  public static let brand500 = Color(red: 0.231, green: 0.463, blue: 0.949, opacity: 1)
  // UIKit variant: UIColor(red: 0.231, green: 0.463, blue: 0.949, alpha: 1)
}
```
Asset catalog `Brand500.colorset/Contents.json`:
```json
{ "info": { "author": "xcode", "version": 1 },
  "colors": [
    { "idiom": "universal", "display-gamut": "sRGB",
      "color": { "color-space": "srgb", "components": { "red": "0.231", "green": "0.463", "blue": "0.949", "alpha": "1.000" } } },
    { "idiom": "universal", "display-gamut": "display-P3", "appearances": [{ "appearance": "luminosity", "value": "dark" }],
      "color": { "color-space": "display-p3", "components": { "red": "0.243", "green": "0.463", "blue": "0.949", "alpha": "1.000" } } }
  ] }
```
`appearances: [{appearance:"luminosity", value:"dark"}]` is how dark variants attach; `display-gamut` gives the P3 pair. Ship it as a **.zip of .colorset folders** — nobody does this well. Differentiator.

## 14. Flutter / Dart

```dart
import 'dart:ui';
class DesignTokens {
  DesignTokens._();
  static const Color brand500 = Color(0xFF3B76F2);          // 0xAARRGGBB
  static const MaterialColor brand = MaterialColor(0xFF3B76F2, <int, Color>{
    50: Color(0xFFF2F6FF), 500: Color(0xFF3B76F2), 900: Color(0xFF101F42),
  });
}
```
Bonus: emit a `ColorScheme.fromSeed(seedColor: …)` line and Material 3 role names.

## 15. Kotlin / Jetpack Compose

```kotlin
package com.acme.tokens
import androidx.compose.ui.graphics.Color
object DesignTokens {
  val Brand500 = Color(0xFF3B76F2)
}
// + lightColorScheme(primary = DesignTokens.Brand500, …) / darkColorScheme(…)
```

## 16. JSON / JS object, and CSV

```js
export const colors = { brand: { 50: "#f2f6ff", 500: "#3b76f2" } };
export type ColorToken = keyof typeof colors;   // ship .d.ts too
```
```csv
name,step,hex,rgb,hsl,oklch,contrast_on_white,contrast_on_black
brand-500,500,#3b76f2,"59 118 242","221 87% 59%","62.8% 0.199 258.3",4.62,4.54
```
CSV is the underrated one — designers paste it into Sheets/Notion. Include contrast + APCA Lc columns.

## 17. shadcn registry item JSON

```json
{
  "$schema": "https://ui.shadcn.com/schema/registry-item.json",
  "name": "brand-theme",
  "type": "registry:theme",
  "title": "Brand Theme",
  "cssVars": {
    "theme": { "font-heading": "Poppins, sans-serif" },
    "light": { "primary": "oklch(0.628 0.199 258.3)", "primary-foreground": "oklch(0.98 0 0)", "radius": "0.5rem" },
    "dark":  { "primary": "oklch(0.71 0.16 258.3)",  "primary-foreground": "oklch(0.18 0.01 258)" }
  },
  "css": { "@layer base": { "body": { "font-feature-settings": "\"cv11\"" } } }
}
```
Valid `type`s: `registry:base|block|component|font|lib|hook|ui|page|file|style|theme|item`. For Tailwind v4, `cssVars.theme` replaces the deprecated `tailwind` property. **Give the user a one-click `npx shadcn@latest add https://…/r/brand-theme.json` command plus a hosted `registry.json` URL** — that's a distribution moat, not just a format.

---

## CSS Variable Naming — Conventions and Pitfalls

**Three tiers, always.** Primitive `--color-blue-500` (what it *is*) → semantic `--color-action-primary` (what it *means*) → component `--button-bg-primary` (where it *lives*).

- **Kebab-case only.** DTCG dot paths (`color.action.primary`) flatten to kebab (`--color-action-primary`). Never underscores in CSS; Android is the one place that wants `snake_case`.
- **Namespace/prefix.** A short prefix (`--acme-`) prevents collision when your CSS ships into someone else's page. But: a prefix breaks Tailwind v4, which requires the literal `--color-` namespace — so offer *either* a custom prefix *or* Tailwind mode, and warn that `--acme-color-blue-500` generates no utilities. (Tailwind's own class prefix is separate: `@import "tailwindcss" prefix(tw);`.)
- **State as suffix, not category:** `--color-action-primary-hover`, not `--color-hover-action-primary` — keeps alphabetical grouping intact.
- **Scale naming.** 50–950 (Tailwind, 11 steps, 50/100/…/900/950) vs 1–12 (Radix, where steps have fixed *jobs*: 1–2 backgrounds, 3–5 component backgrounds, 6–8 borders, 9–10 solid fills, 11–12 text). Radix's advantage: the same token name works in light and dark, so semantic aliases don't need inverting. Tailwind's: familiarity. Pick one and apply it to **every** hue; don't mix.
- **Pitfalls to actively guard against in the tool:**
  1. Naming a primitive by usage (`--error-red`, `--brand-blue`) — locks the palette.
  2. Semantic tokens that carry no meaning (`--color-brand: {blue.500}` is just an alias, not a semantic).
  3. Component tokens pointing at primitives, skipping the semantic layer.
  4. Directional names that lie in dark mode: `--color-gray-900` as "darkest" inverts; prefer `--color-fg-default` / `--color-bg-subtle`.
  5. Over-tokenization — 20 good semantic tokens beat 200.
  6. Numeric-suffix drift: `500` should be the same *perceived* lightness across hues (enforce with a fixed OKLCH L ladder) — otherwise `blue-500` and `yellow-500` don't pair.
  7. Dashes vs `--color-*: initial`: if you don't reset, you inherit Tailwind's whole default palette alongside yours.
  8. Emitting `hsl(var(--x))` channel-triples (the old shadcn v3 pattern) is now legacy; v4 stores full color functions in the variable.

## Auto-Naming Colors — Actual Packages

- **`color-name-list`** — the big one. ~31,914 curated unique names (~0.19% of RGB space), aggregated from Wikipedia, Wada Sanzo, CSS/HTML names, Werner's Nomenclature, **ntc.js**, xkcd survey. `npm i color-name-list`; `import { colornames } from 'color-name-list'`. Bundle is ~1.22 MB — for browsers use the subsets (`color-name-list/dist/colornames.bestof.json`, `.short.json`) or the free REST API `https://api.color.pizza/v1/?values=00f,f00&list=bestOf`.
- **`color-name-lists`** — sibling package shipping the individual source lists (ntc, xkcd, wikipedia, basic, chineseTraditional, japaneseTraditional, leCorbusier, nbsIscc, ridgway, sanzoWadaI, thesaurus, werner) with metadata, so you can let users pick a vocabulary.
- **`nearest-color`** (0.4.4, unmaintained since ~2017) — naive RGB Euclidean nearest neighbor; the classic pairing with `color-name-list`, but RGB distance gives perceptually wrong names. Better: build a **k-d tree / VPTree in OKLab and rank by ΔE2000** — that's what `color-name-api` does (VPTree, guarantees *unique* names across a palette, which naive nearest-neighbor does not).
- **`color-namer`** (colorjs/color-namer) — converts to CIE Lab, Delta-E distance, bundled lists: `basic`, `html`, `ntc` (~1500), `pantone`, `roygbiv`, `x11`. Returns ranked matches per list.
- **`color-2-name`** — modern TS, tree-shakeable, `closest()` API, works from any CSS color string.
- **`ntc.js`** — Chirag Mehta's 2007 "Name That Color", ~1566 names; not a real npm package originally, now vendored inside the packages above. Use it as a *list*, not as a library.
- **`closest-css-color`** / `color-name` (the 148 CSS keywords) for the conservative case.

**Differentiator:** nobody enforces *uniqueness within one palette* plus *stable naming across regenerations*. Do nearest-name in OKLab with ΔE2000, deduplicate greedily (second-nearest for collisions), then let the user pick vocabulary (bestOf / short / ntc / Sanzo Wada / Werner) — and offer "semantic-only" naming as an alternative track that never uses poetic names at all.

Sources: [designtokens.org/tr/drafts/format](https://www.designtokens.org/tr/drafts/format/) · [designtokens.org/tr/drafts/color](https://www.designtokens.org/tr/drafts/color/) · [tailwindcss.com/docs/theme](https://tailwindcss.com/docs/theme) · [styledictionary.com predefined formats](https://styledictionary.com/reference/hooks/formats/predefined/) · [styledictionary.com/info/dtcg](https://styledictionary.com/info/dtcg/) · [zeroheight SD v5 migration](https://help.zeroheight.com/hc/en-us/articles/48049028236187-Migrating-to-Style-Dictionary-v5-in-tokens-automation) · [docs.tokens.studio token format](https://docs.tokens.studio/manage-settings/token-format) · [ui.shadcn.com registry-item.json](https://ui.shadcn.com/docs/registry/registry-item-json) · [github.com/meodai/color-names](https://github.com/meodai/color-names) · [npmjs.com/package/color-namer](https://www.npmjs.com/package/color-namer) · [npmjs.com/package/nearest-color](https://www.npmjs.com/package/nearest-color) · [npmjs.com/package/ase-utils](https://www.npmjs.com/package/ase-utils) · [developer.gimp.org GPL v2](https://developer.gimp.org/core/standards/gpl/) · [Apple Named Color asset catalog](https://developer.apple.com/library/archive/documentation/Xcode/Reference/xcode_ref-Asset_Catalog_Format/Named_Color.html) · [github.com/andrewfiorillo/sketch-palettes](https://github.com/andrewfiorillo/sketch-palettes) · [docs.fileformat.com/settings/aco](https://docs.fileformat.com/settings/aco/) · [colorarchive.org token naming guide](https://colorarchive.org/guides/color-token-naming-guide/) · [coolors export help](https://coolors-help.zendesk.com/hc/en-us/articles/360010581920-Export-a-palette) · [realtimecolors.com/docs/exporting](https://www.realtimecolors.com/docs/exporting)