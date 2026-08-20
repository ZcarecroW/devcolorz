# Using DevColorz

A tour of what the app does and, more usefully, *why* it does it that way.

Everything except saving works without an account. Palettes live in the URL, so
a link is a complete palette — no sign-up to share one.

---

## The generator

### Constrained randomness

Most palette tools give you a space bar and hope. DevColorz lets you describe
the region of a colour space you want, and every roll lands inside it.

Each channel gets a **range** with two handles. Drag a handle to move that
edge; drag the selected band to slide the whole range without resizing it;
click the dimmed part of the track to jump the nearer handle there.

The track shows you the colours it selects, and the diagonal hatching marks
values that **no combination of your other ranges can reach**. If you narrow
chroma to 0.25 and the hatching swallows the lightness track, that is the
gamut telling you no colour is that colourful at any lightness.

**Distributions** shape where inside the range values fall:

| | |
|---|---|
| **Uniform** | Honest randomness — which also means occasional clumps |
| **Gaussian** | Clusters around the middle; a dominant tone with outliers |
| **Edges** | Pushes to both ends; high-contrast pairs, nothing in between |
| **Golden ratio** | Maximally spread with no clumping — the classic trick for distinct hues |
| **Stratified** | One bin per colour, jittered; guarantees the whole range is covered |
| **Blue noise** | Evenly spaced but non-repeating |

**Distinctness** sets how far apart results must be, measured in ΔEOK. Around
8 keeps a palette readable; above 20 forces genuinely different hues. If your
ranges are too tight to satisfy it, the requirement relaxes rather than hanging.

**Seed** makes a roll reproducible. Leave it empty for fresh entropy; set it
and the same settings always produce the same palette, which is what makes
"here is the exact palette I got" possible.

The **preview grid** below re-rolls as you drag, using a fixed seed so a small
change makes a small change. Click any swatch to drop it into the palette.

> **Which colour space?** OKLCH is the default and usually right: it is
> perceptually uniform, so equal steps look equal. HSL is familiar but lies —
> `hsl(60 100% 50%)` and `hsl(240 100% 50%)` claim the same lightness and one
> is obviously brighter. OkHSL is the safe option: every value in it is inside
> sRGB, so nothing ever needs gamut mapping.

### Harmony

Pick an anchor, pick a wheel, click a scheme.

**The wheel matters, and most tools hide the choice.** On the artist's RYB
wheel — the one taught in art school — blue's complement is orange. On the
perceptual OKLCH wheel it is yellow. Neither is wrong, but if you say
"complementary" to a designer they mean the first, which is why it is the
default.

**Vary tone** fans lightness and chroma outward from the anchor. Without it a
harmony is colours of identical weight, which reads as a swatch chart rather
than a palette.

**Spread** applies to the two schemes that have a separation to set: the step
between neighbours in *analogous*, and how far the satellites sit from the
complement in *split complementary*. The cards it affects show the angle.

### Scales

Turn one colour into the 11- or 12-step ramp a design system needs.

- **Tailwind 50–950** — what most of the ecosystem uses; 500 is the base.
- **Radix 1–12** — every step has a defined job: 1 is the app background, 3–5
  component fills, 6–8 borders, 9 the solid brand colour, 11 low-contrast text,
  12 high-contrast text. Harder to learn, far easier to build with, because you
  stop guessing which step to use.
- **Material tones** — 0 to 100, pairs with the M3 dark-mode approach.

Three ways to generate:

- **Even lightness** — smoothest ramp, no contrast guarantees.
- **Solve for contrast** — each step hits a target ratio, so step 700 always
  clears 4.5:1 whatever hue you seeded. Steps can look unevenly spaced,
  because equal contrast steps are not equal lightness steps.
- **Hybrid** — even spacing, nudged only where a step misses. The default.

There is also a **neutral ramp** with a few percent of your brand hue mixed in.
Pure grey beside a saturated brand colour looks dirty; almost every serious
design system tints its greys and almost no generator offers it.

### From an image

Drop, paste or pick a photo. Nothing is uploaded — it is read in your browser.

- **k-means** — what is actually in the image.
- **Median cut** — faster, covers the whole range, less characteristic.
- **Vibrant** — ranks clusters by how *interesting* they are rather than how
  much of the image they cover. A grey street with one red door gives you the
  red door. Usually the one you want for brand work.

All three cluster in OKLab, not RGB. Clustering in RGB is why other extractors
hand back five near-identical browns from a sunset.

Click the canvas to pick a specific colour.

---

## Layouts

Five colours and forty want different shapes, so the strip offers four:

- **Columns** — the traditional full-height strips. Best up to about ten.
- **Boxes** — tiles filling the whole area in whichever grid keeps them closest
  to square, with the last row widening to absorb the remainder. This is the
  one that stays readable at twenty or forty.
- **Rows** — full-width bands. The easiest way to judge lightness order,
  because every colour spans the same distance.
- **Cards** — a scrolling grid that keeps every name and value on screen.

---

## Previews

Eighteen templates — landing pages, dashboards, mobile screens, editorial
layouts, a UI kit, chart sets — rendered from your palette.

They are not decoration. A palette of N colours is mapped onto each template's
semantic slots by a solver: the background is chosen first, text is chosen for
contrast against it, the brand colour for chroma and separation, status colours
by hue neighbourhood. That is why an arbitrary palette produces a legible
interface instead of a random one, and why it works at two colours and at
forty.

