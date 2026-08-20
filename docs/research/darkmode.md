## 1. Naive HSL invert — and exactly why it breaks

**The technique** (Lea Verou, 2021): store lightness in custom props, redefine them in dark mode. `--l-40: 40%` → `--l-40: 60%`, used as `hsl(250 30% var(--l-40))`. Formula: `L' = 100% - L`. Self-referential `calc(100% - var(--l-40))` is a cycle and fails.

**Why it fails, concretely:**
- HSL `L` is `(max+min)/2` of gamma-encoded RGB — not luminance. `hsl(60 100% 50%)` (#ffff00, relative luminance **0.9278**) and `hsl(240 100% 50%)` (#0000ff, **0.0722**) are the *same* L. Inverting maps both to L=50% again: yellow keeps 12.6:1 vs black while blue keeps 1.4:1. Per-hue contrast is unmanaged.
- HSL `S` is not chroma. At L→0 or 100 saturation is degenerate, so `S:100%` survives inversion and produces neon-on-black or muddy pastels.
- Perceptual spacing collapses: equal HSL-L steps in the 0–30% range are visually far closer together than in 70–100%, so an inverted light ramp has crowded dark steps.
- No Helmholtz–Kohlrausch / Bezold–Brücke handling: warm hues (orange/yellow) read *lighter* than their L implies and shift hue on dark grounds.
- Design-level: dark UI wants **less** chroma at high L and a lifted floor (never `#000` — halation on OLED). A pure inversion gives the opposite.

## 2. OKLCH — L mapping + mandatory chroma rescale

`L` in Oklab is a cube-root-of-cone-response lightness; it *is* perceptual. Okhsl adds a "toe" to match CIE L*:

```
k1 = 0.206, k2 = 0.03, k3 = (1+k1)/(1+k2)
Lr = (k3·L − k1 + √((k3·L − k1)² + 4·k2·k3·L)) / 2
L  = Lr(Lr + k1) / (k3(Lr + k2))          // inverse
```

**Why chroma must be rescaled:** max chroma is a function of both L and h — the *cusp*. Ottosson approximates the gamut slice as a triangle:

```
S = C_cusp / L_cusp ,  T = C_cusp / (1 − L_cusp)
C_max(L,h) = min(S·L, T·(1 − L))
```

So at L=0.62 blue reaches C≈0.31; at L=0.90 it reaches ≈0.10. Holding `c` while flipping `l` (`oklch(from var(--c) calc(1 - l) c h)`) pushes the color out of gamut; the browser clips, and clipping in RGB drags **hue and lightness**, not just chroma.

**Correct move — preserve *relative* chroma:**
```
ρ = C / C_max(L, h)
C' = ρ · C_max(L', h)          // ρ ∈ [0,1] is the real invariant
```
Fallback if you don't compute the cusp: CSS Color 4 gamut mapping — binary search `C` down in OKLCH, JND = **0.02** in ΔE-OK, comparing candidate against its RGB-clipped version.

**Better than `1−L`:** a non-linear ramp. Dark mode wants the top compressed (body text ≈ L 0.92–0.94, not 1.0) and the floor lifted (app bg ≈ L 0.17–0.21, not 0). Add ~+5–15° hue rotation on warm hues and a 10–25% chroma boost at mid steps to counter simultaneous contrast on dark grounds.

**CSS support:** relative color syntax — Chrome/Edge 119+, Safari 16.4+ (needs `calc(h + 180deg)` with unit), **Firefox 133+** (128–132 partial), ~91% global. Guard with `@supports (color: hsl(from white h s l))`.

## 3. Material Design 3 — HCT + tonal palettes

HCT = CAM16 hue + CAM16 chroma + **tone ≡ CIE L\***. `HctSolver` finds the sRGB color that hits (h, c, t) exactly in hue/tone, *reducing chroma* when the requested C is unreachable.

**Seed → 5 palettes** (`CorePalette`, npm `@material/material-color-utilities` **0.4.0**):
```
non-content:  a1=(h, max(48,C))  a2=(h,16)  a3=(h+60,24)  n1=(h,4)  n2=(h,8)
content:      a1=(h,C)  a2=(h,C/3)  a3=(h+60,C/2)  n1=(h,min(C/12,4))  n2=(h,min(C/6,8))
error:        (h=25, C=84) always
```

**Light/dark tone assignment** (`color_spec_2021`) — note it is *not* a mirror:

| role | light | dark |
|---|---|---|
| primary / onPrimary | 40 / 100 | 80 / 20 |
| primaryContainer / on- | 90 / 30 | 30 / 90 |
| surface / onSurface | 98 / 10 | 6 / 90 |
| onSurfaceVariant | 30 | 80 |
| outline / outlineVariant | 50 / 80 | **60** / 30 |
| inverseSurface / on- | 20 / 95 | 90 / 20 |

`outline` goes 50→60 (a mirror would give 50). Surface containers are `ContrastCurve(low, normal, medium, high)` = values at contrastLevel −1, 0, 0.5, 1, **lerped** — e.g. dark `surfaceContainer` runs 12→20. Heads-up: `main` now delegates to `ColorSpecDelegateImpl2026`; most third-party tools still ship the 2021 spec.

## 4. Radix 12-step — and proof the dark scale isn't a mirror

1 app bg · 2 subtle bg · 3 component bg · 4 hover · 5 active/selected · 6 subtle border · 7 border + focus ring · 8 hover border · 9 **solid** (highest chroma) · 10 solid hover · 11 low-contrast text (**APCA Lc 60** over step 2) · 12 high-contrast text (**Lc 90** over step 2).

**Proof of non-mirror** (`@radix-ui/colors` blue):
```
light  1 #fbfdff  8 #5eb1ef  9 #0090ff  10 #0588f0  11 #0d74ce  12 #113264
dark   1 #0d1520  8 #2870bd  9 #0090ff  10 #3b9eff  11 #70b8ff  12 #c2e6ff
```
Step **9 is byte-identical** across modes (brand solid is an anchor, not a scale position). Step 10 = hover moves *darker* in light, *lighter* in dark. And dark 2→3 (`#111927`→`#0d2847`) is a chroma cliff with no analogue in light.

**Actual generator** (`generateRadixColors.ts`, colorjs.io + bezier-easing):
1. Rank all reference scale colors by `deltaEOK`; take 2 nearest distinct scales A, B.
2. Law of cosines → `ratio = max(0, tanC1/tanC2) * 0.5`; `scale[i] = mix(A[i], B[i], ratio)`.
3. Force hue: `C_i = min(C_src * 1.5, C_i * (C_src / C_base))`, `H_i = H_src`.
4. Transpose lightness onto the actual page bg with a bezier: light `[0,2,0,2]`, dark `[1,0,1,0]`; `n − (arr[0] − to) · ease(1 − i/11)`.
5. `scale[8] = seed` (unless `deltaEOK(seed, step1)*100 < 25`); hover `L' = L>0.4 ? L − 0.03/(L+0.1) : L + 0.03/(L+0.1)`, `C' = L>0.4 ? C*0.93 : C`.
6. Clamp text chroma: `C₁₁,C₁₂ = min(max(C₈,C₉₋₁), C)`.
7. Contrast text: white unless `|APCA(white, bg)| < 40`, then `oklch(0.25, max(0.08·C, 0.04), H)`.

## 5. Adobe Leonardo — ratios are the invariant

npm `@adobe/leonardo-contrast-colors` **1.1.0**. `Color({name, colorKeys, colorspace, ratios, smooth})`, `BackgroundColor(...)`, `Theme({colors, backgroundColor, lightness 0–100, contrast=1, saturation=100, formula: 'wcag2'|'wcag3'})`.

- `createScale` builds `[white, ...keys sorted by HSLuv L, black]`, interpolated in LCH (default) / LAB / CAM02 / HSLuv / HSV / RGB, optional bezier `smooth`.
- `searchColors`: resample to **colorLen = 3000**, then binary search: `step = 3000/2`, `ε = 0.01`, `x += 0.005·sign(x)`, ≤100 iterations, direction from `contrast(0) < contrast(3000)`.
- `getContrast` returns a **signed** ratio; `baseV = lightness/100`, `baseV < 0.5` selects the dark-theme branch, so a negative ratio means "wrong side of the background".
- Contrast multiplier normalizes 1→0: `r = (ratio−1)·m + 1` (or `(ratio+1)·m − 1` for negatives).
- **Dark mode is free**: same `ratios`, set `lightness` below 50 and the entire palette re-solves. That's the idea worth stealing — *store target contrasts, not colors*.

## 6. Tailwind v4 palette

22 hue families × 11 steps (50…950, 500 = "the" brand shade). v4 redefined every value as `oklch()` for P3. Blue:

```
L: .970 .932 .882 .809 .707 .623 .546 .488 .424 .379 .282
C: .014 .032 .059 .105 .165 .214 .245 .243 .199 .146 .091
H: 254.6 255.6 254.1 251.8 254.6 259.8 262.9 264.4 265.6 265.5 267.9
```
L is a non-linear curve (grays fall off harder at the dark end); C is Gaussian-ish, peaking at **600**; hue drifts ~13° blueward across the ramp. Reverse-engineering attempts (Fourier fits) failed — the palette is hand-tuned per family. **Beatable:** Tailwind ships no light↔dark step mapping at all; `dark:bg-blue-900` is folklore.

## 7. Alpha variants — exact math

```
target = bg·(1−a) + fg·a      ⟹      a = (target − bg) / (fg − bg)
```
Radix's `getAlphaColor(targetRgb, bgRgb, rgbPrecision, alphaPrecision, targetAlpha?)`:
1. Round both to integers at `rgbPrecision` (255 for sRGB **and** P3; `alphaPrecision` 255 sRGB / 1000 P3).
2. Pick the extreme: `desired = 255` if *any* of `tr>br, tg>bg, tb>bb` else `0`.
3. `aᵢ = (tᵢ − bᵢ)/(desired − bᵢ)`; take `a = max(a_R, a_G, a_B)` → the **smallest alpha that can still reach the target**; `A = ceil(a·prec)/prec`.
4. Solve back `Rᵢ = ceil( (tᵢ − bᵢ(1−A)) / A )`, clamped.
5. Correct ±1 for browser rounding — browsers compute `round(bg·(1−a)) + round(fg·a)`, **not** `round(bg·(1−a) + fg·a)`.
6. Pure-gray shortcut when all three alphas are equal: emit `(V,V,V,a)`.

Result e.g. `--blue-a5: #0093ff3d` over `#fff`. Steps a9–a12 are **fully opaque** — a saturated solid over near-black would need `a > 1`. P3 needs its own definitions because compositing happens in the destination space. Radix "surface" = alpha **0.8** in light, **0.5** in dark, derived from step 2.

**Why alpha scales exist:** menus, popovers, hover states and selection layers sit over unknown or tinted parents. A solid step-4 hover looks wrong on a tinted card; an alpha step-4 composites correctly on *any* ground while matching the solid on the canonical bg.

## 8. Automatic accessible pairing

**Closed form (WCAG, L\* space)** — M3 `Contrast.lighter(tone, ratio)`:
```
darkY  = yFromLstar(tone)
lightY = ratio·(darkY + 5) − 5           // Y scaled 0–100, offset 5 = 0.05
if realRatio < ratio && |Δ| > 0.04 → −1  // unachievable
return lstarFromY(lightY) + 0.4          // +0.4 margin for gamut mapping
```
Mirror for `darker()`: `darkY = (lightY + 5)/ratio − 5`.

**Black-or-white pick:** WCAG breakeven is `Y = √(1.05·0.05) − 0.05 = 0.1791` — perceptually wrong (too eager for black text). Myndex: flip to white when `Y < 0.36` (or 0.38), refined as `Math.pow(Ys, 0.678) < 0.5 ? "#fff" : "#000"`.

**APCA (`apca-w3` 0.1.9):** `Y = 0.2126·R^2.4 + 0.7152·G^2.4 + 0.0722·B^2.4` (simple 2.4, **no** sRGB piecewise); soft-clamp below `0.022` with exponent `1.414`; `Lc_BoW = (Ybg^0.56 − Ytxt^0.57)·scale·100 − 2.7`, `Lc_WoB = (Ybg^0.65 − Ytxt^0.62)·scale·100 + 2.7`; results |Lc| < 0.1 → 0. Range Lc 0…106 (BoW) / 0…−108 (WoB).

**Practical solver:** fix h and C, binary-search OKLCH `L` against the contrast target — contrast is monotonic in L, ~20 iterations to 1e-5. Gamut-map **inside** the loop and re-measure, since clipping changes Y.

**Libraries:** `culori` **4.0.2** (`wcagContrast`, `clampChroma`, `toGamut`, `differenceEuclidean`), `colorjs.io` **0.7.1** (`contrast()` with APCA / WCAG21 / Lstar / Michelson / Weber, `toGamut`, `deltaEOK`), `@material/material-color-utilities` **0.4.0**, `@adobe/leonardo-contrast-colors` **1.1.0**, `apca-w3` **0.1.9**, `bezier-easing`.

## Differentiators worth beating

1. **Nobody ships a light↔dark *step map*.** Radix ships two hand-tuned tables; M3 ships a role table; Tailwind ships nothing. A generator that emits both scales from one seed *plus* the semantic pairing is unoccupied ground.
2. **Leonardo has the right invariant (ratios) but 2013-era color science** (chroma.js, CIECAM02, HSLuv sorting, 3000-swatch linear search). Redo it in OKLCH with cusp-aware relative chroma + closed-form L* inversion — no 3000-step search needed.
3. **Radix's mixing heuristic depends on its 30 reference scales.** A pure-math generator (cusp + bezier lightness transposition + APCA-anchored steps 11/12) is seed-only and needs no lookup table.
4. **Alpha generation is essentially unavailable outside Radix** — including the browser's split-rounding correction, which every naive implementation gets wrong by ±1.
5. **M3's 2026 spec has landed** in `material-color-utilities` main; tooling is still on 2021.

Sources: [Radix scale semantics](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale) · [generateRadixColors.ts](https://github.com/digitaljohn/radix-theme-generator/blob/main/src/utils/generateRadixColors.ts) · [Leonardo utils.js](https://github.com/adobe/leonardo/blob/main/packages/contrast-colors/lib/utils.js) · [Leonardo API](https://leonardocolor.io/api.html) · [material-color-utilities](https://github.com/material-foundation/material-color-utilities/) · [Okhsl/Okhsv](https://bottosson.github.io/posts/colorpicker/) · [Lea Verou, inverted lightness](https://lea.verou.me/blog/2021/03/inverted-lightness-variables/) · [Tailwind v4](https://tailwindcss.com/blog/tailwindcss-v4) · [Tailwind v4 OKLCH values](https://tailwindcolor.com/blue) · [APCA model](https://www.w3.org/WAI/GL/task-forces/silver/wiki/User:Myndex/APCA_model) · [Myndex flip point](https://gist.github.com/Myndex/e1025706436736166561d339fd667493) · [MDN relative colors](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Colors/Using_relative_colors) · [caniuse](https://caniuse.com/css-relative-colors)