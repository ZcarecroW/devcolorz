I have everything needed. Compiling the findings.

# OKLCH / OKLab Color Science — Implementation Reference (2026)

## 1. sRGB → OKLab: exact pipeline

**Step 0 — sRGB transfer function (gamma decode), per channel c ∈ [0,1]:**
```
lin(c) = c/12.92                     if c ≤ 0.04045
       = ((c + 0.055)/1.055)^2.4     otherwise
```
(WCAG 2.x text says `0.03928`; W3C published an erratum — `0.04045` is correct. Difference is negligible at 8-bit.)

**Two valid routes.** Ottosson's original fuses linear-sRGB→LMS into one matrix; CSS Color 4 routes via XYZ-D65 with recomputed coefficients for a consistent reference white. **They differ in the last few digits — pick one and be consistent**, or you'll get `oklch()` values that don't round-trip against Chrome DevTools.

**Route A — Ottosson direct (linear sRGB → LMS):**
```
l = 0.4122214708r + 0.5363325363g + 0.0514459929b
m = 0.2119034982r + 0.6806995451g + 0.1073969566b
s = 0.0883024619r + 0.2817188376g + 0.6299787005b
```
**Route B — CSS Color 4 (XYZ-D65 → LMS), what colorjs.io/culori use:**
```
XYZ→LMS = [ 0.8190224379967030,  0.3619062600528904, -0.1288737815209879 ]
          [ 0.0329836539323885,  0.9292868615863434,  0.0361446663506424 ]
          [ 0.0481771893596242,  0.2642395317527308,  0.6335478284694309 ]
```

**Nonlinearity:** `l' = ∛l, m' = ∛m, s' = ∛s` (use `Math.cbrt`, and preserve sign for out-of-gamut negatives: `Math.sign(x)*Math.cbrt(Math.abs(x))` — naive `x**(1/3)` returns NaN on negative LMS, a very common bug when mapping wide-gamut input).

**LMS' → OKLab (CSS-recalculated):**
```
[ 0.2104542683093140,  0.7936177747023054, -0.0040720430116193 ]
[ 1.9779985324311684, -2.4285922420485799,  0.4505937096174110 ]
[ 0.0259040424655478,  0.7827717124575296, -0.8086757549230774 ]
```
**Inverse OKLab → LMS':**
```
[ 1, 0.3963377773761749,  0.2158037573099136 ]
[ 1, -0.1055613458156586, -0.0638541728258133 ]
[ 1, -0.0894841775298119, -1.2914855480194092 ]
```
Then cube, then **LMS → XYZ:**
```
[  1.2268798758459243, -0.5578149944602171,  0.2813910456659647 ]
[ -0.0405757452148008,  1.1122868032803170, -0.0717110580655164 ]
[ -0.0763729366746601, -0.4214933324022432,  1.5869240198367816 ]
```

**OKLab → OKLCH:** `C = √(a²+b²)`, `h = atan2(b,a)` in degrees mod 360. Inverse: `a = C·cos(h)`, `b = C·sin(h)`.

## 2. CSS syntax + browser support (2026)

```
oklch() = oklch( [<percentage>|<number>|none] [<percentage>|<number>|none] [<hue>|none] [ / <alpha> ]? )
```
Percent reference ranges — **L: 0% = 0.0, 100% = 1.0; C: 0% = 0.0, 100% = 0.4**. For `oklab()`, a and b: **−100% = −0.4, 100% = 0.4**. **Powerless-hue epsilon: C ≤ 0.000004** (below this, hue is dropped in interpolation). C is unbounded above but in practice never exceeds ~0.5.

