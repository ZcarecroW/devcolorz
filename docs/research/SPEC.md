# DevColorz — Engineering Specification v1.0

**Status:** locked. Every open question in the dossier is decided here. Where the dossier offered options, the chosen option is stated and the rejected one is named so nobody relitigates it.

---

## 1. Product thesis

DevColorz is **a palette compiler, not a palette generator**. Coolors emits five hex strings; we emit a working theme. Five things make us strictly better:

1. **Contrast is an input, not a report.** Every generator path is constrained *before* sampling: you set `minLc` per role pair, and the sampler rejects/re-solves rather than warning you afterward. Coolors' contrast check is Pro-gated, post-hoc, WCAG-2-only, and offers a "Fix" button. We ship `maxChroma`-style solving (most vivid color that still hits Lc 60 on this background) as a first-class primitive in the UI, dual WCAG 2.2 + APCA readouts side by side, and an explicit **disagreement flag** on dark-mode greys where the two models diverge by more than one tier.
2. **The palette is a continuous function with roles, not a list of swatches.** Internally a palette is `{anchors, positionFns, roleMap}` with `getColorAt(t)` (Poline model) plus a 12-step Radix-semantic ramp per hue. That means any N from 2 to 20 renders correctly on any template, any export step count is free, and "add a 6th color" is interpolation, not a re-roll.
3. **Range-based randomness with a stable unit stream.** The Randomino model — per-channel dual-thumb ranges, per-channel distributions, wrap-around hue, quantize, absolute *and* delta mode — in OKLCH, with a seeded RNG and **stable unit tuples** so dragging a range slides swatches instead of strobing. Nobody in the landscape has this in a grid. Seed lives in the URL.
4. **Round-trip on the user's own file.** Paste your `globals.css` / `tailwind.config.js` / DTCG JSON in, edit, get the same file back. tweakcn proved this wins; nobody else does it, and nobody does it with contrast validation on top.
5. **Nothing is gated, nothing phones home, nothing is lost.** Local-first (IndexedDB), zero interstitials, no ads, full keyboard control with a `?` cheat-sheet and a real `⌘K` command palette, unlimited undo with a labeled history panel that survives reload. Accounts are optional sync, and cancellation is self-serve in two clicks (the #1 Coolors complaint is billing).

---

## 2. Feature list

### Generator
**MUST** — 2–20 swatches, no tier cap. Space = re-roll unlocked. Per-swatch lock, plus **partial lock** (lock H, free L/C — the gap Coolors leaves). Lock-all / invert-locks / lock-next (`Ctrl+\`). Per-swatch re-roll (`R` while hovered). Drag reorder via `@atlaskit/pragmatic-drag-and-drop` with **Shift+Arrow keyboard reorder**. `+` between columns inserts N interpolated steps (press-and-hold to choose N, OKLab interpolation). `×` removes. Undo/redo unlimited, labeled, persisted. Command palette `⌘K`. `?` shortcut overlay. Remappable bindings stored in localStorage. Zen mode. URL hash state (`#p=`), never query string.
**SHOULD** — conditional infill (`"N"`-slot semantics: given locked colors, solve the rest under harmony + contrast constraints). Adjust panel with OKLCH-native H/L/C/temperature sliders **plus contrast-preserving mode** (adjust L, hold Lc vs bg). Palette variations grid (12 variants: hue rotations, chroma ladders, lightness transposes). Image extraction (octree default, k-means-in-OKLab option, Vibrant scoring for named swatches). Shuffle with seeded permutation.
**COULD** — layout-conditioned generation (huemint's adjacency matrix, but derived from a chosen preview template's slot manifest, not hand-typed). Taste vector: 50-swatch onboarding stored locally, re-ranks candidates by ΔEOK to liked set. Palette-from-URL scrape (server-side fetch + CSS var parse).

### Ranges / Randomino
**MUST** — space selector `OKLCH | OKLAB | LCH | HSL | HSV | RGB` with bound **re-projection** on switch (2000-sample bounding box, circular for hue) and a "bounds approximate" toast. Per-channel row: lock, min/max numerics, dual-thumb track painted with the live channel gradient (other channels at range midpoint), out-of-gamut diagonal hatch, per-channel distribution dropdown, quantize field, wrap toggle. Distributions: uniform, Gaussian (reject-and-resample, σ = (hi−lo)/(2+10·bias)), half-Gaussian, golden-ratio low-discrepancy, blue-noise (Mitchell best-candidate, k=10, ΔEOK metric). Wrap-around hue when min > max. Seeded RNG (`cyrb128` → `sfc32`), editable seed field, 20-deep seed history on `[` / `]`. Preview grid 12/24/48/96 with stable unit tuples; click to pin, pinned survive re-roll.
**SHOULD** — absolute/delta mode per channel. Constraint filter rows: `min ΔEOK between adjacent`, `min |Lc| vs background X`. Gamut mode selector: clip / chroma-reduce / reject-and-resample, with a live "n% of this range is out of sRGB" meter.
**COULD** — floating compact HUD (Randomini-style) for inline editing; "% in P3 only" badge dots.

### Harmony
**MUST** — three wheels as a toggle: **OKLCH**, **HSL**, **RYB** (24-entry Itten LUT, rotate once, never chain). Schemes: monochromatic, analogous, complementary, split-complementary, triadic, tetradic-square, tetradic-rectangle, double-split, compound, auto. **Continuous hue-distance slider** (Paletton's satellites) instead of only discrete presets. All-harmonies-at-once comparison view (colorffy's idea).
**SHOULD** — CVD collision arcs drawn on the wheel: shade the hue arcs where a second hue would collide under protan/deutan/tritan (Adobe Color's check, but preventative).
**COULD** — CAM16-UCS as an alternate engine behind a lab flag.

### Previews
**MUST** — 30 templates (§6), light/dark toggle (`Alt+T`), CVD 2×2 simulation matrix, per-text-node contrast chips via a `v-contrast` directive, deterministic role assignment with a seeded shuffle.
**SHOULD** — user SVG upload + recolor (map `fill`/`stroke` to nearest role). Template-derived adjacency matrix feeding the generator.
**COULD** — per-template "why this assignment" explainer panel.

### Export
**MUST** — CSS custom properties (notation picker: hex/rgb/hsl/lab/lch/oklab/oklch/display-p3), Tailwind v4 `@theme`, Tailwind v3 config (+ channel-triple flavor), SCSS vars + maps, **shadcn/tweakcn `globals.css`** (45-key superset), **shadcn registry-item JSON** with a hosted `npx shadcn add` URL, DTCG JSON in **both** 2025.10 object form and legacy hex-string form, JSON/JS/TS + `.d.ts`, CSV with contrast columns, SVG swatch sheet, PNG, ASE, GPL, `.sketchpalette`, Android `colors.xml` (+`values-night/`), Swift + `.colorset` zip, Flutter/Dart, Kotlin/Compose, PDF specimen.
**SHOULD** — **user-authorable export templates** with `${token.format.shade}` interpolation (realtimecolors' single best idea; turns "support framework X" into a user string). Style Dictionary `config.json` + `.tokens.json` bundle. Tokens Studio dialect + `$metadata.json` + `$themes.json`. Import: paste `globals.css`, `tailwind.config.js`, DTCG JSON, ASE, GPL, or a hex list.
**COULD** — Figma variables JSON; Procreate `.swatches`.

### Accounts
**MUST** — local-first: everything works logged out, IndexedDB persistence. Optional email+password account for sync. Email verification, password reset, self-serve account delete + data export. Palette library, projects, collections — unlimited, no tier caps. Public palette pages with permalinks and OG images.
**SHOULD** — likes, trending/explore with color+style filters, "open in editor" from any curated palette. Version history per palette (server-side, last 50 versions).
**COULD** — team workspaces (shared collections with a role column already in the schema).

### Admin
**MUST** — see §8.

---

## 3. Frontend stack (locked)

```
vite@8.2.2                          @vitejs/plugin-vue@6.0.8
vue@3.5.41                          vue-tsc@3.3.10       typescript@7.0.2
vue-router@5.2.0                    pinia@4.0.3          @vue/devtools-api (explicit, pinia 4 needs it)
pinia-plugin-persistedstate@4.7.1   @pinia/colada@1.4.2
tailwindcss@4.3.3                   @tailwindcss/vite@4.3.3
shadcn-vue@2.8.2 (CLI)              reka-ui@2.10.3       tw-animate-css@1.4.0
class-variance-authority@0.7.1      clsx@2.1.1           tailwind-merge@3.6.0
@vueuse/core@14.4.0                 lucide-vue-next@1.0.0  vue-i18n@11.4.8   vue-sonner@2.0.9
culori@4.0.2                        @texel/color@1.1.11
@atlaskit/pragmatic-drag-and-drop@3.0.0
@tanstack/vue-virtual@3.13.36       motion-v@2.4.0       @formkit/auto-animate@0.10.0
@tanstack/vue-form@1.33.5           zod@4.4.3
fflate@0.8.3                        modern-screenshot@4.7.0   jspdf@4.2.1 (+jspdf-autotable@5.0.8)
ase-utils@0.1.1                     color-name-list (subsets only)
pure-rand@7.x
```

Justifications for the non-obvious calls:

- **`culori/fn` + `@texel/color`, not `colorjs.io`.** culori is 22.5 kB gzip, tree-shakes, and is what Tailwind v4 and Radix compute with — our tokens will match theirs bit-for-bit. `@texel/color` is swapped in only for the gamut-mapping hot path (per-frame gradient tracks, picker drags): 68.9× faster gamut mapping. colorjs.io ships as a **devDependency test oracle only** — it never enters the bundle.
- **`@atlaskit/pragmatic-drag-and-drop`, not `vue-draggable-plus` or any SortableJS wrapper.** SortableJS gives zero keyboard DnD. `vuedraggable@next` is dead since 2021. Keyboard reorder is a WCAG line item and our stated differentiator.
- **`@tanstack/vue-form`, not `vee-validate`.** `@vee-validate/zod@4.15.1` still pins `zod ^3.24`; TanStack Form consumes Standard Schema so Zod 4 works with no adapter. Zod 4 is load-bearing for parsing pasted share-links and imported palette JSON.
- **`apca-w3` is vendored, not installed.** It's frozen at 2022, has a `colorparsley` dep, and no ESM entry. We copy ~60 lines of SA98G with the exact constants into `engine/contrast/apca.ts` and unit-test against the published lookup table.
- **No chart library.** Contrast matrices, gamut plots, and ramp graphs are 40-line SVG components. echarts is 58.9 MB unpacked.
- **`useMagicKeys`, not `hotkeys-js`.** Reactive, 0 extra deps, guarded with `useActiveElement()`.
- **jspdf and modern-screenshot are dynamic `import()` behind the export button only.** Never in the entry chunk.
- **`vue@3.5.41`, not the 3.6 rc.** Keep `<script setup>` idiomatic so Vapor Mode is a version bump.

---

## 4. Color engine spec

Module layout under `src/engine/` — **pure TypeScript, zero Vue imports, 100% unit-testable**. All color objects are `markRaw`/plain and never enter a deep `ref`.

```
engine/
  core/       space.ts convert.ts gamut.ts diff.ts parse.ts format.ts
  random/     rng.ts distributions.ts ranges.ts sample.ts
  harmony/    wheel.ts schemes.ts ryb.ts
  scale/      tonal.ts curves.ts radix12.ts tailwind11.ts poline.ts
  theme/      darkmode.ts alpha.ts roles.ts semantics.ts
  a11y/       wcag.ts apca.ts cvd.ts solve.ts
  naming/     vptree.ts name.ts
  io/         encode.ts decode.ts  (URL binary codec)
```

### 4.1 Conversions (`core/convert.ts`)

Route **B — CSS Color 4 via XYZ-D65** is the locked pipeline (matches culori, Chrome DevTools, Tailwind v4). Ottosson's fused matrix is rejected: it round-trips differently in the last digits and would make our `oklch()` output disagree with DevTools.

```ts
type OKLCH = { l: number; c: number; h: number; alpha?: number }   // l 0–1, c 0–0.4+, h 0–360
type OKLab = { l: number; a: number; b: number; alpha?: number }
type Space = 'srgb'|'srgb-linear'|'oklab'|'oklch'|'lab'|'lch'|'hsl'|'hsv'|'p3'|'rec2020'|'xyz-d65'

function toOklch(input: string | AnyColor): OKLCH
function toOklab(input: string | AnyColor): OKLab
function fromOklch(c: OKLCH, to: Space): AnyColor
function convert<T extends Space>(c: AnyColor, to: T): SpaceColor<T>
function cbrtSigned(x: number): number          // Math.sign(x) * Math.cbrt(Math.abs(x))
function srgbLinearize(c: number): number       // threshold 0.04045, NOT 0.03928
function srgbEncode(c: number): number
function toe(x: number): number                 // K1 .206 K2 .03 K3 (1+K1)/(1+K2)
function toeInv(x: number): number
function parseCss(s: string): AnyColor | null
function formatCss(c: AnyColor, notation: Notation): string
```

`cbrtSigned` is mandatory — naive `x**(1/3)` returns NaN on negative LMS and is the single most common bug when handling wide-gamut input.

### 4.2 Gamut mapping (`core/gamut.ts`)

**Ray Trace (CSS Color 4 §14.2.6) is the default**, not binary-search MINDE. Rationale: MINDE's result can land anywhere in the JND window, producing visible banding in gradients (csswg #7135) — and our whole UI is gradients. Ray Trace is max 4 iterations, deterministic timing, banding-free.

```ts
type Gamut = 'srgb' | 'p3' | 'rec2020'
type MapMethod = 'raytrace' | 'minde' | 'clip' | 'reject'

function inGamut(c: OKLCH, g: Gamut): boolean
function gamutMap(c: OKLCH, g?: Gamut, method?: MapMethod): OKLCH
function gamutMapRayTrace(c: OKLCH, g: Gamut): OKLCH     // low 1e-12, high 1-1e-12, ≤4 iters
function gamutMapMinde(c: OKLCH, g: Gamut): OKLCH        // JND 0.02, eps 1e-4
function maxChroma(l: number, h: number, g?: Gamut): number     // bisection, 1e-4
function cusp(h: number, g?: Gamut): { l: number; c: number }   // memoized, 360 entries
function chromaCeilingLUT(g: Gamut, steps?: number): Float32Array // for slider tracks
function relativeChroma(c: OKLCH, g?: Gamut): number      // ρ = C / maxChroma(L,H)
function withRelativeChroma(l: number, rho: number, h: number, g?: Gamut): OKLCH
function gamutReport(c: OKLCH): { srgb: boolean; p3: boolean; rec2020: boolean }
```

`ρ` (relative chroma) is **the invariant we preserve** on every lightness change. Holding absolute `C` while moving `L` is the bug that makes every naive dark-mode inverter clip.

### 4.3 Difference (`core/diff.ts`)

```ts
function deltaEOK(a: OKLab, b: OKLab): number
function deltaEOK2(a: OKLab, b: OKLab): number        // (2Δa)², (2Δb)²
function deltaEOKr2(a: OKLab, b: OKLab): number       // toe-corrected — OUR DEFAULT
function deltaE2000(a: Lab, b: Lab): number           // naming only
```

The spec itself recommends ΔEOKr2 for performance-sensitive implementations and nobody has shipped it in a UI. It is our default everywhere except naming (ΔE2000 there, matching `color-name-api`).

### 4.4 Range-based random generation (`random/`)

```ts
// rng.ts
function cyrb128(seed: string): [number,number,number,number]
function sfc32(a:number,b:number,c:number,d:number): () => number
class SeededStream {
  constructor(seed: string)
  next(): number
  tuple(n: number): number[]          // stable unit tuple, cached per index
  fork(label: string): SeededStream    // deterministic sub-stream
  get seed(): string
}

// distributions.ts
type DistKind = 'uniform'|'gaussian'|'halfGaussianLow'|'halfGaussianHigh'|'golden'|'blueNoise'
interface Dist { kind: DistKind; bias?: number; quantize?: number }
function mapUnit(u: number, lo: number, hi: number, d: Dist, index: number): number
function gaussianUnit(u1: number, u2: number): number      // Box–Muller
function goldenUnit(u0: number, n: number): number         // (u0 + n*0.6180339887498949) % 1
function blueNoisePick(accepted: OKLab[], candidates: OKLab[]): OKLab   // k=10, maximin ΔEOK

// ranges.ts
interface ChannelRange {
  channel: string; min: number; max: number;
  wrap: boolean; locked: boolean; mode: 'absolute'|'delta';
  dist: Dist;
}
interface RangeSpec { space: Space; channels: ChannelRange[]; gamut: Gamut; mapMethod: MapMethod }
function isWrapped(r: ChannelRange): boolean                  // r.wrap || r.min > r.max
function arcLength(r: ChannelRange): number                   // (max - min + 360) % 360
function sampleChannel(r: ChannelRange, u: number, n: number, base?: number): number
function reprojectRanges(from: RangeSpec, to: Space, samples?: number): RangeSpec  // default 2000

// sample.ts
function sampleColor(spec: RangeSpec, u: number[], n: number, base?: OKLCH): OKLCH
function sampleGrid(spec: RangeSpec, stream: SeededStream, count: number,
                    pinned?: Map<number, OKLCH>): OKLCH[]
function outOfGamutFraction(spec: RangeSpec, samples?: number): number  // default 512
```

Wrap sampling is exactly: `L = (max - min + 360) % 360; h = (min + t*L) % 360`. Gaussian **rejects and resamples** out-of-range draws; clamping piles probability mass on the endpoints and is banned. `sampleGrid` reads unit tuples from `stream.tuple(i)` which are **cached by index** — that is what makes dragging a thumb slide the grid instead of strobing.

### 4.5 Harmony (`harmony/`)

```ts
type Wheel = 'oklch' | 'hsl' | 'ryb'
type Scheme = 'mono'|'analogous'|'complementary'|'splitComplementary'|'triadic'
            | 'square'|'rectangle'|'doubleSplit'|'compound'|'auto'

const RYB_LUT: ReadonlyArray<[number, number]>   // 24 pairs, the Itten table
function rgbHueToRyb(h: number): number
function rybToRgbHue(a: number): number
function rotate(h: number, deg: number, wheel: Wheel): number
function offsetsFor(s: Scheme, alpha: number): number[]   // alpha = the continuous slider, 0–180
function harmonize(base: OKLCH, s: Scheme, opts: {
  wheel: Wheel; alpha?: number; count?: number;
  lightnessSpread?: number;      // ±ΔL applied across members
  preserveRelativeChroma?: boolean;   // default true
  gamut?: Gamut;
}): OKLCH[]
function allHarmonies(base: OKLCH, opts): Record<Scheme, OKLCH[]>
function cvdCollisionArcs(base: OKLCH, type: CvdType): Array<[number, number]>  // hue arcs to avoid
```

`alpha` defaults: split-complementary 30, analogous 24, rectangle 60, doubleSplit 30. Rotation on the RYB wheel converts once and back once — never chained, because round-tripping corrupts hue.

### 4.6 Scales / tonal generation (`scale/`)

```ts
type Curve = 'linear'|'easeInQuad'|'easeOutQuad'|'easeInOutQuad'|'easeInCubic'
           | 'easeOutCubic'|'smoothStep'|'sinusoidal'|'exponential'|'arc'
function ease(t: number, c: Curve, reverse?: boolean): number

interface RampSpec {
  seed: OKLCH; steps: number; anchorStep?: number;          // "my brand is step 700"
  lStart: number; lEnd: number; lCurve: Curve;
  cPeak: number; cCurve: Curve; cRate: number;              // ColorBox saturation rate
  hStart: number; hEnd: number; hCurve: Curve;              // hue shift across ramp
  gamut: Gamut;
}
function buildRamp(spec: RampSpec): OKLCH[]
function tailwind11(seed: OKLCH, anchor?: 50|100|...|950): Record<string, OKLCH>
function radix12(seed: OKLCH, opts: { appearance:'light'|'dark'; background: OKLCH }): Radix12
function tonalHCT(seed: OKLCH, tones?: number[]): Map<number, OKLCH>
   // default tones [0,4,6,10,12,17,20,22,24,30,40,50,60,70,80,90,95,98,99,100]
function solveForContrast(hue: number, chroma: number|'max',
                          target: { model:'apca'|'wcag'; value: number },
                          bg: OKLCH, dir?: 'lighter'|'darker'|'auto', gamut?: Gamut): OKLCH
function solveRamp(hue: number, targets: number[], bg: OKLCH, model: 'apca'|'wcag'): OKLCH[]
function poline(anchors: OKLCH[], opts: { numPoints:number; fx:Curve; fy:Curve; fz:Curve;
                closedLoop?:boolean; invertedLightness?:boolean }): {
  colors: OKLCH[]; getColorAt(t: number): OKLCH; shiftHue(d: number): void;
}
```

`solveForContrast` is the Leonardo/apcach primitive: bisect OKLCH `L` (monotonic in luminance, ~18 iterations to 1e-5), **gamut-map inside the loop and re-measure**, because mapping moves Y. With `chroma:'max'` it additionally bisects C to `maxChroma(L,h)` — that's "give me the most vivid color that still hits Lc 60 on this background," the single most useful primitive nobody exposes in a UI.

Radix step semantics are enforced verbatim: 1 app bg, 2 subtle bg, 3 component bg, 4 hover, 5 active, 6 subtle border, 7 interactive border, 8 focus ring, 9 solid (seed anchored here), 10 solid hover, 11 text at **|Lc| 60 over step 2**, 12 text at **|Lc| 90 over step 2**.

### 4.7 Dark-mode inversion (`theme/darkmode.ts`)

We expose **five named strategies**. Default is `contrastPreserve`.

```ts
type DarkStrategy = 'mirrorL' | 'compressedL' | 'contrastPreserve' | 'radixPair' | 'hctRoles'
interface DarkOpts {
  strategy: DarkStrategy;
  floor: number;      // dark bg L, default 0.19   (never 0 — OLED halation)
  ceiling: number;    // dark fg L, default 0.93   (never 1)
  warmHueRotate: number;   // deg added to hues in [20,110], default 8
  chromaBoost: number;     // multiplier at mid steps, default 1.15
  gamut: Gamut;
}
function toDark(light: ThemeTokens, o: DarkOpts): ThemeTokens
function invertL(l: number, o: DarkOpts): number
function stepMap(lightStep: number, family: string): number   // the light↔dark step table nobody ships
```

- `mirrorL` — `L' = 1 − L`, ρ preserved. Honest baseline, offered for comparison; documented as wrong.
- `compressedL` — remap `[0,1] → [floor, ceiling]` after inversion, so bg lands ~0.19 and body text ~0.93.
- `contrastPreserve` (**default**) — store target Lc per role, re-solve every token against the new background with `solveForContrast`. Leonardo's invariant, done in OKLCH with cusp-aware ρ instead of a 3000-swatch linear search.
- `radixPair` — emit the full 12-step light and dark scales; step 9 is **anchored identical across modes**, hover moves darker in light and lighter in dark, and we expose the light↔dark **step map** (`stepMap`) that Radix, M3 and Tailwind all fail to publish.
- `hctRoles` — M3 role table, `SPEC_2025` tone assignments, including the non-mirror facts (`outline` 50→60, `surface` 98→6, container curves lerped by contrastLevel).

### 4.8 Alpha derivation (`theme/alpha.ts`)

```ts
function alphaFor(target: RGB, bg: RGB, rgbPrecision?: 255, alphaPrecision?: 255|1000,
                  forceAlpha?: number): { r:number;g:number;b:number;a:number }
function alphaScale(solid: OKLCH[], bg: OKLCH, gamut: Gamut): RGBA[]
function surfaceAlpha(step2: OKLCH, mode: 'light'|'dark'): RGBA  // 0.8 light, 0.5 dark
```

Implements `a = (target − bg)/(fg − bg)`, picks `desired = 255` if any target channel exceeds bg else `0`, takes `a = max(aR,aG,aB)` (smallest alpha that still reaches the target), solves the color back, and applies the **±1 correction for browsers computing `round(bg·(1−a)) + round(fg·a)` rather than `round(bg·(1−a) + fg·a)`**. Steps a9–a12 come out fully opaque; that is correct, not a bug. P3 gets its own derivation because compositing happens in the destination space.

### 4.9 Contrast (`a11y/`)

```ts
function relativeLuminance(c: RGB): number
function wcagRatio(a: AnyColor, b: AnyColor): number
function wcagTier(r: number, size: 'normal'|'large'|'ui'): 'fail'|'AA'|'AAA'
function apcaLc(text: AnyColor, bg: AnyColor): number     // signed, −108…106
function apcaY(c: RGB): number                            // simple ^2.4, no piecewise
function apcaTier(lc: number): 'Lc15'|'Lc30'|'Lc45'|'Lc60'|'Lc75'|'Lc90'|'fail'
function fontLookupAPCA(lc: number): number[]             // 9 entries, weights 100–900
function reverseAPCA(targetLc: number, bgY: number, which: 'bg'|'txt'): number
function disagreement(a: AnyColor, b: AnyColor): null | { wcag: string; apca: string }
function pickTextColor(bg: OKLCH, opts: { targetLc?: number; tint?: number }): OKLCH
function auditPalette(p: OKLCH[], opts: { adjacentOnly: boolean; model: 'apca'|'wcag' }):
  { score: number; pairs: Array<{ i:number; j:number; value:number; tier:string; fix?: OKLCH }> }
```

APCA constants are the SA98G set verbatim: `mainTRC 2.4`, `sRco .2126729`, `sGco .7151522`, `sBco .072175`, `normBG .56`, `normTXT .57`, `revTXT .62`, `revBG .65`, `blkThrs .022`, `blkClmp 1.414`, `scale 1.14`, `loOffset .027`, `deltaYmin .0005`, `loClip .1`.

`pickTextColor` defaults to `tint: 0.04` chroma — a tinted, chroma-preserving, APCA-targeted text color, which is exactly what CSS `contrast-color()` structurally cannot do (it returns only black or white at WCAG AA). That's our stated differentiator against the platform itself.

`disagreement` returns non-null when WCAG says AA-or-better and APCA says below Lc 45, or vice versa — the dark-grey case (`#767676` on black: WCAG 4.62 ✅ / APCA −30.1 ❌).

### 4.10 CVD simulation (`a11y/cvd.ts`)

```ts
type CvdType = 'protan'|'deutan'|'tritan'|'achroma'
function cvdMatrix(t: CvdType, severity: number): Float32Array   // 3×3, Machado 2009, lerped 0.1 steps
function simulate(c: OKLCH, t: CvdType, severity?: number): OKLCH   // applied in LINEAR rgb
function cvdSvgFilter(t: CvdType, severity: number): string       // feColorMatrix, linearRGB
function collisionPairs(colors: OKLCH[], t: CvdType, threshold?: number): [number,number][]  // ΔEOK < 10
```

Achromatopsia uses `[0.2126729, 0.7151522, 0.0721750]` in all three rows in **linear** RGB — not the sRGB `0.299/0.587/0.114` shortcut most tools ship. The 2×2 preview matrix uses `filter: url(#cvd-deutan)` on live DOM clones so it costs nothing.

### 4.11 Naming (`naming/`)

```ts
function buildVPTree(list: NameEntry[]): VPTree
function nameColor(c: OKLCH, vocab: Vocab): { name: string; distance: number }
function namePalette(cs: OKLCH[], vocab: Vocab): string[]   // greedy dedupe, second-nearest on collision
type Vocab = 'bestOf'|'short'|'ntc'|'sanzoWada'|'werner'|'css'|'semantic'
```

VPTree in OKLab ranked by ΔE2000, **uniqueness enforced within a palette**, and names **stable across regenerations** (keyed by quantized OKLCH, cached). `semantic` vocab never uses poetic names — it emits `primary`, `accent`, `surface-2`. Ship only `colornames.bestof.json` and `.short.json` to the browser (the full 1.22 MB list is server-side behind `/api/name`).

---

## 5. Theme/token contract

**Source of truth is OKLCH.** sRGB hex is derived, never the reverse.

Per mode we emit the **45-key tweakcn superset** (a strict superset of shadcn's 30, so one generator serves both, and shadcn-vue is byte-identical to React shadcn):

**30 shadcn colors** — `background, foreground, card, card-foreground, popover, popover-foreground, primary, primary-foreground, secondary, secondary-foreground, muted, muted-foreground, accent, accent-foreground, destructive, border, input, ring, chart-1…chart-5, sidebar, sidebar-foreground, sidebar-primary, sidebar-primary-foreground, sidebar-accent, sidebar-accent-foreground, sidebar-border, sidebar-ring`.

**+1** `destructive-foreground` — absent from stock shadcn, present in tweakcn's zod schema. We emit it: harmless in shadcn, required for tweakcn preset parity.

**+14 non-color** — `font-sans, font-serif, font-mono, radius, shadow-color, shadow-opacity, shadow-blur, shadow-spread, shadow-offset-x, shadow-offset-y, letter-spacing, spacing`, plus `--tracking-normal` (light mode only) and the 8 derived `--shadow-2xs|xs|sm|shadow|md|lg|xl|2xl`.

Shadow derivation is the tweakcn algorithm exactly: color `hsl(<h s l> / (opacity × multiplier))`; single-layer `2xs`/`xs` at ×0.5, `2xl` at ×2.5; two-layer `sm|shadow|md|lg|xl` with layer-2 (offsetY, blur) pairs `1px,2px` / `1px,2px` / `2px,4px` / `4px,6px` / `8px,10px` and spread `(spread − 1)px`.

`@theme inline` maps 30 `--color-*`, 7 `--radius-*` (**multiplier form**: ×0.6, ×0.8, ×1, ×1.4, ×1.8, ×2.2, ×2.6 — the older `calc(var(--radius) − 4px)` form is detected on import and upgraded), 3 `--font-*`, 8 `--shadow-*`, 6 `--tracking-*`, `--spacing`. Header carries `@import "tailwindcss";`, `@custom-variant dark (&:is(.dark *));`, and the `@layer base` block.

### Export pipeline

One IR, many emitters. `PaletteDoc → TokenGraph → Emitter[]`.

```ts
interface TokenGraph {
  primitives: Map<string, OKLCH>;        // --color-blue-500   (what it IS)
  semantic:   Map<string, TokenRef>;     // --color-action-primary  (what it MEANS)
  component:  Map<string, TokenRef>;     // --button-bg-primary (where it LIVES)
  modes: { light: Overrides; dark: Overrides };
  meta: Map<string, { contrastOnWhite:number; apcaOnWhite:number; name:string }>;
}
interface Emitter { id: string; ext: string; mime: string;
  emit(g: TokenGraph, opts: EmitOptions): string | Uint8Array }
```

Three tiers always. Kebab-case only. State as suffix (`-hover`, never `hover-`). Direction-free names (`fg-default`, `bg-subtle`, never `gray-900` as "darkest"). Custom prefix **or** Tailwind mode, never both — with a hard warning that `--acme-color-blue-500` generates no utilities. Emitters that produce binaries (ASE, PNG, PDF, `.colorset` zip) return `Uint8Array` and are zipped with `fflate`. Downloads go through `showSaveFilePicker()` with an `<a download>` + `URL.createObjectURL` fallback — `file-saver` is not a dependency.

The **user-template emitter** compiles a string containing `${token.format.shade}` placeholders against the TokenGraph; formats are `hex|rgb|hsl|oklch|oklab|lab|lch|p3|channels`. Templates are saved per-account and shareable — that turns "add framework X" into user-generated content.

---

## 6. Preview template catalogue

All 30 from the dossier ship, as Vue SFCs taking `props: { roles, palette, mode }` and reading every color from CSS custom properties on a scoped root, so re-assignment is one reactive style object:

`WordmarkGrid, LandingHero, SaasDashboard, MobileAppScreen, ProductCardGrid, BlogArticle, PricingTable, ChatUI, KanbanBoard, MusicPlayer, ChartSet, GradientMesh, EditorialPoster, BrandIdentitySheet, UiKitSheet, CodeEditor, Terminal, CalendarView, MapView, OnboardingFlow, EmailTemplate, SocialPostSet, TonalRampStrip, DataTable, SettingsForm, ToastStack, IllustrationScene, SlideDeck, TicketReceipt, AlbumCoverGrid.`

Ship order: 2, 3, 15, 6, 23, 11 (M6) → 1, 5, 7, 8, 16, 24, 25, 26 (M11) → the rest (M15). `KanbanBoard`, `GradientMesh` and `ChartSet` are the N>12 sinks; `UiKitSheet` and `TonalRampStrip` are the QA surfaces.

Each template exports a manifest:

```ts
interface SlotSpec { name: string; minLc: number; prefer: 'chromatic'|'neutral'|'any'; against: string }
interface TemplateManifest { id: string; slots: SlotSpec[]; matrix: Float32Array /* n×n target ΔE */ }
```

### Role-assignment algorithm

```
function assignRoles(palette: OKLCH[], tpl: TemplateManifest, mode, seed) -> RoleMap

# Stage 1 — expand to a virtual ramp (this is what makes N=2 render a 12-slot dashboard)
pool = []
for (i, c) in palette:
    pool.push({ color: c, origin: i, synthetic: false })
    for L in [.06,.12,.20,.30,.40,.50,.60,.70,.80,.88,.94,.98]:
        rho  = relativeChroma(c)
        bell = 1 - abs(L - 0.55) * 0.6
        pool.push({ color: gamutMap(withRelativeChroma(L, rho*bell, c.h)),
                    origin: i, synthetic: true })

# Stage 2 — classify
neutrals   = sortByL([p in pool if p.color.c < 0.035])
chromatics = sortByL([p in pool if p.color.c >= 0.035])
hueHist    = circularHistogram(palette, bins=36)
if mode == 'dark': for p in pool: p.color.l = invertL(p.color.l, darkOpts)

# Stage 3 — core slots (real colors preferred over synthetic; ties broken by xxhash(seed))
bg        = argmax_L(neutrals)  ?? tone(argmin_C(palette), L=0.97)
surface   = argmin(|ΔL - 0.04|) over sameHueFamily(bg)
surfaceAlt= argmin(|ΔL - 0.08|) over sameHueFamily(bg)
text      = argmax |apcaLc(cand, bg)| over pool, tie-break lower C
            if |Lc| < 75: text = solveForContrast(bg.h, 0.04, {apca:90}, bg)
textMuted = argmin | |apcaLc(cand,bg)| - 60 |
border    = any cand with |apcaLc(cand, surface)| in [8,25]
            ?? mixOklab(text, surface, 0.12)
primary   = argmax over chromatics of
              0.55*normC + 0.30*(|apcaLc(c,bg)|/100) + 0.15*hueSalience(c.h, hueHist)
            subject to |apcaLc(c,bg)| >= 45
onPrimary = argmax |apcaLc(x, primary)| for x in {text, bg, white, black}
accent    = argmax circularΔH(c, primary) over remaining chromatics with normC >= median,
            target ΔH >= 60
secondary = next by primary-score after removing primary, accent
for (role, targetH) in [(success,145),(warning,85),(danger,25),(info,250)]:
    near = argmin circularΔH(palette, targetH)
    role = (circularΔH(near, targetH) <= 45) ? near
         : gamutMap(oklch(meanL(palette), meanC(palette), targetH))

# Stage 4 — solve remaining template slots (greedy maximin, then 2-opt)
assign = greedyMaximin(tpl.slots, pool, cost)
repeat 2-opt swaps while cost decreases, max 200 iterations:
  cost(A) = Σ_slots max(0, slot.minLc - |apcaLc(A[slot], A[slot.against])|)^2
          + 0.35 * Σ_pairs |tpl.matrix[i][j] - deltaEOKr2(A[i], A[j])|

# Stage 5 — chart series
k    = min(N, 8)
reps = circularKMeans(palette.hues, k) -> highest-C member per cluster
order= farthestPointTraversal(reps, metric=deltaEOKr2, start=primary)
enforce |ΔL| >= 0.08 between neighbours (nudge L, preserve rho)  # survives achromatopsia
leftovers (N > 12) -> decorative slots: gradient stops, mesh nodes, tag fills, poster bands
```

Determinism: the tie-breaker RNG is seeded with `xxhash(palette.join('-') + tpl.id + shuffleIndex)`, so "shuffle" is reproducible and shareable via URL. This is the thing Coolors gets wrong — its shuffle is a random permutation and most shuffles are unreadable.

---

## 7. Backend spec

PHP 8.5, PDO SQLite, no Composer, no framework. Layout: `/public` (SPA build + `index.php` router under `/api`), `/data` (denied dir: DB, sessions, logs, locks), `/config.php` (returns an array).

### 7.1 Connection preamble (every request, exact order)

```php
$pdo = new PDO('sqlite:'.DB_PATH, null, null, [
  PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
  PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
  PDO::ATTR_EMULATE_PREPARES => false,
  PDO::ATTR_STRINGIFY_FETCHES => false,
]);
$pdo->exec('PRAGMA busy_timeout=5000');                       // FIRST
$mode = $pdo->query('PRAGMA journal_mode=WAL')->fetchColumn();
if (strtolower($mode) !== 'wal') {                            // NFS home dir
  $pdo->exec('PRAGMA journal_mode=TRUNCATE; PRAGMA synchronous=FULL');
  $flags['wal'] = false;                                      // recorded, shown in admin
} else { $pdo->exec('PRAGMA synchronous=NORMAL'); }
$pdo->exec('PRAGMA foreign_keys=ON');                         // per-connection, never persisted
$pdo->exec('PRAGMA temp_store=MEMORY; PRAGMA cache_size=-8000');
```

**Every writing transaction uses `BEGIN IMMEDIATE`**, never `PDO::beginTransaction()`. A DEFERRED transaction upgrading read→write returns `SQLITE_BUSY` immediately, ignoring `busy_timeout`. This one rule removes essentially all "database is locked" reports.

### 7.2 Schema (full DDL, `STRICT` gated on SQLite ≥ 3.37)

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY, uuid TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE, email_lower TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL, display_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user',            -- user|admin
  status TEXT NOT NULL DEFAULT 'pending',       -- pending|active|suspended|deleted
  email_verified_at INTEGER, locale TEXT NOT NULL DEFAULT 'en',
  prefs_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, last_login_at INTEGER
) STRICT;
CREATE INDEX idx_users_status ON users(status);

CREATE TABLE sessions (
  sid TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL, ip TEXT NOT NULL, ua_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL,
  absolute_expires_at INTEGER NOT NULL, revoked_at INTEGER, payload BLOB
) STRICT;
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expiry ON sessions(absolute_expires_at);

CREATE TABLE tokens (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,                        -- verify|reset|email_change|delete
  token_hash BLOB NOT NULL UNIQUE, payload_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  used_at INTEGER, request_ip TEXT NOT NULL
) STRICT;
CREATE INDEX idx_tokens_user_purpose ON tokens(user_id, purpose);

CREATE TABLE palettes (
  id INTEGER PRIMARY KEY, uuid TEXT NOT NULL UNIQUE, slug TEXT NOT NULL UNIQUE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
  doc_json TEXT NOT NULL,                       -- the PaletteDoc IR
  hex_index TEXT NOT NULL,                      -- 'ef5b5b-...' for search
  color_count INTEGER NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'private',   -- private|unlisted|public
  likes INTEGER NOT NULL DEFAULT 0, views INTEGER NOT NULL DEFAULT 0,
  trend_score REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
) STRICT;
CREATE INDEX idx_pal_user ON palettes(user_id, updated_at DESC);
CREATE INDEX idx_pal_public ON palettes(visibility, trend_score DESC);
CREATE INDEX idx_pal_count ON palettes(color_count);

CREATE TABLE palette_versions (
  id INTEGER PRIMARY KEY, palette_id INTEGER NOT NULL REFERENCES palettes(id) ON DELETE CASCADE,
  version INTEGER NOT NULL, doc_json TEXT NOT NULL, label TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL, UNIQUE(palette_id, version)
) STRICT;

CREATE TABLE projects (
  id INTEGER PRIMARY KEY, uuid TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
) STRICT;

CREATE TABLE collections (
  id INTEGER PRIMARY KEY, uuid TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, visibility TEXT NOT NULL DEFAULT 'private',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
) STRICT;
CREATE TABLE collection_items (
  collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  palette_id INTEGER NOT NULL REFERENCES palettes(id) ON DELETE CASCADE,
  sort INTEGER NOT NULL DEFAULT 0, added_at INTEGER NOT NULL,
  PRIMARY KEY (collection_id, palette_id)
) STRICT;

CREATE TABLE colors (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hex TEXT NOT NULL, oklch_json TEXT NOT NULL, name TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL, UNIQUE(user_id, hex)
) STRICT;

CREATE TABLE tags (id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, label TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'style') STRICT;   -- style|hue|curated
CREATE TABLE palette_tags (
  palette_id INTEGER NOT NULL REFERENCES palettes(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (palette_id, tag_id)) STRICT;
CREATE INDEX idx_ptags_tag ON palette_tags(tag_id);

CREATE TABLE likes (
  palette_id INTEGER NOT NULL REFERENCES palettes(id) ON DELETE CASCADE,
  actor_key TEXT NOT NULL,                      -- user:<id> or iphash:<sha256 /64>
  created_at INTEGER NOT NULL, PRIMARY KEY (palette_id, actor_key)) STRICT;

CREATE TABLE export_templates (
  id INTEGER PRIMARY KEY, uuid TEXT NOT NULL UNIQUE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, extension TEXT NOT NULL, body TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'private',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL) STRICT;

CREATE TABLE rl (bucket TEXT PRIMARY KEY, tokens REAL NOT NULL, updated_at INTEGER NOT NULL) STRICT;

CREATE TABLE login_attempts (
  id INTEGER PRIMARY KEY, ts INTEGER NOT NULL, ip TEXT NOT NULL,
  account_key TEXT NOT NULL, ok INTEGER NOT NULL) STRICT;
CREATE INDEX idx_la_acct ON login_attempts(account_key, ts);
CREATE INDEX idx_la_ip ON login_attempts(ip, ts);

CREATE TABLE lockouts (account_key TEXT PRIMARY KEY, fails INTEGER NOT NULL,
  locked_until INTEGER NOT NULL, captcha_required INTEGER NOT NULL DEFAULT 0) STRICT;

CREATE TABLE mail_outbox (
  id INTEGER PRIMARY KEY, to_addr TEXT NOT NULL, subject TEXT NOT NULL,
  body_text TEXT NOT NULL, body_html TEXT NOT NULL, headers_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',        -- queued|sent|failed|dead
  attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT,
  created_at INTEGER NOT NULL, send_after INTEGER NOT NULL, sent_at INTEGER) STRICT;
CREATE INDEX idx_outbox_due ON mail_outbox(status, send_after);

CREATE TABLE settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL) STRICT;

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY, ts INTEGER NOT NULL, actor TEXT NOT NULL,
  action TEXT NOT NULL, target TEXT NOT NULL, meta_json TEXT NOT NULL DEFAULT '{}',
  ip TEXT NOT NULL) STRICT;
CREATE INDEX idx_audit_ts ON audit_log(ts DESC);

CREATE TABLE cron_runs (id INTEGER PRIMARY KEY, job TEXT NOT NULL, started_at INTEGER NOT NULL,
  finished_at INTEGER, ok INTEGER, note TEXT) STRICT;

CREATE VIRTUAL TABLE palettes_fts USING fts5(title, description, tags,
  content='palettes', content_rowid='id', tokenize='unicode61');
```

### 7.3 REST endpoints

`GET|POST /api/...`, JSON only, RFC 9457 `application/problem+json` on error. Auth column: **P**ublic, **S**ession, **A**dmin.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/meta` | P | feature flags, WAL status, hCaptcha sitekey, limits |
| GET | `/api/csrf` | P | issue/refresh CSRF token |
| POST | `/api/auth/register` | P | create pending user, queue verify mail |
| POST | `/api/auth/verify` | P | consume verify token, activate |
| POST | `/api/auth/login` | P | session login (+captcha when flagged) |
| POST | `/api/auth/logout` | S | destroy session |
| POST | `/api/auth/logout-all` | S | revoke all sessions for user |
| GET | `/api/auth/me` | S | current user + prefs |
| POST | `/api/auth/forgot` | P | queue reset mail (constant-time) |
| POST | `/api/auth/reset` | P | consume reset token, rehash, kill sessions |
| POST | `/api/auth/change-password` | S | requires current password |
| POST | `/api/auth/change-email` | S | two-step, token to new address |
| DELETE | `/api/auth/account` | S | token-confirmed hard delete |
| GET | `/api/account/export` | S | full JSON data dump |
| GET | `/api/palettes` | S | list own, filters + cursor pagination |
| POST | `/api/palettes` | S | create |
| GET | `/api/palettes/{uuid}` | P/S | read (public or owner) |
| PATCH | `/api/palettes/{uuid}` | S | update, writes a version row |
| DELETE | `/api/palettes/{uuid}` | S | soft delete |
| GET | `/api/palettes/{uuid}/versions` | S | version list |
| POST | `/api/palettes/{uuid}/restore/{v}` | S | restore version |
| POST | `/api/palettes/sync` | S | bulk upsert from IndexedDB, LWW by `updated_at` |
| GET | `/api/explore` | P | public feed: `?sort=trending\|new\|likes&hue=&style=&q=&count=` |
| GET | `/api/explore/{slug}` | P | public palette page payload |
| POST | `/api/palettes/{uuid}/like` | P | like/unlike, keyed by actor_key |
| GET/POST/PATCH/DELETE | `/api/projects[/{uuid}]` | S | CRUD |
| GET/POST/PATCH/DELETE | `/api/collections[/{uuid}]` | S | CRUD |
| POST/DELETE | `/api/collections/{uuid}/items/{palette}` | S | membership |
| GET/POST/DELETE | `/api/colors[/{id}]` | S | favourite colors |
| GET/POST/PATCH/DELETE | `/api/export-templates[/{uuid}]` | S | user export templates |
| POST | `/api/name` | P | batch color naming against the full list |
| POST | `/api/import/url` | S | server-side fetch + CSS-var scrape |
| GET | `/api/r/{slug}.json` | P | shadcn registry-item for `npx shadcn add` |
| GET | `/api/og/{slug}.png` | P | cached OG image (GD, 1200×630) |
| GET | `/api/selftest` | A | loopback probe of denied paths |
| GET | `/api/admin/stats` | A | counts, DB size, WAL state, cron health |
| GET/PATCH | `/api/admin/settings` | A | all settings (§8) |
| GET | `/api/admin/users` | A | list/search |
| PATCH | `/api/admin/users/{id}` | A | role, status, force-verify, reset |
| GET | `/api/admin/palettes` | A | moderation queue |
| PATCH | `/api/admin/palettes/{uuid}` | A | feature / unfeature / takedown |
| GET/POST/DELETE | `/api/admin/tags[/{id}]` | A | taxonomy |
| GET | `/api/admin/outbox` | A | mail queue, retry / kill |
| GET | `/api/admin/audit` | A | audit log |
| POST | `/api/admin/maintenance` | A | `vacuum_into` / `wal_checkpoint` / `optimize` / `prune` |
| GET | `/cron.php` | key | scheduled work (not under `/api`) |

### 7.4 Auth / session design

PHP native sessions with a **custom SQLite `SessionHandlerInterface`** writing to `sessions`. No JWTs, no tokens in `localStorage` — a single XSS would disclose every token, and with SQLite already present server state is free and revocation is instant.

`.user.ini`: `session.use_strict_mode=1`, `use_only_cookies=1`, `cookie_httponly=1`, `cookie_secure=1`, `cookie_samesite=Lax`, `use_trans_sid=0`, `cache_limiter=nocache`, `sid_length=48`, `sid_bits_per_character=6`, `session.save_path=/data/sessions`.

Cookie name `__Host-sid`, params `path=/`, empty domain, secure, httponly, samesite Lax. **Reject any `$_COOKIE` key whose `trim()` equals the session name but which is not byte-identical** — PortSwigger's Cookie Chaos bypass. `session_regenerate_id(true)` at login and privilege change with a 60 s grace for in-flight XHR. Idle 30 min, absolute 8 h, enforced in the payload not via gc.

CSRF: synchronizer token in `$_SESSION`, compared with `hash_equals()`, sent as `X-CSRF-Token`. Plus: require `Content-Type: application/json` (forces preflight), and exact-match `Origin` with `Referer` fallback. SameSite is defence-in-depth only.

Passwords: detect Argon2id with `in_array(PASSWORD_ARGON2ID, password_algos(), true)` — **never `defined()`**. If present, `['memory_cost'=>19456,'time_cost'=>2,'threads'=>1]` (19 MiB, not PHP's 64 MiB default which blows cheap FPM `memory_limit`). Else bcrypt cost 12–13 tuned to ≤350 ms. Pepper as `base64_encode(hash_hmac('sha384', $pw, $pepper, true))` because bcrypt truncates at 72 bytes and PHP 8 throws on NUL. Input capped at 4096 bytes. `password_needs_rehash()` on every successful login.

Tokens: `bin2hex(random_bytes(32))`, store only `hash('sha256',$raw,true)`. Consume atomically:
`UPDATE tokens SET used_at=:now WHERE token_hash=:h AND used_at IS NULL AND expires_at>:now` and require `rowCount()===1`. Reset expiry 30 min, verify 24 h. Token travels in the **URL fragment** (`/#/reset?t=…`) so it never reaches logs, proxies or `Referer`; that route also sets `Referrer-Policy: no-referrer`.

### 7.5 Rate limiting

Client IP is `REMOTE_ADDR` only, unless `REMOTE_ADDR` falls inside Cloudflare's published ranges (refreshed nightly by cron), in which case `CF-Connecting-IP`. Never the leftmost `X-Forwarded-For`. Key IPv6 by `/64`, IPv4 by `/32`.

Per-IP/endpoint: lazy-refill **token bucket** on table `rl`, single `INSERT … ON CONFLICT DO UPDATE … RETURNING tokens` inside `BEGIN IMMEDIATE`. Buckets: `login` 5/5min, `register` 3/hour, `forgot` 3/hour, `write` 60/min, `read` 300/min, `name` 30/min, `import/url` 10/hour, `og` 60/min.

Per-account: sliding-window log on `login_attempts`, `ts > now-900`. Lockout `delay = min(900, 1 << max(0, fails-3))` seconds in `lockouts`. **Identical 401 body and status whether locked or wrong password** — no enumeration oracle. `Retry-After` only on the IP-level 429. Above 5 fails, set `captcha_required=1` and return `{"captcha":true}` so the SPA renders hCaptcha.

### 7.6 hCaptcha

`POST https://api.hcaptcha.com/siteverify` as `application/x-www-form-urlencoded` (a JSON body returns `success:false`), params `secret`, `response`, `remoteip`, **`sitekey`** (pins the token to our widget). 5 s timeout, **fail closed**. Tokens are single-use with a 120 s TTL — never retry one. Map `expired-input-response` and `already-seen-response` to a "please retry the challenge" UI state, everything else to a generic failure. `hostname` is never used for authorisation (can be `not-provided`). Triggered on: register always, login when `captcha_required`, forgot-password always, `import/url` above 3/hour.

### 7.7 Mail

Everything queues into `mail_outbox`; `cron.php` flushes. `mail()` returning true only means "accepted for delivery", so the outbox gives us retries, throttling and a real failure log.

Send: `mail($to, $subject, $body, $headersArray, '-f'.$bounce)` — **array header form only** (PHP formats it and blocks injection; the string form does not). Unix line endings `\n` only. Headers: `From` (a mailbox on this host, or SPF fails), `Reply-To`, `Date`, `Message-ID: <hex32@domain>`, `MIME-Version: 1.0`, `Content-Type: multipart/alternative; boundary="=_…"`, `Content-Transfer-Encoding: quoted-printable`, `Auto-Submitted: auto-generated`. Subject via `mb_encode_mimeheader($s,'UTF-8','B',"\n")`. Envelope domain must equal the From domain for DMARC alignment. Always include a text/plain part. `.user.ini`: `mail.add_x_header=0`, `mail.log` into `/data`. Throttle 100/hour default (admin-settable). Retry schedule 1m, 5m, 30m, 2h, 12h then `dead`.

Templates: verify, reset, password-changed notice, email-change confirm, account-deleted receipt, admin alert.

### 7.8 Cron

Single `cron.php`, invoked by the host scheduler every 5 minutes.

```php
if (!hash_equals(CRON_KEY, (string)($_SERVER['HTTP_X_CRON_KEY'] ?? $_GET['k'] ?? ''))) {
    http_response_code(404); exit; }          // identical 404 — no existence leak
$fh = fopen(LOCK, 'c');
if (!flock($fh, LOCK_EX|LOCK_NB)) { exit; }   // never unlink the lock (unlink/flock race)
ftruncate($fh,0); fwrite($fh, getmypid().' '.time()); ignore_user_abort(true);
$deadline = microtime(true) + 20;
```

`$fh` is held in a static until shutdown. A run older than 15 minutes may steal the lock. Jobs, each chunked against `$deadline`: flush outbox → prune `login_attempts` (>30 d), expired `tokens`, expired `sessions`, soft-deleted palettes (>30 d) → recompute `trend_score` (`likes / pow(hours_age + 2, 1.5)`) → rebuild `palettes_fts` deltas → refresh Cloudflare IP ranges → `PRAGMA wal_checkpoint(TRUNCATE)` → `PRAGMA analysis_limit=400; PRAGMA optimize` → nightly `VACUUM INTO '/data/backup-YYYYMMDD.sqlite'` keeping 7. Every job writes a `cron_runs` row; admin dashboard flags "no successful run in 30 min".

### 7.9 Install wizard

`install.php`, **line 1**: `if (file_exists(CONFIG) || file_exists(DATA.'/.installed')) { http_response_code(410); exit; }`.

Preflight checks: PHP ≥ 8.5, `pdo_sqlite` + SQLite version (RETURNING ≥3.35, STRICT ≥3.37, UPSERT ≥3.24), `password_algos()`, `function_exists('mail')` vs `disable_functions`, `open_basedir`, curl or `allow_url_fopen`, mod_rewrite + mod_headers via loopback probes, `/data` writability, and a **WAL probe** (create temp DB, set WAL, read it back — detects NFS).

Anti-install-race (the WordPress `wp-admin/install.php` class of attack, real on FTP deploys): on first hit `install.php` writes `data/setup-<rand>.txt` and refuses to proceed until the operator pastes its contents back, proving filesystem access.

On submit: generate `config.php` **as a PHP file returning an array** (unreadable even if the deny rule fails), holding the random DB filename `.ht<32hex>.sqlite`, `APP_KEY`, CSRF/HMAC key, password pepper, `CRON_KEY`, hCaptcha keys. Run migrations, create the admin user, then the **loopback self-test**: fetch `https://host/data/<dbfile>`, `-wal`, `-shm`, `.user.ini`, `config.php` and assert 403/404 — **refuse to complete on any 200**. Finally write `data/.installed`, `chmod($self, 0000)` and `rename()` to `install.php.<rand>.disabled` (chmod is unreliable over FTP, so the file-existence guard is the real lock).

---

## 8. Admin surface

**Site** — site name, base URL, default locale + enabled locales, brand logo, public signup on/off, maintenance mode + message, default theme (light/dark/system), analytics snippet slot (off by default).
**Accounts** — email verification required y/n, minimum password length (default 12), Argon2id params (memory/time/threads) or bcrypt cost, session idle timeout (30 m), absolute timeout (8 h), max concurrent sessions per user, allow account deletion y/n, allowed email domains / blocklist.
**Rate limits** — per-bucket capacity + refill rate for `login|register|forgot|write|read|name|import|og`; lockout threshold, base delay, max delay; captcha trigger threshold.
**hCaptcha** — enabled, sitekey, secret, which endpoints (register/login/forgot/import), fail-open toggle (default off), verify timeout.
**Mail** — From name + address, bounce address, Reply-To, per-hour cap, retry schedule, per-template subject + body overrides with a token list, test-send button, outbox viewer (retry/kill/purge).
**Content** — max colors per palette (default 20, hard ceiling 40), max palettes per user (default unlimited), public explore on/off, moderation mode (open / review-before-public), featured palettes, tag taxonomy CRUD, banned hex list, OG image on/off + cache TTL.
**Engine defaults** — default gamut (`srgb`), default map method (`raytrace`), default contrast model (`apca`), default `minLc` per role pair, default dark strategy (`contrastPreserve`), dark floor/ceiling, default distribution, default swatch count, naming vocabulary default.
**Export** — which emitters are enabled, registry base URL, allow user export templates y/n, max template size.
**Database** — WAL status indicator + NFS-fallback banner, DB size, page count, `VACUUM INTO` backup now, download backup, `wal_checkpoint(TRUNCATE)`, `PRAGMA optimize`, integrity check, prune-now for each retention window, retention days per table.
**Security** — CSP report-only toggle + report URI, trusted proxy mode (none / Cloudflare), Cloudflare range refresh now, run `/api/selftest` now with a pass/fail matrix, force-logout-all, audit log viewer with filters.
**Cron** — cron URL + key (regenerate), last run per job, durations, failures, run-now per job.
**Users** — search, role, status, force verify, force password reset, revoke sessions, impersonate (audited), export user data, delete.

---

## 9. Build order

1. **M1 — Skeleton.** Vite 8 + Vue 3.5 + TS 7 + Tailwind 4.3 + shadcn-vue init, path aliases in both tsconfigs, router 5, Pinia 4 with split `usePaletteStore` / `useUiStore`, vue-sonner, i18n scaffold. CI: `vue-tsc`, vitest, eslint.
2. **M2 — Color engine core.** `core/*`: conversions (CSS Color 4 route), Ray Trace + MINDE gamut mapping, cusp + `maxChroma` + chroma-ceiling LUT, ΔEOK/2/r2, parse/format. Golden-file tests against colorjs.io as devDependency oracle. **Nothing renders yet — this milestone is pure math with 100% coverage.**
3. **M3 — a11y module.** Vendored APCA (SA98G), WCAG 2.2, `disagreement()`, `solveForContrast`, `pickTextColor`, `fontLookupAPCA`, Machado CVD matrices + SVG filters. Test vectors from the APCA lookup table.
4. **M4 — Random module + range UI.** Seeded RNG, distributions, wrap-around hue, stable unit tuples, dual-thumb accessible slider (`role="group"` + two `role="slider"`, Alt-drag translate, Shift-drag scale, thumbs cross → wrap), live gradient tracks with gamut hatch, preview grid with pinning. This is the single most differentiated surface; build it early and hard.
5. **M5 — Generator v1.** Swatch columns, lock/partial-lock, insert-N interpolation, drag + keyboard reorder (pragmatic-dnd), harmony schemes on three wheels with the continuous α slider, undo/redo via `useManualRefHistory` committed at semantic boundaries, `useMagicKeys` bindings, `?` overlay, `⌘K` palette.
6. **M6 — URL codec + persistence.** Versioned binary buffer, 12-bit-per-channel OKLCH bitpack, `CompressionStream('deflate-raw')` above 150 B, native base64url, hash-only, `replaceState` throttled to 500 ms. IndexedDB via `idb-keyval`, Zod 4 inbound validation with soft fail. First 6 preview templates.
7. **M7 — Scales + theme.** `buildRamp`, `tailwind11` with arbitrary anchor step, `radix12`, `tonalHCT`, Poline `getColorAt(t)`, all five dark strategies, alpha derivation with the ±1 browser-rounding correction, semantic derivation (success/warning/danger/info).
8. **M8 — Token graph + core exporters.** CSS vars (8 notations), Tailwind v4 `@theme`, v3 config, SCSS, shadcn/tweakcn 45-key `globals.css`, JSON/TS, CSV. Notation picker, prefix-vs-Tailwind guard.
9. **M9 — Import / round-trip.** Paste `globals.css`, `tailwind.config.js`, DTCG (both dialects), hex list, ASE, GPL. Radius-scale form detection and upgrade. This closes the tweakcn gap.
10. **M10 — Role assignment solver.** Stages 1–5, seeded determinism, template manifests, contrast chips via `v-contrast`, CVD 2×2 overlay, collision detector.
11. **M11 — Preview templates batch 2** (8 more) + template-derived adjacency matrix feeding the generator.
12. **M12 — Backend foundation.** Install wizard with anti-race + loopback self-test, config.php, migrations, PDO preamble with WAL probe + NFS fallback, router, RFC 9457 errors, `.htaccess`/`.user.ini` set, CSP, `/api/meta`, `/api/selftest`.
13. **M13 — Auth + rate limiting + mail + cron.** Sessions handler, CSRF, register/verify/login/forgot/reset/delete, token bucket + sliding window + lockout, hCaptcha, mail outbox, `cron.php` with flock and deadline chunking.
14. **M14 — Palette sync + library.** Palettes/projects/collections/colors/versions CRUD, LWW sync from IndexedDB, FTS, public pages, OG images, likes, explore feed with trend scoring.
15. **M15 — Remaining exporters + templates.** ASE/GPL/sketchpalette/Android/Swift+colorset zip/Flutter/Kotlin/DTCG/Style Dictionary/Tokens Studio/shadcn registry/PDF/PNG/SVG. User-authorable export templates. Remaining 16 preview templates.
16. **M16 — Admin surface.** Every setting in §8, audit log, outbox viewer, DB maintenance, cron health, user management.
17. **M17 — Image extraction + naming.** Octree + k-means-in-OKLab + Vibrant scoring, draggable pickers, `/api/name` with the full VPTree list, browser subsets, per-palette uniqueness.
18. **M18 — Hardening & launch.** Full a11y audit (keyboard DnD, slider ARIA, focus order), Lighthouse, bundle budget (< 200 kB gzip entry), offline PWA shell, load test the API, run `/api/selftest` in CI against staging, docs + shortcut reference.

---

## 10. Traps

**Shared hosting / PHP**
1. **`PDO::beginTransaction()` on SQLite is DEFERRED** — a read→write upgrade returns `SQLITE_BUSY` ignoring `busy_timeout`. → `exec('BEGIN IMMEDIATE')` for every write, enforced by a lint rule that bans `beginTransaction` in the repo.
2. **WAL does not work over NFS** and many cPanel clusters NFS-mount `/home`. → Read back the `journal_mode` pragma return value; fall back to `TRUNCATE` + `synchronous=FULL`, record the flag, surface it in admin.
3. **`php_value` in `.htaccess` 500s under PHP-FPM.** → `.user.ini` only, and remember its 300 s `cache_ttl` means edits take 5 minutes to apply. `.user.ini` is served as plaintext — deny it.
4. **Never `copy()` or `fopen()` the DB file.** Any `close()` in the process cancels all POSIX advisory locks (howtocorrupt §2.2). → Backups only via `VACUUM INTO`. No hard/symlinks to the DB (§2.6).
5. **`PASSWORD_ARGON2ID` is often absent** on shared hosts and `defined()` lies. → `in_array(PASSWORD_ARGON2ID, password_algos(), true)`. PHP's 64 MiB default memory_cost exceeds cheap FPM limits → use 19456.
6. **`mail()` with a string `$additional_headers` is a header-injection vector**, and `\r\n` becomes `\r\r\n` after sendmail, breaking DKIM. → Array headers, `\n` only, `-f` validated with `FILTER_VALIDATE_EMAIL` before it hits `escapeshellcmd()`.
7. **`session.save_path` defaults to world-readable `/tmp`** on shared hosts. → Custom SQLite handler into the denied dir.
8. **The SQLite file must not be web-reachable.** → `.ht<32hex>.sqlite` (stock Apache's `<FilesMatch "^\.ht">Require all denied</FilesMatch>` survives `AllowOverride None`), plus a `data/.htaccess`, plus a loopback self-test that refuses install on a 200.
9. **`max_execution_time` kills long cron runs mid-write.** → 20 s deadline, chunked jobs, `flock(LOCK_EX|LOCK_NB)` with a stale-steal rule, never `unlink` the lock file.
10. **`install.php` left live is an account-takeover.** → Existence guard on line 1, filesystem-proof challenge file, rename-on-success.
11. **hCaptcha tokens are single-use with a 120 s TTL.** → Never retry a token; distinguish `expired-input-response` in the UI. Fail closed on network error.
12. **`X-Forwarded-For` is attacker-controlled.** → `REMOTE_ADDR` unless it is inside Cloudflare's published ranges.
13. **`__Host-` prefix bypass via Unicode-prefixed cookie names.** → Reject any `$_COOKIE` key that `trim()`s to the session name without being identical.

**Browser / frontend**
14. **Vue's deep reactivity proxy on `{mode,l,c,h}` objects tanks a 60 fps picker drag.** → All color objects in `shallowRef` / `markRaw`; engine modules never import Vue.
15. **`useMode()` is a module side effect.** → Register `modeOklch`/`modeRgb`/`modeP3`/`modeOklab` once in an `engine/core/space.ts` singleton, never in `setup()`.
16. **`Math.cbrt` of a negative LMS via `x**(1/3)` returns NaN.** → `cbrtSigned` everywhere, with a test for wide-gamut input.
17. **`useRefHistory` records every reactive tick** — one hue drag = 400 entries. → `useManualRefHistory` committed on `pointerup`/blur/enter, or `useDebouncedRefHistory` at 250 ms; coalesce same-path edits within 300 ms; historied and UI stores are separate so Ctrl+Z never rewinds a panel toggle; a `suppress` flag during undo application.
18. **Safari throttles `replaceState` to ~100 calls per 30 s and drops the excess silently.** → Throttle URL writes to 500 ms, and use `replaceState` not `pushState` (Back must not become an accidental undo).
19. **`Ctrl+S` / `Ctrl+P` fight the browser.** → Rebindable defaults using `Ctrl+Shift+S` / `Ctrl+Shift+P` for save/palettes, with `passive:false` + `preventDefault` in `useMagicKeys.onEventFired`, and an `useActiveElement()` guard so nothing fires inside inputs.
20. **CVD matrices applied to gamma-encoded sRGB are wrong.** → Apply in linear RGB; `feColorMatrix color-interpolation-filters="linearRGB"` does this for free.
21. **Fixed-chroma hue rotation blows the sRGB gamut** (red C 0.258 → cyan C 0.155 at the same L). → Preserve relative chroma ρ, gamut-map with Ray Trace, and paint the per-hue chroma ceiling directly on the slider track so the user sees the wall before hitting it.
22. **MINDE gamut mapping bands in gradients.** → Ray Trace is the default; MINDE is available only as an explicit comparison mode.
23. **Clamping Gaussian draws piles probability mass on the range endpoints.** → Reject and resample.
24. **`toGamut` in culori is a spec *variant*, and chroma-js only clips.** → Never use either for gamut work; our own Ray Trace implementation is authoritative, tested against colorjs.io.
25. **jsPDF is 29 MB unpacked; echarts is 58.9 MB.** → jsPDF behind a dynamic `import()`; no chart library at all; hand-authored SVG → `XMLSerializer` → canvas for swatch sheets rather than a DOM rasterizer.
26. **`radix-vue`, `vuedraggable@next`, `tailwindcss-animate`, `file-saver`, `jszip`, `lz-string`, `pinia-undo`, `@vueuse/motion` are all dead or superseded.** → reka-ui, pragmatic-dnd, tw-animate-css, `showSaveFilePicker`, fflate, `CompressionStream`, our own inverse-command log, motion-v.
27. **`@vee-validate/zod` still pins Zod 3.** → TanStack Form.
28. **CSP: the hCaptcha widget forces `'unsafe-inline'` in `style-src`.** → Accept it there only; never `script-src data:`; a Vite production build emits no inline scripts so `'self'` suffices without nonces. `index.html` is `no-store`, hashed assets `max-age=31536000, immutable`.
29. **A truncated share link must never produce a blank screen.** → Zod-parse the hash, fail soft to a default palette with a toast, and degrade to a save-and-shortlink flow above 2000 chars.
30. **`oklch()` is Baseline but P3 availability is not.** → `@supports (color: oklch(0% 0 0))` native value plus a converted sRGB fallback per swatch, `matchMedia('(color-gamut: p3)')` for the P3-only badge dot.