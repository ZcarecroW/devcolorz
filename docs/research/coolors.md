# coolors.co — Feature Teardown

## Stack signals (observed in shipped code)
- Monolith, server-rendered HTML + one giant obfuscated bundle: `https://coolors.co/assets/js/dist/script.min.js?v=62` (**4.8 MB**), plus `vendor.min.js`. Cloudflare + Rocket Loader.
- **`culori`** (npm) is the color-math library. **SortableJS** (`cdn.jsdelivr.net/npm/sortablejs@latest`) does drag-to-reorder — loaded unpinned from a CDN.
- Visualizer templates are **inline SVG driven by CSS custom properties `--c1`…`--c10`** with cascading fallbacks so one template survives any palette size:
  `fill: var(--c8, var(--c5, var(--c3, var(--c1))))`, plus `--c-text1` / `--c-text2`. This is the whole trick behind "preview on real designs" — cheap to beat with more/better templates.
- Ads via BuySellAds (`m.servedby-buysellads.com`), consent via iubenda.

## Generator UI
Toolbar button IDs reveal the exact feature set: `generator_ai-btn` ("New AI tools"), `image-picker-btn` ("Extract colors from image"), `variations-btn` ("View palette variations"), `visualize-btn`, `contrast-btn` ("Check palette contrast"), `blindness-btn`, `adjust-btn`, `undo-btn`, `redo-btn`, `view-btn`, `export-btn`, `save-btn`, `palettes-btn`, `collage-maker-btn`, plus `generator_zen-mode-close-btn`, `generator_history`, `generator_method-label`.

### Keyboard shortcuts — official table (Help Center, updated 2024-03-18)
| Action | Windows | Mac |
|---|---|---|
| Generate colors | `Spacebar` | `Spacebar` |
| Lock/Unlock colors | `CTRL + [0-9]` | `CMD + [0-9]` |
| Lock next color | `CTRL + \` | `CMD + \` |
| View palette | `CTRL + I` | `CMD + I` |
| Export palette | `CTRL + E` | `CMD + E` |
| Save palette | `CTRL + S` | `CMD + S` |
| Toggle palettes sidebar | `CTRL + P` | `CMD + P` |

### Undocumented bindings found in the bundle (real, not in the docs)
`ctrl+z` / `ctrl+alt+z` (undo/redo — tooltip confirms `CTRL ALT Z` for redo, not the usual `CTRL+SHIFT+Z`), `ctrl+y`, `ctrl+shift+…`, `ctrl+backspace` / `meta+backspace`, `meta+a`, `meta+d`, `meta+g`, `meta+h`, `meta+k`, `meta+l`, `meta++` / `meta+-`, `shift+tab`, `shift+arrow…`, and raw `space / escape / enter / left / right / up / down`.
**Beatable:** the published list is 7 rows and 2 years stale; there is no in-app `?` cheat-sheet overlay, no command palette (`⌘K` is bound but undocumented), and `CTRL+P`/`CTRL+S` fight the browser.

## Locking
Per-column lock icon. Locked swatches are held; spacebar regenerates only unlocked columns, choosing new colors "to match perfectly with the locked colors." No partial lock (can't lock hue but free lightness), no per-column re-roll, no lock-all/invert-locks — obvious gaps.

## Adjust panel ("Palette Adjust")
Sun icon → right sidebar with **four sliders: Hue, Brightness, Saturation, Temperature**. Live original-vs-new side-by-side comparison. `Cancel` / `Apply` (`generator_palette-adjust_cancel-btn` / `_apply-btn`). No per-channel curves, no OKLCH lightness ramp, no contrast-preserving adjust.

## Color Inspector & naming
Click any HEX → Color Inspector. Input/read in **RGB, CMYK, LAB, HSB**, plus commercial libraries **Pantone®, RAL®, Copic®** (Pro). "Sets" tab holds **Favorites** (three-dots → Add color, with a name). Every color gets a human-readable **name**; standalone pages exist at `coolors.co/{hex}` (`#EF5B5B Color Info`) with Name, **Shades / Tints / Tones**, Complementary, Triadic, and blindness sections. Palette Inspector (`CTRL+I`) shows all formats; **click a value to copy to clipboard**.

