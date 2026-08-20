## Recommended stack (verified npm `latest`, 2026-08-20)

### Build + language
| Package | Version | Note |
|---|---|---|
| `vite` | **8.2.2** | **Not 7.** Vite 8 went stable 2026-03-12. Rolldown (Rust) is now the *single* bundler for dev+build (no opt-in), Oxc replaces esbuild transform, Lightning CSS is the default CSS minifier. ~10–30x build speedup (19k-module bench: 40.1s → 1.61s). |
| `@vitejs/plugin-vue` | 6.0.8 | |
| `vue` | **3.5.41** (stable) | `defineModel` is 3.4+, `useTemplateRef`/`useId`/props destructure are 3.5. **3.6.0-rc.4** is on the `rc` dist-tag (Vapor Mode + alien-signals reactivity rewrite). Ship on 3.5, keep `<script setup>` idiomatic so 3.6 is a version bump. Do *not* build on rc. |
| `typescript` | **7.0.2** | TS7 = the native Go port (`tsgo`). Massive typecheck speedup; verify your ESLint/`vue-tsc` chain first. Conservative fallback: `6.0.0-beta`/TS 5.9 line. |
| `vue-tsc` | 3.3.10 | |

### State + routing
- **`pinia@4.0.3`** — v4 is "technically breaking" only: **ESM-only**, and `@vue/devtools-api` must now be installed explicitly alongside it. 
- **`pinia-plugin-persistedstate@4.7.1`** — peer `pinia >=3.0.0`, so v4-compatible. Use `pick: []` to persist only palette docs, never UI/ephemeral state.
- **`vue-router@5.2.0`** — deliberately "boring": **zero breaking changes from v4**. It absorbed `unplugin-vue-router` (typed file-based routing now built in) and adds **Data Loaders** via `vue-router/experimental`. Only gotcha: the IIFE build no longer bundles `@vue/devtools-api`.
- **Data layer: skip `@tanstack/vue-query` (5.101.4).** A color tool is client-first; it buys you cache invalidation you don't need. If you *do* add a backend (team libraries, cloud saves), prefer **`@pinia/colada@1.4.2`** — posva's own, peer `pinia ^4.0.2`, integrates with Pinia devtools, far lighter than TanStack's Vue adapter (which still carries a `@vue/composition-api` peer for Vue 2).

### UI
- **`tailwindcss@4.3.3` + `@tailwindcss/vite@4.3.3`** — CSS-first config (`@theme`, `@utility`, `@variant`), no `tailwind.config.js`. v4.3 adds native **scrollbar utilities**, `font-features-*`, logical props (`pbs-*`, `mbs-*`, `inline-*`), `@container-size`, and four new neutrals (`mauve`, `olive`, `mist`, `taupe`).
- **`shadcn-vue@2.8.2` CLI + `reka-ui@2.10.3`** — `pnpm dlx shadcn-vue@latest init` / `add`. **Trap: `radix-vue` is dead** (1.9.17, last publish 2025-02-28) — it was renamed to reka-ui; anything still telling you to install `radix-vue` is a stale tutorial. Also **`tailwindcss-animate` is abandoned (1.0.7, 2023)** — use **`tw-animate-css@1.4.0`**.
- `class-variance-authority@0.7.1` + `clsx@2.1.1` + `tailwind-merge@3.6.0`.
- **`@vueuse/core@14.4.0`**, **`lucide-vue-next@1.0.0`**, **`vue-i18n@11.4.8`**, **`vue-sonner@2.0.9`** (211 KB unpacked, the right toast).

### Forms — a real trap
`vee-validate@4.15.1` is fine, but **`@vee-validate/zod@4.15.1` still declares `peerDependencies: { zod: "^3.24.0" }`** while `zod@4.4.3` is current. Zod 4 support is an open request, not shipped. Three exits:
1. **Best:** `@tanstack/vue-form@1.33.5` — consumes **Standard Schema** directly, so Zod 4 works natively with no adapter package.
2. Pin `zod@^3.25` and import from `zod/v4` inside it (the compat path) — awkward.
3. Use vee-validate with a hand-rolled validator function and keep Zod 4 only for URL/import payload parsing (which is where you actually need it — validating pasted share-links and imported palette JSON).

