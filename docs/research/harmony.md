# Color Harmony & Palette Generation — Algorithms, Formulas, Implementation

## 1. The space you rotate in is the whole ballgame

**HSL/HSV hue rotation is broken** because `L` is not perceptual lightness — it's `(max+min)/2` of gamma-encoded RGB. `hsl(60 100% 50%)` (yellow) has ~10× the relative luminance of `hsl(240 100% 50%)` (blue) at identical `L`. So a "triad" in HSL is three colors of wildly different weight; contrast ratios drift; the palette reads unbalanced even though the angles are correct.

**OKLCH fixes lightness constancy** (`L` ≈ perceptual, 0–1), but rotating hue at fixed `C` blows the sRGB gamut, because max chroma is strongly hue-dependent. sRGB corner chromas in OKLCH (approx): magenta C≈0.322 @ H 328°, blue C≈0.313 @ H 264°, green C≈0.295 @ H 142°, red C≈0.258 @ H 29°, yellow C≈0.211 @ H 110°, cyan C≈0.155 @ H 195°. **A 180° rotation from red to cyan at C=0.25 is unrepresentable.**

**Required companion step — gamut map, don't clip.** CSS Color 4 §14.2: preserve `L` and `H`, binary-search `C` down; at each step compare the candidate against its naively-clipped version using ΔE<sub>OK</sub>; stop when ΔE<sub>OK</sub> ≤ **JND = 0.02** (ε = 0.0001). Newer, faster & more accurate alternatives now in the spec: **EdgeSeeker** and **Ray Trace** GMA (ray-tracing the OKLCH line against the RGB cube — now ColorAide's default, no iteration).

```
function gamutMap(L, C, H):
  if inSRGB(L,C,H): return it
  if L >= 1: return white;  if L <= 0: return black
  lo=0; hi=C
  while hi-lo > 1e-4:
      mid=(lo+hi)/2; c=oklch(L,mid,H)
      if inSRGB(c): lo=mid
      else:
          clipped = clipToSRGB(c)
          if deltaEOK(c, clipped) < 0.02: return clipped
          hi=mid
  return clipToSRGB(oklch(L,lo,H))
```

**Known OKLab weakness to beat:** OKLab still shows a blue→purple hue drift under lightening (Abney effect); CAM16-UCS beats OKLab on chroma/lightness error while OKLab wins on hue. `Oklch+` (2026, arXiv 2606.05255) is a 3-parameter extension aimed exactly at this. Offering *CAM16-UCS as an optional engine* is a real differentiator over every CSS-native tool.

## 2. RYB — what designers actually expect

The artist's wheel puts **red↔green** opposite, not red↔cyan. Itten's wheel is approximated by a 24-entry lookup `(rybAngle, rgbHue)`:

```
(0,0)(15,8)(30,17)(45,26)(60,34)(75,41)(90,48)(105,54)(120,60)
(135,81)(150,103)(165,123)(180,138)(195,155)(210,171)(225,187)
(240,204)(255,219)(270,234)(285,251)(300,267)(315,282)(330,298)(345,329)(360,360)
```

**rotateRYB(h, angle):** ① find segment where `rgbHue0 ≤ h ≤ rgbHue1`, lerp to get RYB angle `a`; ② `a = (a + angle) mod 360`; ③ find segment where `rybAngle0 ≤ a ≤ rybAngle1`, lerp back to RGB hue. Check: red (h=0) → a=0 → +180 → a=180 → **h=138 (green)** ✓.

Alternative: **Gossett & Chen (IEEE Vis 2004)** trilinear interpolation over an RYB unit cube whose 8 corners hold hand-tuned RGB values (white, red, yellow, blue, orange=R+Y, green=Y+B, purple=R+B, black). Example: RYB(1.0, 0.5, 0.25) → RGB(0.8375, 0.19925, 0.0625). Alternatively the subtractive `rgb2ryb`/`ryb2rgb` channel-shuffle (Sugita/`ArtColors`). Round-tripping corrupts hue — rotate once, don't chain.