## Reorder, add/remove, max count
Drag columns to reorder. `×` removes a column; the `+` between two columns adds one — **keep the button pressed to choose how many to insert**, and Coolors auto-interpolates a fade between the two neighbors (this is the "gradient palette" feature). Range is **2–10 columns; free accounts are capped at 5**, 10 is Pro.

## Generation methods
Method IDs in the bundle: `analogous`, `complementary`, `split_complementary`, `triadic`, `tetradic`, `square` — plus **Auto** (mixes all types) and shades/monochromatic. Standard hue-wheel offsets: analogous = adjacent hues, complementary = +180°, split-complementary = complement ±~30°, triadic = 120° spacing, square = 90° spacing, tetradic = two complementary pairs. Also `shufflePalette` / shuffle button. **Beatable:** these are naive HSL-wheel rules — perceptually uniform OKLCH harmonies, lightness-ramp control, and contrast-aware generation are all absent.

## Palette Visualizer
Categories: **Mobile/Web UI, Branding, Typography, Pattern, Illustration** ("More templates to come!"). Has its own toolbar: generate, generate-method, shuffle, undo/redo, adjust, color-inspector, export, **`visualizer_upload-btn` — "Upload your graphic"** (upload your own SVG design and have it recolored, Pro), and `visualizer_css`.

## Export
From the export modal: **URL, PDF, Image (PNG), CSS, SCSS, ASE (Adobe), SVG, Code, Tailwind, Embed, X, Pinterest**, plus **CSS Gradient**. PDF is the flagship: multi-page with variations of hue/saturation/brightness/temperature and a **color-blindness map**; **custom logo on PDF = Pro**. Mobile app adds **Procreate** export. **Beatable:** no JSON, no design tokens (W3C DTCG), no Figma variables, no CSS `@theme`/OKLCH vars, no Tailwind v4 `@theme` block, no shadcn theme, no ASE→USE round-trip.

## Explore / Trending
`coolors.co/palettes/trending` — **10M+ ready schemes for Pro, only 10K+ visible on Free** (explicit line on the pricing page). Order by popularity / creation date / trend; filter by **color** (red, green, blue…) and **style** (dark, warm, gradient, pastel…); keyword or HEX search; **"Search with AI"**; "Load more" pagination.

## Image Picker
Camera icon or `/image-picker`. Upload / webcam / paste image URL / free stock photos. A **slider steps through several auto-generated palettes** from the same image; ± buttons change color count; the picker dots can be **dragged over the photo** to hand-pick pixels; colors can be reordered in the strip. **Collage Maker** wraps this: Style (stripes/circles/frames), Size (square, 16:9), Palette tabs, drag-to-reposition photo.