### Color engine
**Use `culori@4.0.2`, not `colorjs.io@0.7.1`.**
- Size: culori **1.0 MB** unpacked vs colorjs.io **15.4 MB**. colorjs.io is still pre-1.0 after years.
- Import tree-shakeably from **`culori/fn`** with explicit `useMode(modeOklch)` registration.
- Exact API you'll live in: `converter()`, `parse()`, `oklch()`, `oklab()`, `p3()`, `rec2020()`, `formatCss()`, `formatHex()`, `formatHex8()`, `inGamut()`, `clampChroma()`, `toGamut()`, `clampGamut()`, `interpolate()`, `interpolateWithPremultipliedAlpha()`, `interpolatorSplineMonotone()`, `samples()`, `easingSmoothstep()`, `easingMidpoint()`, `easingGamma()`, `fixupHueShorter/Longer/Increasing/Decreasing`, `differenceCiede2000()`, `differenceHyab()`, `differenceEuclidean()`, `nearest()`, `wcagContrast()`, `wcagLuminance()`, `blend()`, `average()`, `mapper()`, and **CVD simulation `filterDeficiencyProt/Deuter/Trit()`** — that last trio is a shipped enterprise feature most competitors hand-roll badly.
- **Differentiator to beat:** culori ships only WCAG 2 contrast. `apca-w3@0.1.9` (+ `colorparsley`) is frozen at 2022 — the *algorithm* (APCA 0.1.9 / W3 lookup) is stable, so vendor ~60 lines of it rather than taking the dep, and offer **WCAG 2.2 + APCA side-by-side with the disagreement highlighted**. Almost no tool does this.

### Drag & drop — mostly landmines
- **`vuedraggable@next` (4.1.0) last published 2021-08-22. Dead. Do not use.** `vuedraggable@latest` is 2.24.3 = Vue 2.
- `sortablejs-vue3@1.3.0` (2025-08) — thin, OK.
- `vue-draggable-plus@0.6.1` (2026-01) — the practical SortableJS successor, `v-model` array binding, script-setup native, TS. Fine for simple swatch reorder.
- **Recommended for enterprise: `@atlaskit/pragmatic-drag-and-drop@3.0.0`** — Atlassian's headless, framework-agnostic engine behind Jira/Trello. ~4.7 kB core, real keyboard-accessible DnD, nested drop targets, autoscroll, external-file drops (drag a `.ase`/image in). SortableJS wrappers give you **no keyboard DnD** — that alone disqualifies them for WCAG-compliant enterprise procurement. **This is your differentiator: shift+arrow reordering that actually works.**

### Export
- **`modern-screenshot@4.7.0`** (182 KB, published 2026-04-16) over **`html-to-image@1.11.13`** (308 KB, stale since 2025-02). modern-screenshot is a maintained fork of html-to-image with better web-font/`OffscreenCanvas` handling and a `domToBlob`/`createContext` API for repeated captures. For a color tool, prefer **hand-authored `<svg>` → `XMLSerializer` → `Image` → `canvas`** for swatch sheets; you control fidelity absolutely and skip the whole DOM-rasterizer class of bugs. Use modern-screenshot only for "screenshot this arbitrary preview UI."
- **`jspdf@4.2.1`** (+`jspdf-autotable@5.0.8`, peer `jspdf ^2||^3||^4`) — **29 MB unpacked**; lazy-`import()` it behind the export button, never in the main chunk. `pdf-lib@1.17.1` is abandoned (2021). Honestly: for palette specimen sheets, generating PDF yourself is overkill — jsPDF's `rect()` + `text()` is enough, skip a layout engine.
- **`file-saver@2.0.5` is from 2020 — drop it.** Use `showSaveFilePicker()` (File System Access API) with an `<a download>` + `URL.createObjectURL` fallback; ~15 lines, no dep, and gives real "Save As" in Chromium.
- **`jszip@3.10.1` is from 2022 — replace with `fflate@0.8.3`** (2026-05, ~8 kB, sync + streaming + worker, 2–3x faster).

