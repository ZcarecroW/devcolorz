## 1. Competitive scan — what the incumbents actually do

| Tool | Surfaces shown | Role model | Beatable weakness |
|---|---|---|---|
| **Realtime Colors** | 4 templates: Home (hero, pricing, FAQ, testimonials, footer), Dashboard, Blog Post, Docs. Shortcuts: `Space` randomize, `Alt+T` dark/light, `←`/`→` undo/redo, `Ctrl+E` export, `Ctrl+S` share | Fixed **5 slots**: `text, background, primary, secondary, accent`. Palette generator emits 9 shade palettes; exports CSS/SCSS/Tailwind in HEX/RGB/HSL/OKLAB/OKLCH | Hard-capped at 5 colors; no N>5, no per-surface re-derivation, no CVD sim |
| **Coolors Visualizer** | Categories: Mobile/Web UI, Branding, Typography, Pattern, Illustration + user-uploaded SVG recolor (`Space` reshuffles) | Positional — palette index → template slot index, reshuffle = permutation | Assignment is **random permutation**, not contrast-aware; most shuffles are unreadable. Paywalled |
| **Happy Hues** | The site *is* the mockup: hero, education cards, dark psychology section, about, newsletter/footer | Named slots per section: `background, headline, sub-headline, button, button-text, card-background, card-headline, card-paragraph, card-tag-background, card-tag-text, stroke, main, highlight, secondary, tertiary, input, label, placeholder, link` | One curated palette at a time; no arbitrary input |
| **Material Theme Builder / `@material/material-color-utilities`** | Full token sheet + component demos | Derives 5 `TonalPalette`s (primary/secondary/tertiary/neutral/neutral-variant) from one HCT seed; tones `0,10,…,90,95,99,100` plus M3 dark tones `4,6,12,17,22,24`. ~50 roles incl. `surfaceContainerLowest…Highest`, `outline`, `outlineVariant`, `inverseSurface`, `scrim`, `*Fixed`/`*FixedDim`. `DynamicScheme.from({isDark, specVersion: SPEC_2025})` | **Single seed only** — cannot honor a user's arbitrary N colors; it *replaces* them |
| **Huemint** | Templates encode roles implicitly | The one genuinely good idea: an **n×n adjacency/contrast matrix** (0 = unconnected, 1 = min, 100 = max, in ΔE), canonical node order background→foreground. API: `{mode: transformer\|diffusion\|random, num_colors: 2–12, temperature: 0–2.4, adjacency: flat string[], palette: ["#fff","-",…]}` | Generates *for* templates, never *maps an existing palette onto* one |
| **Figma** | `Able` (contrast + CVD sim), `Stark`, `Contrastio`, `Supa Palette` (whole-scale ratings), `Color Kit` | Pairwise checks only | No holistic "does this palette work as a system" view |

**Our differentiator:** take Huemint's adjacency-matrix formalism but invert it — each template ships a **slot manifest with a target-contrast matrix**, and we *solve* the assignment of an arbitrary N-palette onto it. Nobody does N=2…20+ → 30 surfaces deterministically.

## 2. Role assignment — the deterministic solver

**Stage 0 — normalize.** `culori@4.0.2` (ESM, OKLCH-native, used by Tailwind v4/Radix). Map each input to `oklch` → `{L∈[0,1], C, H}`. Cache linear-sRGB triples for contrast math.

**Stage 1 — expand to a virtual ramp (fixes N=2).** For every input color emit tones at `L ∈ {0.06,0.12,0.20,0.30,0.40,0.50,0.60,0.70,0.80,0.88,0.94,0.98}`, preserving `H`, with `C' = C · clampChroma(gamut)` and a chroma bell `C' *= 1 - |L-0.55|·0.6` so tints don't go neon. Tag each as `origin: index, synthetic: true`. Templates draw *first* from real colors, *then* from the ramp. This is what makes N=2 render a 12-slot dashboard without looking broken.

**Stage 2 — classify.** `isNeutral = C < 0.035`. Split into `neutrals[]` and `chromatics[]`, each sorted ascending by `L`. Compute circular hue histogram (36 bins × 10°).