Colours the solver had to **invent** — because your palette had no usable
border, say — are marked as derived in the legend under the preview. It tells
you what it made up.

**Auto** follows the app's own light/dark setting. **Palette** instead asks
which scheme your palette is actually built for. Forcing the opposite is the
useful test: a palette built for a white page usually loses its accents on a
dark background, and this is where you find out.

---

## Accessibility

Two metrics, side by side, because they answer different questions.

**WCAG 2.x** is what conformance is measured against, so you usually have to
satisfy it. Its weaknesses are well documented: it over-rates dark backgrounds,
under-rates mid-tones, and ignores font size and weight entirely.

**APCA** is what actually predicts readability. It reports Lc values from about
−108 to 106, and the sign carries meaning — light-on-dark and dark-on-light are
scored differently because the eye treats them differently. Roughly:

| Lc | Good for |
|---|---|
| 90+ | Body text at any weight, including thin |
| 75+ | Body text from 16px — the practical reading minimum |
| 60+ | Larger or heavier text, headlines |
| 45+ | Non-text: icons, borders, focus rings |
| below 30 | Disabled states and decoration only |

The **contrast matrix** scores every pair in the palette. Click a cell for both
metrics and a one-click fix that moves the colour's lightness while keeping its
hue, so the result still belongs to the palette.

**Colour-vision simulation** covers the common deficiencies. The matrices are
applied in linear light, which is how the source paper defines them — most
implementations apply them to gamma-encoded values, which makes results too
light and hides collisions a colour-blind user would actually hit.

The **collision list** names pairs that stay distinct in normal vision but
collapse under a deficiency. **Simulate the whole studio** applies it to the
palette and every preview at once.

Achromatopsia is worth a look even though it is rare: it is the best proxy you
have for greyscale printing, cheap projectors and e-ink. If the palette works
there, lightness alone is carrying the meaning.

---

## Export

Sixteen formats, from CSS custom properties to a shadcn registry item you can
install with `npx shadcn add`.

**Notation** — hex, `rgb()`, `hsl()`, `lab()`, `lch()`, `oklab()`, `oklch()`,
`color(display-p3 …)`. OKLCH is recommended: perceptually uniform, wide gamut,
readable, and what Tailwind v4 and shadcn now ship.

**Naming** — prefix, suffix, and case. A live example updates as you type.

**Transparent variants**, three kinds, and the difference matters:

- **Opacity ladder** — your colour at a series of opacities. Predictable, but
  the result depends on whatever is behind it.
- **Solved alpha** — the pair of colour *and* opacity that composites to a
  specific target over a specific background. The exported value looks nothing
  like your original, which is the point: because it is genuinely translucent
  it stays correct over gradients, images and nested surfaces. This is how
  Radix builds its alpha scales.
- **Neutral overlay** — black or white at a series of opacities, chosen to suit
  the background. For scrims, hover fills and dividers.

**Light and dark**, with six strategies and an explanation of each:

| | |
|---|---|
| **OKLCH curve** | The default. Flips near-neutral surfaces into a comfortable dark band, and *lifts* chromatic accents instead — because flipping a brand green at 56% lightness gives you 44%, which on a dark background reaches about Lc 20, far below the Lc 45 a button needs |
| **Preserve contrast** | Ignores lightness and solves for contrast, so anything readable in light mode is equally readable in dark. The only strategy that can promise that |
| **Radix-style** | A dark theme is not a mirror: backgrounds stay very dark, solid brand colours barely move, only text inverts strongly |
| **Material 3** | Picks a different tone from the same tonal palette — tone 40 becomes tone 80 |
| **OKLCH flip** | The honest flip. Mid-tones do not move, so the hierarchy is lost |
| **HSL flip** | The classic mistake, included so you can see why it fails |

The before/after strip shows each colour above its dark counterpart with the
APCA drift between them. Under 10 is a faithful translation.

**Per colour**, you can override any of it: exclude a colour, force a specific
dark value, turn alpha or scales on for one and not another.

---

## Accounts

Optional. Everything above works signed out.

An account adds saving, collections, version history, and public palette pages.
Registration may need an invitation code, depending on how the administrator
configured the instance.

---

## Keyboard

Press <kbd>?</kbd> for the full list. The essentials:

| | |
|---|---|
| <kbd>Space</kbd> | Generate |
| <kbd>L</kbd> | Lock or unlock the hovered colour |
| <kbd>R</kbd> | Re-roll the hovered colour |
| <kbd>Ctrl</kbd>+<kbd>Z</kbd> | Undo — unlimited, and a whole slider drag is one step |
| <kbd>Ctrl</kbd>+<kbd>K</kbd> | Command palette |
| <kbd>Ctrl</kbd>+<kbd>V</kbd> | Paste colours, or an image, from the clipboard |
| <kbd>D</kbd> | Toggle dark mode |
| <kbd>[</kbd> <kbd>]</kbd> | Show or hide the side panels |

Shortcuts never fire while you are typing in a field.

---

## The theme editor

A second, related tool: the 44 CSS custom properties a shadcn theme is made of.

The app is painted with exactly the tokens it exports, so nothing on that page
is a mock-up. Change `--primary` and the button you clicked to change it
repaints, along with the header and the playground. If the preview looks wrong,
the app is wrong.

**Generate from the current palette** is the bridge between the two halves:
your palette becomes a full shadcn theme, dark mode included. Then
**Copy globals.css** and paste it into your project.