**Ship all three wheels (HSL / OKLCH / RYB) as a toggle.** Almost nobody does; Paletton is RYB-only, every OKLCH tool is RGB-wheel-only.

## 3. Harmony offsets

| Scheme | Hue offsets (deg) |
|---|---|
| Complementary | 0, 180 |
| Split-complementary | 0, 180−α, 180+α (α = 30, sometimes 20–40) |
| Triadic | 0, 120, 240 |
| Tetradic / Square | 0, 90, 180, 270 |
| Tetradic / Rectangle | 0, α, 180, 180+α (α ≈ 60 or 30) |
| Analogous | 0, ±α, ±2α (α = 15–30) |
| Compound (mixed) | 0, 180−α, 180+α plus tint/shade of base, α≈30 |
| Monochromatic | Δh = 0; vary L (and C) |

Naive HSL versions of shades/tints/tones:
- **Tint:** `L += k` (cap 90%) — **Shade:** `L -= k` (floor 10%) — **Tone:** `S += Δ` over [−20,+20] step 5.

**Do it right in OKLCH instead:**
- Tint = mix toward `oklch(1 0 h)`; Shade = mix toward `oklch(0 0 h)`; Tone = reduce `C` at fixed `L`.
- **Better still — Material's HCT tonal ramp:** hold H and C, sample **T = {0,10,20,30,40,50,60,70,80,90,95,99,100}**. HCT guarantees: **ΔT ≥ 40 → contrast ≥ 3.0; ΔT ≥ 50 → contrast ≥ 4.5.** That's the mechanism to steal — deterministic accessibility from a ramp index.
- **Adobe Leonardo** inverts it: you specify *target contrast ratios* against a background and it solves for the color along an interpolated key-color scale (LCH/CAM02/OKLCH modes, keys auto-distributed by lightness).

## 4. Perceptually even ramps

**HCL trajectory parametrization (Zeileis/Hornik/Murrell, `colorspace`), i ∈ [0,1]:**
- Linear: `f(i) = v₂ − (v₂−v₁)·i`
- **Triangular chroma** (for multi-hue sequentials): with `j = (1 + |c_max−c₁| / |c_max−c₂|)⁻¹`,
  `C(i) = c₂ − (c₂−c_max)(i/j)` if `i ≤ j`, else `c_max − (c_max−c₁)((i−j)/(1−j))`
- **Power warp:** substitute `i → i^p₁` (chroma) and `i → i^p₂` (luminance).
- Palette recipes: **Qualitative** = H linear, C const, L const. **Sequential single-hue** = H const, C linear/triangular^p₁, L linear^p₂. **Sequential multi-hue** = H linear. **Diverging** = two arms, H const per arm, L peaks light at center.

**chroma.js Bézier + lightness correction** (`chroma-js@3.2.0`) — both operate in **Lab**:
- `bezier([c…])`: 2 colors → lerp; 3 → quadratic; 4 → cubic; ≥5 → degree-n Bernstein using Pascal-triangle binomials, per Lab channel.
- `.correctLightness()`: bisection on `t` so actual `L*` matches the ideal linear ramp `L_ideal = L₀ + (L₁−L₀)·t`; tolerance `|ΔL| > 1e-2`, **max 20 iterations**, direction flipped when `L₀ > L₁`.

**Viridis/inferno/magma/plasma:** splines fit in **CAM02-UCS** so `J'` is *exactly linear* in the data, maximizing distinguishable levels, staying monotone in greyscale, and surviving deuteranopia simulation. Use `colorspacious` (Python) for CAM02-UCS.

**ColorBrewer rules:** sequential = lightness dominates; diverging = light critical midpoint, dark contrasting-hue extremes, equal emphasis both arms; qualitative = hue carries all difference, L/C held roughly constant.

## 5. Extraction from images