**Stage 3 — assign core slots** (light mode; mirror `L` for dark):
- `bg` = highest-`L` neutral; if `neutrals` empty, lowest-chroma color's tone at `L≈0.97`.
- `surface` = member minimizing `|ΔL − 0.04|` vs `bg`, same hue family; `surfaceAlt` at `ΔL 0.08`.
- `text` = **argmax `|Lc(candidate, bg)|`** across the whole expanded set, tie-broken toward lower `C`. Reject if `|Lc| < 75`; then synthesize `bg`-hue at `L = bg.L > 0.5 ? 0.15 : 0.95`.
- `textMuted` = candidate with `|Lc|` closest to **60**.
- `border` = candidate with `|Lc|` vs `surface` in **[8, 25]**; fallback `mix(text, surface, 12%)` in OKLab.
- `primary` = `argmax(chromatics)` of `0.55·Ĉ + 0.30·(|Lc(c,bg)|/100) + 0.15·hueSalience(H)`, gated `|Lc(c,bg)| ≥ 45`.
- `onPrimary` = whichever of `text`/`bg`/white/black maximizes `|Lc|` vs `primary`.
- `accent` = remaining chromatic maximizing circular `ΔH` from `primary` (target ≥ 60°), with `Ĉ ≥ median`.
- `secondary` = next by the primary score after removing primary/accent.
- Semantic `success/warning/danger/info` = nearest palette hue to 145°/85°/25°/250° in OKLCH; if `ΔH > 45°` synthesize at that hue with the palette's mean `C`.

**Stage 4 — matrix solve.** Each template exports `slots: [{name, minLc, prefer: 'chromatic'|'neutral', againstSlot}]` plus an `n×n` target matrix. Run **greedy maximin then 2-opt swap** minimizing `Σ max(0, minLc − actualLc)² + λ·Σ|targetΔE − actualΔE|`. Deterministic: seed the tie-breaker with `xxhash(palette.join())` so "shuffle" is reproducible and shareable via URL.

**Stage 5 — chart series (fixes N=20).** Circular k-means on hue (k = min(N, 8)); representative per cluster = highest `C`. Order by **farthest-point traversal in OKLab ΔE_ok** starting at `primary`, so adjacent series are maximally separable. Enforce `ΔL ≥ 0.08` between neighbors so the set survives achromatopsia. Leftovers at N>12 → decorative slots (gradient stops, mesh nodes, sticker/tag fills, poster bands) where they cost nothing.

## 3. The 30 preview templates

Each = one Vue SFC taking `props: { roles, palette, mode }`, all colors read from CSS custom properties on a scoped root so re-assignment is a single reactive style object.

| # | Component | Core slots consumed | Build notes |
|---|---|---|---|
| 1 | `WordmarkGrid` | bg, surface, primary, accent, text | 3×3 pseudo-logos: monogram in circle, stacked lockup, mark+wordmark, all-caps tracked, negative-space knockout |
| 2 | `LandingHero` | bg, text, textMuted, primary, onPrimary, accent, border | Nav + eyebrow badge + h1 + dual CTA + logo strip + abstract blob |
| 3 | `SaasDashboard` | bg, surface, surfaceAlt, border, text, textMuted, primary, series[4–6] | Sidebar, 4 KPI tiles w/ sparklines, area chart, table, status pills |
| 4 | `MobileAppScreen` | bg, surface, primary, accent, text, border | 390×844 frame, status bar, tab bar, FAB, list rows |
| 5 | `ProductCardGrid` | bg, surface, text, primary, danger, border, accent | 3×2 cards, sale badge = danger, swatch dots = full palette |
| 6 | `BlogArticle` | bg, surface, text, textMuted, primary, border, accent | Long-form typographic stress test: blockquote, inline link, `code`, pull-quote, hr |
| 7 | `PricingTable` | bg, surface, surfaceAlt, primary, onPrimary, accent, border, success | 3 tiers, middle "featured" inverted |
| 8 | `ChatUI` | bg, surface, primary, onPrimary, text, textMuted, accent, border | Own bubbles = primary, theirs = surface, unread dot = accent, typing indicator |
| 9 | `KanbanBoard` | bg, surface, border, text, series[3–8] | Column header dots = series; labels/tags consume overflow colors — best N>8 sink |
| 10 | `MusicPlayer` | bg→gradient(primary,accent), surface, text, primary | Album art = mesh of top-2 chromatics, scrubber, waveform bars from series |
| 11 | `ChartSet` | bg, surface, text, border, series[N] | Grouped bar / multi-line / donut / 9×5 heatmap (sequential ramp from primary L 0.95→0.25) |
| 12 | `GradientMesh` | all colors as stops | 4–8 radial gradients, `background-blend-mode: screen`, plus 3 linear variants |
| 13 | `EditorialPoster` | bg, text, primary, accent + up to 6 bands | Swiss grid, huge condensed type, color bands = full palette in L order |
| 14 | `BrandIdentitySheet` | primary, accent, bg, surface, text | Business card front/back, letterhead, envelope, sticker sheet |
| 15 | `UiKitSheet` | every role | Buttons (solid/outline/ghost/disabled) × states, inputs, checkbox/radio/switch/slider, badges, 4 alerts, tooltip, modal |
| 16 | `CodeEditor` | bg, surface, text, border + syntax[6] | Map series → keyword/string/number/comment/function/operator; comment forced to `|Lc| ≈ 45` |
| 17 | `Terminal` | bg, text, series→ANSI 8 | Prompt, `ls` color output, diff, progress bar |
| 18 | `CalendarView` | bg, surface, border, text, primary, series[4] | Month grid + event chips; "today" = primary ring |
| 19 | `MapView` | bg=water, surface=land, series→landuse, primary=route, accent=pins | Inline SVG tiles; 3 zoom densities |
| 20 | `OnboardingFlow` | bg, primary, accent, surface, text | 3 slides + progress dots + illustration using stroke/main/highlight/secondary/tertiary (Happy Hues model) |
| 21 | `EmailTemplate` | bg (600px canvas), surface, text, primary, border | Table-layout, header bar, hero, button, footer — tests colors at low fidelity |
| 22 | `SocialPostSet` | primary, accent, bg, text | 1080² quote card, 9:16 story, 16:9 banner, avatar+handle |
| 23 | `TonalRampStrip` | all | Each input × 12 tones; contrast badge per cell |
| 24 | `DataTable` | bg, surface, surfaceAlt (zebra), border, text, series (status) | Sticky header, sort arrows, row hover, pagination |
| 25 | `SettingsForm` | surface, border, text, textMuted, primary, danger | Sections, toggles, select, destructive zone |
| 26 | `ToastStack` | success, warning, danger, info + containers | Each with icon, title, body, dismiss |
| 27 | `IllustrationScene` | stroke, main, highlight, secondary, tertiary | Flat SVG scene; explicitly the Happy Hues 5-slot illustration model |
| 28 | `SlideDeck` | bg, text, primary, accent, series | Title slide, agenda, chart slide, quote slide |
| 29 | `TicketReceipt` | surface, text, primary, border, accent | Perforation, barcode, monospace totals |
| 30 | `AlbumCoverGrid` | pairs of palette colors | 6 covers, each a 2–3-color composition — the fastest read on "do these colors like each other" |