### Charts / motion / keys / lists
- **Charts: hand-roll SVG.** `echarts@6.1.0` is **58.9 MB unpacked** (tree-shake via `echarts/core` if you must; `vue-echarts@8.1.0`). `@unovis/vue@1.6.7` is only 346 KB and is the right pick *if* you need real charts. But contrast matrices, hue/chroma/lightness ramps, and gamut plots are 40-line SVG components — a chart lib fights you on all three.
- **Motion: `motion-v@2.4.0`** (published 2026-08-15, the official Motion port, hybrid JS+WAAPI engine, layout + shared-layout animations). **`@vueuse/motion@3.0.3` is stale (2025-03) — skip.** Add **`@formkit/auto-animate@0.10.0`** for list add/remove/reorder; it's 3 kB and covers 80% of palette-editing motion for one directive.
- **Keys: `useMagicKeys` from VueUse**, not `hotkeys-js@4.0.5` (4.7 MB unpacked, non-reactive, manual scope teardown). Exact shape:
```ts
const keys = useMagicKeys({ passive: false, onEventFired(e) {
  if (e.ctrlKey && e.key === 'z' && e.type === 'keydown') e.preventDefault()
}})
whenever(keys['Ctrl+Z'], undo)
whenever(keys['Ctrl+Shift+Z'], redo)
whenever(keys['Meta+Z'], undo)          // combos join with + or _
const { current } = keys                // Set<string> of live-pressed keys
```
Guard against firing inside inputs with `useActiveElement()`.
- **Virtual scroll: `@tanstack/vue-virtual@3.13.36`** (headless, grid + dynamic measure, same mental model as the rest of TanStack). `virtua@0.50.2` is a strong lighter alternative. `vue-virtual-scroller@3.0.5` is maintained (2026-08) but component-shaped and ESM-only — less control over swatch grids.

---

## Unlimited undo/redo for palette state in Pinia

**Don't use `pinia-undo` (0.2.4, Dec 2023, abandoned).** Two viable designs; pick per state size.

**A. Snapshot history (simplest, correct for palettes).** A palette document is ~1–20 KB. Even 5,000 snapshots is well under memory pressure.

```ts
const palette = ref<PaletteDoc>(initial)
const { undo, redo, canUndo, canRedo, commit, clear, batch, history } =
  useManualRefHistory(palette, { clone: structuredClone })  // capacity omitted = unlimited
```
Use **`useManualRefHistory`**, *not* `useRefHistory` — automatic history records every reactive tick, so one hue-slider drag produces 400 entries. Commit at **semantic boundaries**: `pointerup`, blur, enter, `$onAction` completion. For continuous edits, wrap in `batch(() => {...})` or route through `useDebouncedRefHistory(palette, { debounce: 250, deep: true, clone: structuredClone })`.

**B. Inverse-command log (true unlimited, O(1) per edit).** Append `{ op, path, before, after, label, t }` and keep a pointer index. Undo applies the inverse; redo re-applies; a new edit truncates the tail. Memory is proportional to *what changed*, not to document size — a 200-swatch palette costs 3 bytes per undo step, so 100k steps is trivial. Persist the log to IndexedDB (`idb-keyval`) so history survives reload — a genuine differentiator, since every browser palette tool loses history on refresh.

Wire it as a **Pinia plugin** so it's declarative per store:
```ts
pinia.use(({ store, options }) => {
  if (!options.history) return
  store.$subscribe((mutation, state) => {
    // mutation.type: 'direct' | 'patch object' | 'patch function'
    if (suppress.value) return          // set during undo/redo application
    log.push(diff(prev, state)); prev = structuredClone(toRaw(state))
  }, { detached: true })
})
```
Critical details: (1) **split stores** — `usePaletteStore` (historied) vs `useUiStore` (selection, zoom, active tab — *never* historied), otherwise Ctrl+Z rewinds a panel toggle; (2) set a `suppress` flag while applying an undo or you'll record your own undo; (3) group with `$patch(obj)` — one patch fires **one** subscription, whereas N direct assignments fire N; (4) label every entry (`"Adjust chroma"`, `"Add swatch"`) and surface a history *panel* — enterprise buyers ask for it and free tools never have it; (5) coalesce same-path edits within 300 ms into one entry.

