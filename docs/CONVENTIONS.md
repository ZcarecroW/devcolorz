# DevColorz — conventions for contributors

Read this before writing any file. It is short on purpose.

## Stack

Vue 3.5 `<script setup lang="ts">`, Vite 7, Tailwind CSS v4, shadcn-vue components
(already installed under `app/components/ui/*`), Pinia 3, vue-router 4 (hash history),
`@lucide/vue` for icons, `vue-sonner` for toasts, `culori` behind our own engine.

Path alias: `@/` → `app/`.

## Hard rules

1. **Never import `culori` directly.** Everything goes through `@/lib/color/*`.
   The engine owns typed converters, gamut handling and the epsilon-tolerant
   in-gamut test; bypassing it reintroduces bugs we already fixed.
2. **Colour objects are raw, not reactive.** They live in `shallowRef`s and are
   replaced wholesale. Never `reactive()` a colour, never mutate one in place.
3. **Never write to `app/lib/color/*`, `app/lib/theme/*`, `app/lib/export/*`,
   `app/stores/*` or `app/components/ui/*`.** If you need something that is not
   there, say so in your return value and use a local helper meanwhile.
4. **Everything is themed by tokens.** Use Tailwind semantic utilities
   (`bg-background`, `text-muted-foreground`, `border-border`, `bg-card`,
   `text-primary`, `bg-accent`…). Never hard-code a hex or a `gray-500` — the
   whole app re-themes at runtime and hard-coded colours break that.
   The exception is a preview surface that is deliberately painted from the
   *user's* palette; there, use inline styles from the role map.
5. **Accessibility is not optional.** Every interactive element gets an
   accessible name. Icon-only buttons get `aria-label`. Custom widgets get the
   right role and keyboard handling. Focus rings are never removed.
6. **Tooltips carry real explanations.** Use `@/components/common/InfoHint.vue`
   with `title` + `text` (or a default slot). The text should explain the
   trade-off, not restate the label. Two to four sentences is normal here.
   Pass `wide` for anything longer than a line.
7. **British/American spelling:** user-facing copy is American English.
8. **No new npm dependencies.** Work with what is installed.

## Comment style

Comments explain *why*, never *what*. A file-level block comment at the top of
each module states what the thing is for and what non-obvious decision it
embodies. Inline comments only where a reader would otherwise ask "why on
earth".

Do not write comments like `// loop over swatches`. Do write comments like
`// Locked colours are passed as `avoid` so new colours keep their distance.`

## Copy voice

Plain, specific, confident. No exclamation marks, no "simply", no marketing.
Explain the trade-off and let the user decide. Numbers where numbers help.

## Component shape

```vue
<script setup lang="ts">
/**
 * What this is and the one decision worth knowing about.
 */
import { computed } from 'vue'
import { Button } from '@/components/ui/button'
import { usePaletteStore } from '@/stores/palette'

const palette = usePaletteStore()
</script>

<template>
  <div class="flex flex-col gap-3">…</div>
</template>
```

No `<style>` blocks — Tailwind only.

## The engine

`docs/API-DIGEST.md` lists every exported symbol. The modules you will use most:

- `@/lib/color/convert` — `formatColor(color, format, precision)`, `parseColor(text)`,
  `css(color)`, `hexToken(color)`, `channelValues(color, space)`,
  `fromChannelValues(space, values)`, `toOklch`, `toRgb`, `FORMAT_LABELS`, `FORMAT_HINTS`
- `@/lib/color/contrast` — `wcag(a, b)`, `apca(text, bg)`, `wcagLevel(ratio, large?)`,
  `apcaVerdict(lc)`, `bestBlackOrWhite(bg)`, `makeReadable(color, bg, opts)`,
  `contrastMatrix(colors, metric)`, `METRIC_HINTS`
- `@/lib/color/gamut` — `isInGamut`, `mapToGamut`, `maxChroma(l, h)`, `deltaEOK(a, b)`,
  `GAMUT_STRATEGY_LABELS`, `GAMUT_STRATEGY_HINTS`
- `@/lib/color/roles` — `assignRoles(colors, opts)` → `RoleMap`, `rolesToCssVars(roles, fmt)`,
  `auditRoles(roles)`, `mix(a, b, t)`
- `@/lib/color/scale` — `generateScale(seed, opts)` → `ScaleStop[]`,
  `SCALE_MODE_HINTS`, `SCALE_PRESET_HINTS`, `RADIX_PURPOSES`, `TAILWIND_PURPOSES`
- `@/lib/color/invert` — `toDark(color, opts)`, `INVERT_LABELS`, `INVERT_HINTS`, `reportInversion`
- `@/lib/color/cvd` — `simulate`, `simulatePalette`, `findCollisions`, `cvdSafetyScore`,
  `CVD_TYPES`, `CVD_IDS`, `CVD_AUDIT_SET`
- `@/lib/color/extract` — `extractPalette(source, opts)`, `ALGORITHM_LABELS`, `ALGORITHM_HINTS`
- `@/lib/color/name` — `describeColor`, `nearestName` (async), `nearestNames`, `slugify`
- `@/lib/color/gradient` — `channelGradient`, `gamutGaps`, `paletteGradient`
- `@/lib/export/*` — `DEFAULT_EXPORT_CONFIG`, `buildGraph(swatches, config, title)`,
  `EMITTERS`, `EMITTERS_BY_ID`

## Stores

- `usePaletteStore()` — `swatches`, `colors`, `count`, `hexes`, `constraints`,
  `roll()`, `rollOne(id)`, `setColor(id, color, label?)`, `previewColor(id, color)`,
  `commit(label)`, `undo()`, `redo()`, `canUndo`, `canRedo`, `setColors(colors, label)`,
  `addSwatch(index?, color?)`, `removeSwatch(id)`, `setCount(n)`, `sortBy(key)`,
  `shuffle()`, `reverse()`, `toggleLock(id)`, `setAllLocks(bool)`, `invertLocks()`,
  `roles(opts)`, `shareUrl()`, `importFromText(text)`, `title`
- `useStudioStore()` — `format`, `activePanel`, `leftPanelOpen`, `rightPanelOpen`,
  `metric`, `previewTemplate`, `previewScheme`, `previewDensity`, `showContrastBadges`,
  `cvd`, `shortcutsOpen`, `commandOpen`, `openPanel(id)`
- `useThemeStore()` — `appearance`, `mode`, `presetId`, `current`, `availableThemes`,
  `setToken(key, value, target?)`, `resetToken`, `resetAll`, `selectPreset(id)`,
  `saveAsCustom(name)`, `deleteCustom(id)`, `applyTokenSet(values, target?)`,
  `resolved(mode)`, `toggleAppearance()`
- `useSessionStore()` — `user`, `meta`, `isAuthenticated`, `isAdmin`, `login`,
  `logout`, `bootstrap`, `canRegister`, `captchaSitekey`

## API client

`@/lib/api` — `api.get/post/patch/delete`, `ApiError` with `.status`,
`.isValidation`, `.needsCaptcha`, `.isRateLimited`, `.problem.errors` (field map).
The backend may be absent during frontend work; components must not crash when
a call fails — show an inline message instead.