- **Median cut (MMCQ):** recursively split the RGB box along its longest axis at the *median pixel*, so each box holds ~equal pixel count; stop at K boxes; average each. Used by `colorthief@3.5.0`, `quantize@1.0.2`, `node-vibrant`'s `@vibrant/quantizer-mmcq`. Bias: equal-population, so large flat areas dominate.
- **Octree:** insert pixels into an 8-ary tree keyed by bit-interleaved RGB; prune leaves bottom-up (fewest pixels first) until K nodes. **O(N) time, O(K) memory** — the fastest, streamable.
- **k-means / MacQueen online k-means:** cluster in **Lab or OKLab**, not RGB — this is the cheap quality win most extractors skip. `iwanthue@2.1.0` uses k-means *or* force-vector repulsion in CIE Lab, with user constraints expressed in HCL.
- **Vibrant swatch scoring** (`node-vibrant@4.0.4`, exact defaults):
  `score = weightedMean(1−|S−S_target|, 3; 1−|Luma−L_target|, 6.5; population/maxPopulation, 0.5)`
  Targets: `targetDarkLuma .26 / maxDarkLuma .45 / minLightLuma .55 / targetLightLuma .74 / minNormalLuma .3 / targetNormalLuma .5 / maxNormalLuma .7 / targetMutedSaturation .3 / maxMutedSaturation .4 / targetVibrantSaturation 1.0 / minVibrantSaturation .35`.

## 6. Maximally-distinct categorical palettes

**Glasbey** (`pip install glasbey`; Glasbey/Heijden/Toh/Gray): sample a dense RGB grid → convert to **CAM02-UCS** → greedy: repeatedly add the color maximizing the *minimum* distance to all already-chosen colors (farthest-point traversal). API: `create_palette(palette_size, lightness_bounds=(10,90), chroma_bounds=(10,100), hue_bounds, grid_size, colorblind_safe=False, cvd_severity=50)`, `extend_palette("tab10", palette_size=15)`, `create_block_palette(...)` for hierarchical categories. Pre-baked in `colorcet`.

**Colorgorical** (Gramazio/Laidlaw/Schloss, TVCG 2017) — the model to beat, exact formulas:
- Space: CIELAB quantized every 5 units → **8,325 colors**; clamp **25 ≤ L ≤ 85**; filter the dark-yellow region.
- Perceptual Distance = **CIEDE2000**.
- Name Difference (Hellinger over XKCD 153-name association matrix `T`, `p(w|c)=T_{c,w}/Σ_w T_{c,w}`):
  `ND(c₁,c₂) = 1 − Σ_{w∈W} √(p(w|c₁)·p(w|c₂))`
- Name Uniqueness = `−H(p(W|c)) = Σ p(w|c)·log p(w|c)` *(dropped from final model — no behavioral effect)*
- **Pair Preference** (Schloss & Palmer regression, ported to LCh; 51.8% variance):
  `PP(c₁,c₂) = 75.15·(κ₁+κ₂) + 47.61·|ΔL| − 46.42·|ΔH|`  (κ = coolness, interpolated from 32 Munsell-10R hue-step mappings)
- Selection: `score(c,P) = φ · Σ(w_i · min_{p∈P} score_i(c,p))`, with hue penalty `φ ∈ {0.75, 0.8, 0.85}` near dark yellow. Sample randomly from `{c : score(c) > max(score) − 0.75·SD(score)}`. Minimum-difference filter: at least one axis exceeds **ΔL=22.747, Δa=31.427, Δb=44.757**. Generates 10 palettes, returns the one with highest minimum PP. Max ~22 colors before space exhausts.

## 7. Poline — position-function palettes (`poline@0.13.1`, MIT, dep-free)

Anchors are HSL triples mapped into a unit cube: `hslToPoint`: `x = 0.5 + (L·0.5)·cos(h·π/180)`, `y = 0.5 + (L·0.5)·sin(h·π/180)`, `z = S`. Inverse `pointToHSL`: `h = (360 + atan2(y−.5, x−.5)·180/π) mod 360`, `S = z`, `L = hypot(x−.5, y−.5)/0.5`.

Interpolation applies an **independent easing per axis**: `x = (1−fx(t))·p₁ₓ + fx(t)·p₂ₓ`, likewise y with `fy`, z with `fz`. Because x,y are *cartesian*, easing them non-uniformly bends the path into an arc through hue–lightness space rather than a straight hue sweep — that's the whole trick.