---

## Compact shareable-URL encoding

**Encode the recipe, not the result.** A 12-step ramp = seed OKLCH + algorithm id + curve params ≈ **8–12 bytes**, versus ~90 bytes for twelve hex strings. Only fall back to explicit swatch lists for hand-tuned palettes.

Layout a versioned binary buffer:
```
byte 0      : (version << 4) | mode      // 16 versions, 16 payload modes — never omit this
byte 1      : swatch/ramp count
then, per ramp: seed L(12b) C(12b) H(12b) = 4.5B bitpacked, algo(4b), 2–4 param bytes
explicit mode: 3 bytes/swatch sRGB, or 5 bytes for P3/Rec2020 wide-gamut
```
Bitpack OKLCH at 12 bits per channel (L 0–1, C 0–0.4, H 0–360): quantization error is below JND, and it's 4.5 bytes vs 3 for hex while preserving out-of-sRGB colors.

Then encode with the **ES2026 native base64url** — Baseline since Sept 2025, Node 22+:
```ts
const s = bytes.toBase64({ alphabet: 'base64url', omitPadding: true })
const b = Uint8Array.fromBase64(s, { alphabet: 'base64url' })
```
This replaces `TextEncoder` + `btoa` + manual `+/=` swapping, and handles Unicode correctly by construction.

For payloads above ~150 bytes (large explicit palettes, named metadata), pipe through native **`CompressionStream('deflate-raw')`** before base64url — zero dependency, ~30–60% of original where lz-string manages only ~52–83%. **Skip `lz-string@1.5.0` (2023)**: it exists to work around the absence of native compression, which no longer applies, and its UTF-16 output modes are a footgun in URLs.

Put it in the **hash**, `#p=<payload>`, not the query string. Fragments are never transmitted to the server — so shared palettes never land in access logs or a CDN cache key, which is a genuine privacy line item in enterprise review — and they dodge request-line length limits. Keep total URL under ~2000 chars anyway (Slack/Outlook/QR practicality); above that, degrade to a short-link/save flow.

Bind reactively with `useUrlSearchParams('hash-params')` from VueUse, write via **`history.replaceState`** (never `pushState` — it would make browser Back an accidental undo), and **throttle writes to ~500 ms**: Safari throttles `replaceState` to ~100 calls per 30 s and drops the excess silently. Parse inbound URLs through a Zod 4 schema and fail soft to a default palette with a `vue-sonner` toast — never a blank screen from a truncated link.

**Sources:** [Vite 8 announcement](https://vite.dev/blog/announcing-vite8), [InfoQ: Vite v8](https://www.infoq.com/news/2026/05/vite-v8-rust/), [Vue Router v4→v5 migration](https://router.vuejs.org/guide/migration/v4-to-v5), [Pinia releases](https://github.com/vuejs/pinia/releases), [Tailwind v4.3](https://tailwindcss.com/blog/tailwindcss-v4-3), [culori API](https://culorijs.org/api/), [colorjs.io](https://colorjs.io/), [VueUse useRefHistory](https://vueuse.org/core/useRefHistory/), [VueUse useMagicKeys](https://vueuse.org/core/useMagicKeys/), [Vue School: DnD in Vue 3](https://vueschool.io/articles/vuejs-tutorials/how-do-i-drag-and-drop-in-vue/), [modern-screenshot](https://www.npmjs.com/package/modern-screenshot), [Motion for Vue](https://motion.dev/docs/vue), [MDN Uint8Array.toBase64](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array/toBase64), [vee-validate Zod 4 discussion](https://github.com/logaretm/vee-validate/discussions/5086), [shadcn-vue Vite install](https://www.shadcn-vue.com/docs/installation/vite)