- **`oklab()`/`oklch()`: Baseline Widely Available since 2025-11-09.** Safari 15.4 (2022-03-14) — earliest; Chrome/Edge 111 (2023-03); Firefox 113 (2023-05-09).
- **Relative color syntax** `oklch(from var(--brand) l c h / .5)` and `color-mix()` — cross-browser baseline in 2026.
- **`contrast-color()`** (renamed from `color-contrast()`): Safari 26 → Firefox 146 → Chrome 147, **Baseline newly available April 2026**. It only returns **black or white** at WCAG AA — deliberately minimal. **This is the differentiator to beat**: a tool that returns a *tinted, chroma-preserving, APCA-targeted* text color does something CSS structurally cannot.

## 3. Why OKLCH lightness beats HSL — worked example

HSL "lightness" is `(max+min)/2` of gamma-encoded RGB — a geometric artifact, not a perceptual quantity. Every fully-saturated hue sits at `L=50%`. Computed OKLCH for `hsl(H 100% 50%)`:

| CSS | OKLCH L | C | H° | WCAG Y |
|---|---|---|---|---|
| `hsl(240 100% 50%)` blue | **45.20%** | 0.3132 | 264.05 | 0.0722 |
| `hsl(0 100% 50%)` red | 62.80% | 0.2577 | 29.23 | 0.2126 |
| `hsl(300 100% 50%)` magenta | 70.17% | 0.3225 | 328.36 | 0.2848 |
| `hsl(120 100% 50%)` green | 86.64% | 0.2948 | 142.50 | 0.7152 |
| `hsl(180 100% 50%)` cyan | 90.54% | 0.1546 | 194.77 | 0.7874 |
| `hsl(60 100% 50%)` yellow | **96.80%** | 0.2110 | 109.77 | 0.9278 |

**A single HSL lightness value spans 51.6 points of OKLCH lightness.** Yellow is 12.8× more luminous than blue at identical `L=50%`. This is exactly why HSL-derived palette ramps produce a "muddy purple" mid-tone and a "glaring yellow" — and why `oklch(62.8% 0.25 H)` sweeping H gives genuinely equal-weight swatches. Note also **C is not comparable across hues**: max sRGB chroma is 0.30 at magenta but 0.11 at cyan, so a fixed-C ramp will clip in some hues and look desaturated in others. Normalize as a *percentage of max chroma at that (L,H)*.

## 4. Gamut mapping — the spec now has THREE algorithms

Big 2026 update: CSS Color 4 §14.2 now specifies **three** algorithms, and implementations "may choose any of the three based on quality/runtime tradeoffs." All do constant-lightness, constant-hue chroma reduction in OKLCH. All return white if L ≥ 1.0, black if L ≤ 0.0.