## Contrast tooling (two separate things)
1. **`/contrast-checker`** — two-color ratio vs WCAG 2.x: AA 4.5:1 small / 3:1 large, AAA 7:1 / 4.5:1. Shareable URL form `coolors.co/contrast-checker/93dfb8-ffdf00`.
2. **"Palette contrast check"** (Pro, in-generator) — an **overall score** ("Very poor"…), a toggle **"Evaluate only adjacent colors"**, a per-pair "Poor contrast" list with a **`Fix` button per pair and a `Fix palette…` bulk auto-fix**. This is their strongest differentiator and the one most worth beating (it's WCAG 2 ratio only — **no APCA / WCAG 3 Lc**).

## Color blindness
Glasses icon → sidebar listing the standard eight: protanopia, protanomaly, deuteranopia, deuteranomaly, tritanopia, tritanomaly, achromatopsia, achromatomaly. Original vs simulated side-by-side; exportable in the PDF.

## Library, projects, collections
Palettes Sidebar has **Library** and **Explore** tabs. Projects and Collections created from the filter dropdown's `+` icon or inline while saving. **Everything requires an account and is server-side only — no local/offline save.**

## Other tools
Gradient Maker (stops with position, rotation, type, random, **Copy CSS** only), Gradient Palette, List of Colors, List of Gradients, Image Converter, Photo Editor, SVG Recolor, Free Fonts, Tailwind Colors, **Color Bot** (chat AI for palettes/color questions).

## Apps & extensions
iOS (4.8★, **10,511 ratings — but version 4.6.9, last updated 2022-09-02**, ~4 years stale; requires iOS 10+), Android `co.coolors.android` (**3.3★, ~960 reviews**), Chrome extension, Figma plugin, Adobe extension (Illustrator/InDesign/Photoshop ≤20; "Photoshop 21+ and XD coming soon" — still not shipped). No official palette-from-a-website-URL feature; that's third-party **Site Palette**, which exports *into* Coolors.

## Free vs Pro (verbatim from `/pricing`)
**Free:** ads visible; palettes **up to 5 colors**; **10K+** ready schemes; **save up to 10 palettes**; **1 project and 1 collection**; **save up to 5 colors**; pick colors from image; collages with limited options; basic public profile.
**Pro:** Coolors AI (**3000 credits/mo**), no ads, **up to 10 colors**, **10M+** schemes, unlimited palettes/projects/collections/colors, full collages, Pro profile, **palette contrast check**, palette variations, save images+gradients+fonts, color libraries (Pantone/RAL/Copic), advanced export, private profile, **custom logo on exported PDFs**, dark mode.
**Price:** **$3/mo billed yearly** (web); **"Forever" one-time $99, struck through from $149**; iOS IAP **$4.99/mo or $35.99/yr**. Subscription shared across web/apps/plugins. FAQ: *"We can't offer discounts at the moment"* — **no student, team, or education plan**.

## Concrete pain points to beat
1. **Billing/support is the #1 complaint.** Trustpilot/Product Hunt: *"We canceled our coolors subscription about 2 years ago and they have still been charging us since"*; auto-renew refund requests get *"no response, no acknowledgment"*; users doing chargebacks. → Self-serve cancel, prorated refunds, visible receipts.
2. **Ad/consent/tutorial friction.** *"I first have to work my way through a data protection banner, then click away the tutorial."* Educators call it unusable in classrooms; free tier is "cluttered because of the ads"; an ad-block popup begs for $3/mo. → Zero-interstitial first load.
3. **Account required to save anything; no offline.** *"If you have no internet access, you can't save any palettes, or browse any of your saved palettes."* → localStorage/IndexedDB-first, sync optional.
4. **Stale mobile & plugins.** iOS untouched since Sept 2022, Android 3.3★, Adobe XD/PS21+ "coming soon" for years. Old one-time purchasers were **not grandfathered** into Pro.
5. **Accessibility is bolted on and Pro-gated.** WCAG 2 ratios only, no APCA, no contrast-constrained *generation* — only after-the-fact "Fix". Free users get zero palette-level contrast checking.
6. **Randomness without reasoning.** *"can feel random without understanding color theory basics"*; "generates rather than thinks for you"; no explanation of *why* a palette works, no roles (bg/surface/text/accent), no semantic token output.
7. **Free 5-color ceiling** blocks the most common real need (a 6–9 step UI ramp), and the 10-palette / 1-project cap is aggressive.
8. **Export gaps:** no JSON, no design tokens, no OKLCH, no Tailwind v4 `@theme`, no Figma variables.
9. **Shortcut discoverability:** ~20 bindings ship, 7 are documented, none are shown in-app or remappable; `⌘K` exists but there's no command palette UI.

**Sources:** [Generator Shortcut Keys](https://coolors-help.zendesk.com/hc/en-us/articles/360010583000-Generator-Shortcut-Keys) · [Generate a palette](https://coolors-help.zendesk.com/hc/en-us/articles/360010581980-Generate-a-palette) · [Adjust and refine](https://coolors-help.zendesk.com/hc/en-us/articles/360010584700) · [Export a palette](https://coolors-help.zendesk.com/hc/en-us/articles/360010581920) · [Image Picker](https://coolors-help.zendesk.com/hc/en-us/articles/360010537260) · [Explore](https://coolors-help.zendesk.com/hc/en-us/articles/360010698899) · [Pricing](https://coolors.co/pricing) · [Visualizer](https://coolors.co/visualizer) · [Product Hunt reviews](https://www.producthunt.com/products/coolors/reviews) · [Trustpilot](https://www.trustpilot.com/review/coolors.co) · [iOS App Store](https://apps.apple.com/us/app/coolors/id956480678) · [MakerStack review](https://makerstack.co/reviews/coolors-review/) · [Easyweb critique](https://www.easyweb-agency.fr/en/outils-comparatifs/coolors)