Exact position functions (`reverse` variants in parens):
`linear = t` · `exponential = t²` (`1−(1−t)²`) · `quadratic = t³` (`1−(1−t)³`) · `cubic = t⁴` · `quartic = t⁵` · `sinusoidal = sin(tπ/2)` (`1−sin((1−t)π/2)`, **default**) · `asinusoidal = asin(t)/(π/2)` · `arc = 1−√(1−t)` (rev `1−√(1−t²)`) · `smoothStep = t²(3−2t)`. Options: `numPoints` (4), `closedLoop`, `invertedLightness`, `clampToCircle` (project to r=0.5), outputs `colorsCSS`, `colorsCSSlch`, `colorsCSSoklch`, `getColorAt(t)`.

## 8. The "Coolors auto" heuristic & ML competitors

Coolors does **not** publish its algorithm — treat claims as inference. Observable behavior: 5 swatches; spacebar regenerates only unlocked slots, **conditioning new colors on locked ones**; results are hue-clustered with staggered lightness (a light neutral, a dark neutral, 1–2 saturated accents), i.e. constrained sampling from a curated palette corpus rather than pure random HSB. **Colormind** is documented: a **GAN doing color-infill on partial palettes**, trained on Adobe Color data + hand-picked Dribbble palettes, with daily-swappable datasets learned from photos/film stills; free REST API.

**Where to beat them:** conditional infill is the right UX (lock-and-regenerate), but both are perceptually naive and neither guarantees contrast. A generator that (a) infills conditionally, (b) works in OKLCH/CAM16-UCS, (c) gamut-maps by ray-trace, (d) enforces an HCT-style ΔT ≥ 40/50 contrast guarantee, and (e) exposes RYB *and* OKLCH wheels, dominates all of them.

## 9. Library stack (versions verified Aug 2026)

`chroma-js@3.2.0` (bezier, correctLightness, scales) · `culori@4.0.2` (tiny, tree-shakeable, OKLab/OKLCH, differences, `interpolate` with hue fixups) · `colorjs.io@0.7.1` (spec-accurate gamut mapping, ΔE suite, CAM16) · `colord@2.9.5` (1.7 kB, plugins) · `d3-scale-chromatic@3.1.0` (ColorBrewer + viridis built in) · `poline@0.13.1` · `iwanthue@2.1.0` · `node-vibrant@4.0.4` · `colorthief@3.5.0` · `quantize@1.0.2` (MMCQ) · `extract-colors@4.2.1` · `@material/material-color-utilities@0.4.0` (HCT/CAM16, `TonalPalette`) · `@adobe/leonardo-contrast-colors@1.1.0` · `apca-w3@0.1.9`. Python: `glasbey`, `colorcet`, `colorspacious` (CAM02-UCS/CIECAM02), `coloraide` (ray-trace GMA default).

Sources: [Sighack RYB wheel](https://sighack.com/post/procedural-color-algorithms-hsb-vs-ryb) · [ArtColors](https://github.com/ProfJski/ArtColors) · [Gossett & Chen](https://bahamas10.github.io/ryb/assets/ryb.pdf) · [chroma.js scale.js](https://github.com/gka/chroma.js) · [Color.js gamut mapping](https://colorjs.io/docs/gamut-mapping) · [Colorgorical paper](https://vis.cs.brown.edu/docs/pdf/Gramazio-2016-CCD.pdf) · [glasbey](https://github.com/lmcinnes/glasbey) · [poline](https://github.com/meodai/poline) · [colorspace HCL palettes](https://colorspace.r-forge.r-project.org/articles/hcl_palettes.html) · [node-vibrant](https://github.com/Vibrant-Colors/node-vibrant) · [Colormind blog](http://colormind.io/blog/) · [material-color-utilities](https://github.com/material-foundation/material-color-utilities/) · [Evil Martians OKLCH](https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl) · [matplotlib colormaps](https://bids.github.io/colormap/)