**(a) Binary Search with Local MINDE** (§14.2.2) — the classic:
```
JND = 0.02;  epsilon = 0.0001
if inGamut(origin_OkLCh) → convert & return
clipped = clip(current); E = deltaEOK(clipped, current)
if E < JND → return clipped
min = 0; max = C_origin; min_inGamut = true
while (max - min > epsilon):
  chroma = (min + max) / 2;  current.C = chroma
  if (min_inGamut && inGamut(current)) { min = chroma; continue }
  clipped = clip(current); E = delta(clipped, current)
  if (E < JND) { if (JND - E < epsilon) return clipped; else { min_inGamut = false; min = chroma } }
  else max = chroma
return clipped
```
`clip()` converts to destination and clamps each channel to its reference range. Known weakness: **the result can land anywhere inside the JND window, causing visible banding in gradients** (csswg #7135).

**(b) Ray Trace** (§14.2.6) — by Isaac Muse, ColorAide. Converts to linear-light destination RGB where the gamut is an **axis-aligned cube**, then slab-tests a ray from the achromatic anchor `(L, 0, h)` to the color. **Max 4 iterations**, each re-projecting back to OKLCH and restoring `l_origin`/`h_origin` to stay on the curved chroma-reduction path. Bounds `low = 0 + 1e-12`, `high = 1 - 1e-12` (use `1e-6` for 32-bit). Ray/AABB slab test with `abs(d) > 1e-12` guard, `tnear = max(min(t1,t2), tnear)`, `tfar = min(max(t1,t2), tfar)`; if `tnear < 0` use `tfar`. Final simple clip for FP error. **"Results comparable to binary search with low JND, but resolves much faster and within more predictable, consistent time."** — this is the one to implement if you want both quality and no banding.

**(c) EdgeSeeker** — by Alexey Ardov for color.js. Precomputed LUT of max-chroma OKLCH per hue slice; boundary modeled as curved top + linear bottom meeting at the cusp. Fastest, costs memory. Spec pseudocode still TODO.

**ΔE metrics (§20) — also new:**
```
deltaEOK   = √(ΔL² + Δa² + Δb²)                    // plain Euclidean in OKLab
deltaEOK2  = √(ΔL² + (2Δa)² + (2Δb)²)              // ΔEOK underestimates colorfulness
deltaEOKr2 = √((toe(L1)-toe(L2))² + (2Δa)² + (2Δb)²)
toe(x): K1=0.206, K2=0.03, K3=(1+K1)/(1+K2)
        return 0.5*(K3*x - K1 + √((K3*x-K1)² + 4*K2*K3*x))
```
**The spec explicitly says: "Implementations which are performance-sensitive are encouraged to use ΔEOKr2."** Most tools still use plain ΔEOK — **using ΔEOKr2 is a free correctness win nobody has shipped in a UI yet.**

**Library alternatives:** culori's `clampChroma(color, mode='lch', rgbGamut='rgb')` is naive chroma reduction (fast, can over-reduce near concave surfaces); `toGamut(dest='rgb', mode='oklch', delta=differenceEuclidean('oklch'), jnd=0.02)` is a *variant* of the spec algorithm — culori's docs admit "the algorithm itself is slightly different." chroma.js has **no real gamut mapping — it just clips channels**, which causes the hue shifts the spec was written to avoid.

## 5. display-p3 vs sRGB — concrete chroma headroom

Max OKLCH chroma at L = 0.65, computed by bisection:

| Hue | sRGB | P3 | gain |
|---|---|---|---|
| 195 cyan | 0.1109 | 0.1490 | **+34.4%** |
| 29 red | 0.2362 | 0.2978 | **+26.1%** |
| 142 green | 0.2187 | 0.2575 | +17.8% |
| 110 yellow | 0.1419 | 0.1648 | +16.2% |
| 328 magenta | 0.2993 | 0.3269 | +9.2% |
| 264 blue | 0.1861 | 0.2007 | **+7.9%** |

**P3's gain is wildly hue-dependent** — huge in cyan/red, nearly nothing in blue. A UI showing "in sRGB / in P3 / out of both" per swatch, with the boundary drawn on the chroma slider track, is genuinely useful and rare. Detect with `@media (color-gamut: p3)` / `matchMedia('(color-gamut: p3)')`.

## 6. Contrast

**WCAG 2.x:** `Y = 0.2126R + 0.7152G + 0.0722B` on linearized channels; `ratio = (L1 + 0.05)/(L2 + 0.05)`, lighter first. Thresholds 4.5:1 (AA normal), 3:1 (AA large/UI), 7:1 (AAA).

**Its failure, demonstrated:**

| pair | WCAG | APCA Lc |
|---|---|---|
| `#767676` on `#ffffff` | 4.54:1 ✅ AA | **71.6** (usable) |
| `#767676` on `#000000` | **4.62:1 ✅ AA** | **−30.1** (barely spot-readable) |
| `#949494` on `#000000` | 6.92:1 ✅ AA | −44.6 |
| `#0000ff` on `#ffffff` | 8.59:1 ✅ AAA | 85.8 |

The same grey scores **higher** on black than on white under WCAG while being dramatically less readable. The `+0.05` flare constant dominates as both terms approach zero, so WCAG's error grows as colors darken — it is "incapable of correctly indicating contrasts with dark color pairs," which is fatal for dark mode.

**APCA-W3 (SA98G) exact constants and algorithm:**
```
mainTRC 2.4 | sRco 0.2126729, sGco 0.7151522, sBco 0.0721750
normBG 0.56, normTXT 0.57, revTXT 0.62, revBG 0.65
blkThrs 0.022, blkClmp 1.414, scaleBoW 1.14, scaleWoB 1.14
loBoWoffset 0.027, loWoBoffset 0.027, deltaYmin 0.0005, loClip 0.1
```
Note APCA uses a **simple power curve `(c/255)^2.4`, not sRGB's piecewise function.**
```
Y = 0.2126729·R^2.4 + 0.7151522·G^2.4 + 0.0721750·B^2.4
soft clamp: Y = Y > 0.022 ? Y : Y + (0.022 - Y)^1.414   // both txt and bg
if |bgY - txtY| < 0.0005 → return 0
BoW (bgY > txtY): S = (bgY^0.56 - txtY^0.57) * 1.14; Lc = S < 0.1 ? 0 : (S - 0.027)*100
WoB (bgY ≤ txtY): S = (bgY^0.65 - txtY^0.62) * 1.14; Lc = S > -0.1 ? 0 : (S + 0.027)*100
```
Range roughly **0…106 (dark text) and 0…−108 (light text)**; sign encodes polarity.

**Bronze thresholds:** Lc 90 preferred body (18px/300, 14px/400; 12px non-body) · **Lc 75 minimum body** (24px/300, 18px/400, 16px/500, 14px/700) · Lc 60 non-body (24px/400, 21px/500, 18px/600, 16px/700) · Lc 45 large/headline (36px normal, 24px bold) · Lc 30 spot-readable (placeholders, disabled) · Lc 15 non-text (dividers, focus rings, min 5px).

**Picking text color for a background — the recommended algorithm:**
1. Compute bg Y once.
2. `apca-w3` exports `reverseAPCA(targetLc, bgY, 'bg', 'hex')` → the achromatic grey hitting that Lc. Use it as a **lightness target**, not the final answer.
3. Convert bg to OKLCH, keep hue, and binary-search OKLCH **L** (chroma held at ~0.02–0.06 for a tinted-neutral) until APCA hits target Lc. OKLCH L is monotonic in luminance, so plain bisection converges in ~15 steps.
4. Gamut-map the result (Ray Trace), then verify Lc on the *mapped* color — mapping can move it.
5. `fontLookupAPCA(Lc)` returns min font sizes for weights 100–900, e.g. `Lc 60 → [60,72,48,42,24,21,18,16,16,18]`.

**Beat the field here:** every tool reports one number. Report both WCAG and APCA side by side, flag the pairs where they *disagree* (dark-mode greys), and drive the picker so dragging L shows live Lc plus the minimum font size for the chosen weight.

## 7. Libraries — measured, current

| package | latest | last publish | min | **min+gzip** | deps | ESM/tree-shake |
|---|---|---|---|---|---|---|
| **culori** | 4.0.2 | 2025-06-27 | 61.9 kB | **22.5 kB** | 0 | yes, via `culori/fn` |
| **colorjs.io** | 0.7.1 | 2026-07-24 | 82.0 kB | **32.8 kB** | 0 | yes, procedural API |
| **chroma-js** | 3.2.0 | 2025-11-28 | 41.8 kB | **16.5 kB** | 0 | **no ESM entry** |
| **colord** | 2.9.5 | — | 6.2 kB | **2.1 kB** | 0 | yes (plugins) |
| **@texel/color** | 1.1.11 | 2026-01-07 | — | **~3.5 kB** for OKLCH→sRGB only | 0 | yes, aggressive |
| **apca-w3** | 0.1.9 | 2022-07-04 | 11.6 kB | **4.8 kB** | 1 (`colorparsley`) | no |

**`coloraide` is Python-only — it is not on npm.** Do not plan around a JS version; port its Ray Trace algorithm from the CSS spec pseudocode instead.

- **colorjs.io** — by the CSS Color spec editors. Reference-grade: real gamut mapping (`toGamut({method:"css"|"clip"|"raytrace"|"edgeseeker"})`, default `"css"`), ΔE76/CMC/2000/Jz/OK, CAT02/CAT16/Bradford/von Kries adaptation. Still 0.x, heaviest, class-based API is slow in hot loops. Best as a **build-time / test oracle**, not a runtime dependency.
- **culori** — the pragmatic default. Used by **Tailwind CSS v4 and Radix UI**. Full CSS Color 4 parsing/formatting, `formatCss` emits real `oklch()`. Caveat: `toGamut` is a spec *variant*, and the tree-shaken `culori/fn` build requires manual `useMode(modeOklch)` registration.
- **chroma-js** — great scales and `bezier()`/`correctLightness()` for data viz, but **gamut handling is naive clipping** and there's no ESM entry point, so it won't tree-shake in a Vite build. Don't use it for the color-engine core.
- **@texel/color** — the sleeper. Claims **3.4× faster conversions and 68.9× faster gamut mapping than culori**, 6.5–131.7× vs colorjs.io, with `gamutMapOKLCH()` offering `MapToL`, `MapToGray`, `MapToCuspL`, `MapToAdaptiveGray`, `MapToAdaptiveCuspL` strategies plus a built-in `deltaEOK()`.

### Recommendation for a 2026 Vue app

**culori (via `culori/fn`) as the core + `apca-w3` for contrast**, with `@texel/color` swapped in for the gamut-mapping hot path if you're mapping per-frame (live gradient previews, canvas pickers). Rationale:

1. **Vite tree-shaking is the deciding factor.** chroma-js has no ESM entry and lands as a whole ~16.5 kB blob; culori's `culori/fn` with only `modeOklch`/`modeRgb`/`modeP3` registered ships a small fraction of its 22.5 kB. colorjs.io's 32.8 kB is hard to justify at runtime.
2. **Ecosystem alignment** — Tailwind v4 and Radix both use culori, so your generated tokens match what the rest of the stack computes.
3. Keep everything **non-reactive**: put color objects in `shallowRef`/`markRaw`, not `ref`. Vue's deep proxy on `{mode, l, c, h}` objects inside a 60fps picker drag is a real profiler line item.
4. `useMode` registration is a module side effect — do it once in a `color.ts` singleton, never inside a component `setup()`.

**Where to beat everyone:** implement **Ray Trace gamut mapping** (spec pseudocode is complete, banding-free, deterministic timing) instead of the binary-search MINDE that every existing tool ships; use **ΔEOKr2** as the difference metric per the spec's own performance recommendation; show **dual WCAG + APCA** with disagreement flags; and render the **per-hue sRGB/P3 chroma ceiling directly on the slider track** so users see the gamut wall before they hit it.

Sources: [CSS Color 4 spec](https://drafts.csswg.org/css-color-4/) · [Ottosson, Oklab](https://bottosson.github.io/posts/oklab/) · [apca-w3 source](https://github.com/Myndex/apca-w3) · [APCA in a Nutshell](https://git.apcacontrast.com/documentation/APCA_in_a_Nutshell.html) · [Color.js gamut mapping](https://colorjs.io/docs/gamut-mapping) · [culori API](https://culorijs.org/api/) · [@texel/color](https://github.com/texel-org/color) · [Baseline: oklab/oklch](https://web-platform-dx.github.io/web-features-explorer/features/oklab/) · [MDN contrast-color()](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/color_value/contrast-color) · [Myndex whitepaper on WCAG 2 failures](https://www.w3.org/WAI/GL/task-forces/silver/wiki/User:Myndex/Whitepaper)