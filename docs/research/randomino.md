# Randomino (Astute Graphics) — Verified UX Teardown

## Product shape
Three surfaces, not one: the **Randomini tool** (on‑canvas HUD), the **Randomino panel** (`Window > Astute Graphics > Randomino`), and live effects (`Effect > Randomino > Color Randomizer` / Opacity Randomizer / Perturb).

## Randomino panel layout
Top‑down, single column, adaptive:
1. **Kind popup** — one attribute at a time: `Color, Live Effects, Movement, Opacity, Rotation, Scaling, Stacking Order, Stroke Weight`. (Selecting *Live Effects* spawns one or two extra popups to pick the effect family.)
2. **Range / List mode** toggle. *Range* = continuous bounds; *List* = discrete enumerated values with add/delete buttons and an **Allow Duplicates** checkbox (duplicates = frequency weighting — a poor‑man's probability mass function).
3. **Distribution curve selector**: `linear`, `bell curve` (Gaussian), `half‑bell curve` (half‑Gaussian, one‑directional).
4. **Numerical input boxes** for the boundaries + a **Step** value that rounds results to increments.
5. **Ignore Grouping** checkbox; **Apply at Grouping Level** `0–29` (nesting depth).
6. **Randomize** button (explicit commit — the panel is *not* continuously live).
7. **Flyout menu**: Preferences, saved settings stored *per Kind*, restore defaults.

Preferences worth stealing: **Always Affect Text Objects at Character Level**; **Apply Loaded Settings Immediately** (Shift inverts it; required so settings are recordable as Illustrator Actions); a hover‑driven **informational text area** describing whichever pref is under the cursor.

## Color randomization specifics
- Model is **HSB only** (plus an **HSLuv colorspace** checkbox on the live effect that "reduces perceived brightness shifts during hue/saturation changes" — their sole perceptual concession).
- Three channels, each independently enabled/disabled, **but all must share one distribution model**. That is a hard constraint we should break.
- Ranges are **relative deltas, symmetric around each object's existing color**, not absolute:
  - **Hue Variation `0–180`** (180 = full ± wheel; 90 = quarter rotation each direction)
  - **Saturation Variation `0–100`** with direction `Desaturate & Saturate | Desaturate Only | Saturate Only`
  - **Lightness Variation `0–100`** with `Darken & Lighten | Darken Only | Lighten Only`
- Editing: numeric boxes *or* dragging slider thumbs. **Shift‑click the thumb area resets thumbs to the full valid range** → confirms dual‑thumb tracks.
- **Quantize**: restrict output to N distinct, evenly spaced values (e.g. 5 hues instead of continuous).
- **Seed button**: click = new roll; **Alt/Option‑click** reveals/edits the numeric seed for reproducibility. (Hidden — bad discoverability.)
- Scope: **Apply To Fills / Strokes** checkboxes, an **affect white colors** checkbox, **Filter by Type** (exclude text, paths…), **Filter by Index** with seven methods (`First, Last, Odd, Even, Pattern, Randomly, …`).
- Gradients are randomized **stop‑by‑stop**; gradient meshes **node‑by‑node**.

## Live preview
- Live effect has a **Preview checkbox** + **Show Edges** toggle.
- The **Color Preview area** has two states: all three channels on → a swatch strip of colors that *would* be generated; only one or two on → a **paired before/after strip** (source colors on top — a standard set if nothing is selected, otherwise sampled from the selection — with their randomized results beneath). Static; it does not re‑roll continuously while dragging.

## Randomini on‑canvas HUD (the good part)
Die‑shaped cursor; widget centered on the selection, draggable by its center hub (double‑click hub = reset all).
- **Rotation arm**: drag angle sets max; 24° → rolls in **[−24°, +24°]**.
- **Scale slider**: 150% → rolls in **[100%, 150%]** (asymmetric, anchored at current).
- **Offset slider**: 6 pt → rolls in **[0, 6] pt**.
- **Hue button**: instant fill+stroke re‑roll, excluding pure black and white.
- Preview renders as **outlines** (except hue, which shows real color). **Apply** or **Enter** commits; **Shift** auto‑deselects; **new random values regenerate immediately** so repeated Enter = rapid successive variants.
- Modifiers: `Shift` = 10° rotation steps / integer scale; `Cmd/Ctrl` = "Slow‑Drag" fine tuning; `G` = toggle Ignore Grouping mid‑drag; `C` = cycle annotation color.

## Differentiators we can BEAT
| Randomino limitation | Our win |
|---|---|
| Delta‑only (± around source color) | Support **absolute** ranges *and* delta mode, toggled per channel |
| HSB only (+HSLuv checkbox) | HSL/HSV/RGB/LCH/**OKLCH**/OKLAB, with live conversion of range bounds between spaces |
| One distribution for all channels | **Per‑channel** distribution |
| Only linear + Gaussian + half‑Gaussian | Add **golden‑ratio** and **blue‑noise** samplers |
| Seed hidden behind Alt‑click | First‑class seed field + URL permalink |
| Static preview strip | **Live grid that re‑maps continuously while dragging** |
| No wrap‑around range authoring | Explicit `340° → 20°` crossing 0 |
| Explicit Randomize button, no undo history of rolls | Space = re‑roll, `[` `]` = walk seed history |

---

# Prescriptive spec: range‑based random color UI for the web

**Layout.** Two panes. Left: space selector + channel stack. Right: preview grid (sticky, always visible). Bottom bar: seed, distribution, gamut mode, count.

**Space selector.** Segmented control: `OKLCH | OKLAB | LCH | HSL | HSV | RGB`. Switching spaces must **re‑project the current bounds**, not reset them: sample ~2000 points from the old range, convert, take the axis‑aligned bounding box in the new space (with circular bounding for hue). Show a "reprojected — bounds are approximate" toast.

**Channel row anatomy** (repeat per channel):
`[lock icon] [label] [min numeric] [========dual track========] [max numeric] [dist ▾] [∿ wrap]`
- Track background paints a **live gradient of that channel** with the other channels fixed at their range midpoints. Recompute on any change; this is the single highest‑value affordance.
- Out‑of‑gamut portions of the track render with a diagonal hatch overlay.
- **Lock** collapses the two thumbs to one value (min = max) and dims the track.
- Ranges: OKLCH `L 0–1` (display as 0–100%), `C 0–0.4` (0.37 is practical max), `H 0–360`; OKLAB `L 0–1`, `a/b −0.4…0.4`; LCH `L 0–100`, `C 0–150`, `H 0–360`.

**Dual‑handle implementation.** Do not stack two `<input type=range>`. Build a `role="group"` with two `role="slider"` children carrying `aria-valuemin/max/now/valuetext` and `aria-label="minimum hue"` / `"maximum hue"`. Keys: `←/→` = ±step, `Shift+←/→` = ±10×, `Home/End` = channel bounds, `PageUp/Down` = ±10×. Pointer: `Alt`‑drag moves both thumbs together (translate range, preserve width); `Shift`‑drag scales the range about its center. Double‑click a thumb → inline numeric entry. Thumbs must be allowed to **cross** on hue channels — crossing is what activates wrap mode.

**Wrap‑around hue.** When `min > max`, enter wrap mode automatically and show a ∿ badge. Sampling:
```
L = (max - min + 360) % 360          // arc length
h = (min + t * L) % 360              // t ∈ [0,1) from the distribution
```
Render the track as two gradient segments (min→360, 0→max) and draw the range as an **arc on a small hue ring** next to the row so the crossing is legible.

**The preview grid — the core trick.** Each swatch owns a **stable unit tuple** `u = [u₀, u₁, u₂]` drawn once from the seeded stream. While the user drags a handle, do **not** redraw new random numbers — re‑map the *same* `u` values through the new bounds. Result: swatches slide smoothly and predictably as the range widens, instead of strobing. Only **Re‑roll** (Space, or the die button) advances the stream to new `u`s. Randomino's HUD gets this half‑right; nobody does it in a grid.
Grid: 8×6 = 48 swatches default, `count` adjustable 12/24/48/96. Click a swatch to pin it; pinned swatches survive re‑rolls. Shift‑click to copy its `oklch()` string.

**Distributions (per channel).**
- **Uniform**: `v = lo + u*(hi-lo)`.
- **Gaussian**: Box–Muller `z = √(−2 ln u₁)·cos(2π u₂)`; `v = mid + z·σ`, `σ = (hi−lo)/6`, and **reject‑and‑resample** out‑of‑range draws rather than clamping (clamping piles mass on the endpoints). Expose a `bias` control (0 = uniform → 1 = tight) mapping to `σ = (hi−lo)/(2 + 10·bias)`. Add **half‑Gaussian** (mass at one end) as Randomino does.
- **Golden ratio**: `uₙ = (u₀ + n·0.618033988749895) mod 1`. Low‑discrepancy, deterministic, ideal for hue — guarantees maximally spread hues at any count.
- **Blue noise**: Mitchell's best‑candidate — for each swatch generate `k = 10` candidates, keep the one maximizing minimum distance to already‑accepted samples, measured as **ΔEOK** (Euclidean distance in OKLab) so spacing is perceptual, not coordinate‑space.
- **Quantize** field per channel (steal from Randomino): snap to N evenly spaced values across the range; `0`/off = continuous.

**Seeded RNG.** Never `Math.random()`. Hash the seed string with `cyrb128` → four 32‑bit ints → `sfc32` (or `mulberry32` if you want a one‑liner; 32‑bit state, period is short but irrelevant at these counts). Packages: `pure-rand` (xoroshiro128+, immutable state, good for time‑travel), `rand-seed` (sfc32 default), or `seedrandom` (only via `new seedrandom(seed)` — the bare call monkey‑patches `Math.random` globally). Surface the seed as an editable text field, put it in the URL hash, and keep a 20‑deep seed history with `[` / `]`.

**Out‑of‑gamut handling.** Three user‑selectable modes, default **Chroma reduce**:
1. **Clip** — naive per‑channel clamp; fast, hue‑shifty.
2. **Chroma reduce (CSS Color 4)** — binary search OKLCh chroma with `JND = 0.02`, `ε = 0.0001`, comparing the candidate against its clipped version via ΔEOK; accept when `ΔEOK < JND`. `culori`'s `clampChroma(color, 'oklch', 'p3'|'rgb')` implements this.
3. **Reject & resample** — discard out‑of‑gamut draws entirely; guarantees the visible range is honest. Show a live "n% of this range is out of sRGB" meter.
Render each swatch with an `@supports (color: oklch(0% 0 0))` native `oklch()` value and a converted sRGB fallback; badge P3‑only swatches with a small dot.

**Libraries.** `culori@4.x` (tree‑shakeable, `converter()`, `clampChroma`, `differenceEuclidean('oklab')`, `random()`) — preferred. `colorjs.io@0.7.x` is more complete but far heavier; use only if you need CAM16/ICtCp. `apca-w3` for contrast gating if you add a "readable against background X" filter.

**Extras worth adding beyond Randomino:** a **relative/delta mode** switch per channel (range applies as ± around an input color); export as CSS custom properties / Tailwind config / JSON; a **constraint filter** row ("min ΔEOK between adjacent swatches", "min APCA Lc vs background"); and a Randomini‑style **compact floating HUD** for the inline case.

Sources: [Randomino overview](https://docs.astutegraphics.com/randomino/randomino-plugin-overview), [Color Randomization](https://docs.astutegraphics.com/randomino/randomino-panel/color-randomization), [Color Randomizer Live Effect](https://docs.astutegraphics.com/randomino/color-randomizer-live-effect), [Randomini Tool](https://docs.astutegraphics.com/randomino/randomini-tool), [Panel Preferences](https://docs.astutegraphics.com/randomino/randomino-panel-preferences), [Randomize action tags](https://docs.astutegraphics.com/action-tags/randomize), [Color Editing tags](https://docs.astutegraphics.com/action-tags/randomize/action-tags/color-editing), [product page](https://astutegraphics.com/plugins/randomino), [Color.js gamut mapping](https://colorjs.io/docs/gamut-mapping), [culori](https://www.npmjs.com/package/culori), [seedrandom](https://github.com/davidbau/seedrandom), [mulberry32](https://github.com/cprosche/mulberry32)