## 4. Accessibility overlays

**WCAG 2.x ratio.** Linearize: `c ≤ 0.04045 ? c/12.92 : ((c+0.055)/1.055)^2.4`; `Y = 0.2126R + 0.7152G + 0.0722B`; ratio `= (Ylight+0.05)/(Ydark+0.05)`. Badges: AA 4.5 / AA-large 3.0 / AAA 7.0.

**APCA (`apca-w3`, exact `SA98G` constants).** `mainTRC 2.4`, `sRco 0.2126729`, `sGco 0.7151522`, `sBco 0.0721750`, `normBG 0.56`, `normTXT 0.57`, `revTXT 0.62`, `revBG 0.65`, `blkThrs 0.022`, `blkClmp 1.414`, `scaleBoW 1.14`, `scaleWoB 1.14`, `loBoWoffset 0.027`, `loWoBoffset 0.027`, `deltaYmin 0.0005`, `loClip 0.1`. Soft-clamp `Y < blkThrs`: `Y += (blkThrs − Y)^blkClmp`. Levels: **Lc 90** fluent body, **75** min body columns, **60** content text, **45** ≥36px/24px-bold, **30** absolute min text, **15** non-text. Use APCA for slot selection, show WCAG for compliance theatre.

**CVD simulation — Machado et al. 2009, severity 1.0, applied to *linear* RGB** (decode sRGB → matrix → re-encode; `<svg><feColorMatrix color-interpolation-filters="linearRGB">` does this for free):

```
protanomaly:   0.152286  1.052583 -0.204868
               0.114503  0.786281  0.099216
              -0.003882 -0.048116  1.051998

deuteranomaly: 0.367322  0.860646 -0.227968
               0.280085  0.672501  0.047413
              -0.011820  0.042940  0.968881

tritanomaly:   1.255528 -0.076749 -0.178779
              -0.078411  0.930809  0.147602
               0.004733  0.691367  0.303900
```
Anomalous severities interpolate linearly between Machado's tabulated 0.0–1.0 steps (0.1 increments).

Alternative **Viénot 1999 protanopia** (linearRGB, feColorMatrix 4×5): `0.10889 0.89111 0 0 0 / 0.10889 0.89111 0 0 0 / 0.00447 -0.00447 1 0 0 / 0 0 0 1 0`. True **tritanopia** needs Brettel's two half-planes (plane select via `7.92482R − 5.66475G − 2.26007B` sign) — Machado's single matrix is the pragmatic choice.

**Achromatopsia:** all three rows `= [0.2126729, 0.7151522, 0.0721750]` in linear RGB (not the sRGB `0.299/0.587/0.114` shortcut most tools use — another small win).

**Overlay UX:** a 2×2 sim matrix (protan/deutan/tritan/achroma) rendered as four CSS-filter'd clones of the *live* template via `filter: url(#cvd-deutan)`; a "collision detector" flagging any two `series[]` colors whose post-simulation ΔE_ok < 10; and per-text-node contrast chips injected by a `v-contrast` directive that walks the rendered DOM.