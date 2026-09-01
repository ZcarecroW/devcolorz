<script setup lang="ts">
/**
 * The shadcn / tweakcn theme editor.
 *
 * The decision that shapes everything here: this page edits the token set the
 * app itself is painted with, so there is no separate preview canvas that can
 * quietly disagree with reality. Editing a token repaints the surrounding
 * chrome in the same frame, and the playground on the right is there to show
 * the components you would otherwise have to go looking for.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { Copy, Moon, RotateCcw, Save, Search, Sun, SunMoon, Trash2, Wand2 } from '@lucide/vue'
import { toast } from 'vue-sonner'
import InfoHint from '@/components/common/InfoHint.vue'
import ThemePreview from '@/components/theme/ThemePreview.vue'
import TokenEditorRow from '@/components/theme/TokenEditorRow.vue'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatColor, parseColor } from '@/lib/color/convert'
import { apca, bestBlackOrWhite, makeReadable } from '@/lib/color/contrast'
import { toDark } from '@/lib/color/invert'
import {
  ALL_TOKENS,
  COLOR_TOKENS,
  GROUP_LABELS,
  RADIUS_STEPS,
  TRACKING_STEPS,
  deriveShadows,
  type ThemeDefinition,
  type TokenGroup,
  type TokenValues,
} from '@/lib/theme/tokens'
import { usePaletteStore } from '@/stores/palette'
import { useThemeStore, type Mode } from '@/stores/theme'
import type { ColorInput, Oklch } from '@/lib/color/types'

const theme = useThemeStore()
const palette = usePaletteStore()

/* ------------------------------------------------------------------ *
 * Which mode is being edited
 * ------------------------------------------------------------------ */

type EditTarget = Mode | 'both'

const MODE_OPTIONS = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'both', label: 'Both', icon: SunMoon },
] as const

const editTarget = ref<EditTarget>(theme.mode)

/**
 * Picking a single mode also switches the app into it. Editing dark tokens
 * while looking at the light theme is the one way this page could lie to you.
 */
function setTarget(next: EditTarget) {
  editTarget.value = next
  if (next !== 'both') theme.setAppearance(next)
}

/**
 * And the other way round: the header's appearance menu switches the app
 * without asking this page. The pills and the rows used to keep saying
 * "Light" after it had turned everything on screen dark, so an edit went into
 * the mode that was not showing and changed nothing anyone could see.
 */
watch(
  () => theme.mode,
  (mode) => {
    if (editTarget.value !== 'both') editTarget.value = mode
  },
)

/** The mode whose values the rows display; "both" shows whatever is on screen. */
const previewMode = computed<Mode>(() =>
  editTarget.value === 'both' ? theme.mode : editTarget.value,
)

const values = computed<TokenValues>(() => theme.resolved(previewMode.value))

function isOverridden(key: string): boolean {
  if (editTarget.value === 'both') {
    return key in theme.overrides.light || key in theme.overrides.dark
  }
  return key in theme.overrides[editTarget.value]
}

const overriddenCount = computed(
  () =>
    new Set([
      ...Object.keys(theme.overrides.light),
      ...Object.keys(theme.overrides.dark),
    ]).size,
)

function updateToken(key: string, value: string) {
  theme.setToken(key, value, editTarget.value)
}

function resetToken(key: string) {
  theme.resetToken(key, editTarget.value)
}

/** The partner value a token's contrast is measured against, if it has one. */
function againstFor(key: string | null | undefined): string | null {
  return key ? (values.value[key] ?? null) : null
}

/* ------------------------------------------------------------------ *
 * Presets
 * ------------------------------------------------------------------ */

const customIds = computed(() => new Set(theme.customThemes.map((custom) => custom.id)))

/** Four colours are enough to recognise a theme: page, brand, hover, ink. */
function chipsFor(definition: ThemeDefinition): string[] {
  const set = definition[previewMode.value]
  return [set.background, set.primary, set.accent, set.foreground].map(
    (value) => value ?? 'transparent',
  )
}

/* ------------------------------------------------------------------ *
 * Token list
 * ------------------------------------------------------------------ */

const filter = ref('')
const openGroups = ref<string[]>(['base', 'primary', 'border'])

const groups = computed(() => {
  const query = filter.value.trim().toLowerCase()
  return (Object.keys(GROUP_LABELS) as TokenGroup[])
    .map((group) => ({
      id: group as string,
      label: GROUP_LABELS[group],
      tokens: ALL_TOKENS.filter(
        (token) =>
          token.group === group &&
          (!query ||
            token.label.toLowerCase().includes(query) ||
            token.key.includes(query)),
      ),
    }))
    .filter((group) => group.tokens.length > 0)
})

// A search whose matches stay folded away is no search at all.
watch(filter, (query) => {
  if (query.trim()) openGroups.value = groups.value.map((group) => group.id)
})

function onAccordionChange(value: string | string[] | undefined) {
  openGroups.value = Array.isArray(value) ? value : value ? [value] : []
}

/* ------------------------------------------------------------------ *
 * Generate from the palette
 * ------------------------------------------------------------------ */

const fmt = (color: ColorInput) => formatColor(color, 'oklch')

/**
 * Map the palette's solved role set onto the token contract.
 *
 * This is the bridge between the two halves of the app: the generator decides
 * what a palette *means* — which colour is the background, which carries text,
 * which is the brand — and this turns that into the 44 properties a shadcn app
 * actually consumes.
 */
function generateFromPalette() {
  if (palette.count === 0) return
  const roles = palette.roles({ scheme: 'light' })

  /** Text that survives on a given fill, starting from the palette's own ink. */
  const textOn = (background: Oklch) =>
    fmt(
      makeReadable(roles.text.color, background, { target: 75, metric: 'apca' }) ??
        bestBlackOrWhite(background),
    )
  const chart = (index: number) => fmt((roles.chart[index] ?? roles.primary).color)

  const light: TokenValues = {
    background: fmt(roles.background.color),
    foreground: fmt(roles.text.color),
    card: fmt(roles.surface.color),
    'card-foreground': fmt(roles.text.color),
    // `surface`, not `overlay`. The overlay role is the modal scrim — pure
    // black at 45% alpha — so writing it here made every dropdown, tooltip and
    // command palette a translucent black sheet with the palette's near-black
    // ink on top of it. A popover is a raised card, and that is what `card`
    // uses too.
    popover: fmt(roles.surface.color),
    'popover-foreground': fmt(roles.text.color),
    primary: fmt(roles.primary.color),
    'primary-foreground': fmt(roles.textOnPrimary.color),
    secondary: fmt(roles.secondary.color),
    'secondary-foreground': textOn(roles.secondary.color),
    muted: fmt(roles.surfaceAlt.color),
    'muted-foreground': fmt(roles.textMuted.color),
    accent: fmt(roles.accent.color),
    'accent-foreground': fmt(roles.textOnAccent.color),
    destructive: fmt(roles.danger.color),
    'destructive-foreground': textOn(roles.danger.color),
    border: fmt(roles.border.color),
    input: fmt(roles.borderStrong.color),
    ring: fmt(roles.primary.color),
    'chart-1': chart(0),
    'chart-2': chart(1),
    'chart-3': chart(2),
    'chart-4': chart(3),
    'chart-5': chart(4),
    sidebar: fmt(roles.surface.color),
    'sidebar-foreground': fmt(roles.text.color),
    'sidebar-primary': fmt(roles.primary.color),
    'sidebar-primary-foreground': fmt(roles.textOnPrimary.color),
    'sidebar-accent': fmt(roles.accent.color),
    'sidebar-accent-foreground': fmt(roles.textOnAccent.color),
    'sidebar-border': fmt(roles.border.color),
    'sidebar-ring': fmt(roles.primary.color),
    'shadow-color': fmt(roles.text.color),
  }

  /**
   * Repair label/fill pairs that do not read.
   *
   * `toDark` moves each colour on its own, so a label and its fill can drift
   * together in the dark set — but the light set needs the same pass: a
   * palette whose ink happens to sit close to one of its own surfaces ships an
   * unreadable pair straight out of the generator. Only the pairs that
   * actually broke are touched, rather than re-deriving every foreground and
   * losing the palette's hues.
   */
  const repair = (values: TokenValues) => {
    for (const token of COLOR_TOKENS) {
      if (!token.contrastAgainst || !token.key.endsWith('foreground')) continue
      const foreground = parseColor(values[token.key] ?? '')
      const background = parseColor(values[token.contrastAgainst] ?? '')
      if (!foreground || !background || Math.abs(apca(foreground, background)) >= 60) continue
      values[token.key] = fmt(
        makeReadable(foreground, background, { target: 75, metric: 'apca' }) ??
          bestBlackOrWhite(background),
      )
    }
  }
  // Light is repaired before the dark set is derived from it, so a pair that
  // was already wrong is not carried across and re-solved twice.
  repair(light)

  const dark: TokenValues = {}
  for (const token of COLOR_TOKENS) {
    const parsed = parseColor(light[token.key] ?? '')
    if (parsed) dark[token.key] = fmt(toDark(parsed))
  }
  repair(dark)

  // Shadows come from the light source, not the theme. Inverting the shadow
  // colour in dark mode produces a glow, which is not what anyone wants.
  dark['shadow-color'] = 'oklch(0 0 0)'

  theme.applyTokenSet(light, 'light')
  theme.applyTokenSet(dark, 'dark')
  toast.success('Theme generated from the palette', {
    description: 'Light and dark are both filled in. Walk the contrast badges before you ship it.',
  })
}

/* ------------------------------------------------------------------ *
 * Export
 * ------------------------------------------------------------------ */

function declarations(set: TokenValues): string {
  const lines = ALL_TOKENS.filter((token) => set[token.key] !== undefined).map(
    (token) => `  --${token.key}: ${set[token.key]};`,
  )
  for (const [size, value] of Object.entries(deriveShadows(set))) {
    lines.push(`  --shadow${size === 'DEFAULT' ? '' : `-${size}`}: ${value};`)
  }
  return lines.join('\n')
}

/**
 * The `@theme inline` block maps our properties onto Tailwind's theme keys.
 * The derived ramps are emitted as `calc()` against the base token rather than
 * as frozen numbers, so changing `--radius` in a browser devtools session
 * still re-shapes every corner.
 */
function themeInline(set: TokenValues): string {
  const lines = ALL_TOKENS.filter((token) => token.themeAlias).map(
    (token) => `  ${token.themeAlias}: var(--${token.key});`,
  )
  for (const [name, multiplier] of RADIUS_STEPS) {
    lines.push(`  --radius-${name}: calc(var(--radius) * ${multiplier});`)
  }
  for (const [name, offset] of TRACKING_STEPS) {
    lines.push(
      offset === 0
        ? `  --tracking-${name}: var(--letter-spacing);`
        : `  --tracking-${name}: calc(var(--letter-spacing) ${offset < 0 ? '-' : '+'} ${Math.abs(offset)}em);`,
    )
  }
  for (const size of Object.keys(deriveShadows(set))) {
    const suffix = size === 'DEFAULT' ? '' : `-${size}`
    lines.push(`  --shadow${suffix}: var(--shadow${suffix});`)
  }
  lines.push('  --spacing: var(--spacing);')
  return lines.join('\n')
}

function buildStylesheet(): string {
  const light = theme.resolved('light')
  const dark = theme.resolved('dark')
  const name = `${theme.basePreset.name}${theme.isCustomised ? ' (edited)' : ''}`
  return [
    `/* ${name} — exported from DevColorz for Tailwind v4 + shadcn.`,
    ` * Replace the token blocks in your globals.css with everything below. */`,
    '',
    ':root {',
    declarations(light),
    '}',
    '',
    '.dark {',
    declarations(dark),
    '}',
    '',
    '@theme inline {',
    themeInline(light),
    '}',
    '',
    'body {',
    '  letter-spacing: var(--tracking-normal);',
    '}',
    '',
  ].join('\n')
}

async function copyStylesheet() {
  try {
    await navigator.clipboard.writeText(buildStylesheet())
    toast.success('globals.css copied', {
      description: 'Both modes, the derived ramps and the @theme inline block.',
    })
  } catch {
    toast.error('Could not reach the clipboard', {
      description: 'The browser blocks clipboard writes outside a user gesture or a secure origin.',
    })
  }
}

/* ------------------------------------------------------------------ *
 * Saving
 * ------------------------------------------------------------------ */

const saveOpen = ref(false)
const customName = ref('')

function saveCustom() {
  const name = customName.value.trim() || `${theme.basePreset.name} variant`
  const saved = theme.saveAsCustom(name)
  saveOpen.value = false
  customName.value = ''
  toast.success(`Saved "${saved.name}"`, {
    description: 'It is now a preset, and your overrides have been folded into it.',
  })
}

onMounted(() => {
  // The generator seeds the palette on its own page; arriving here first
  // leaves it empty, and "generate from the palette" would have no input.
  if (palette.count === 0) palette.init()
})
</script>

<template>
  <div class="mx-auto flex w-full max-w-[112rem] flex-col gap-6 px-4 py-6 lg:px-6">
    <header class="flex max-w-3xl flex-col gap-2">
      <h1 class="text-2xl font-semibold tracking-tight">Theme editor</h1>
      <p class="text-sm leading-relaxed text-muted-foreground">
        These are the forty-four custom properties a shadcn theme is made of, and DevColorz is
        painted with exactly the same set. Nothing on this page is a mock-up: change
        <code class="rounded bg-muted px-1 font-mono text-xs">--primary</code> and the button you
        clicked to change it repaints, along with the header, this paragraph and the playground on
        the right. If the preview looks wrong, the app is wrong too.
      </p>
    </header>

    <div class="grid items-start gap-6 xl:grid-cols-[minmax(0,32rem)_minmax(0,1fr)]">
      <!-- ------------------------------ controls ------------------------------ -->
      <div class="flex min-w-0 flex-col gap-4">
        <!-- Presets -->
        <section class="flex flex-col gap-2.5 rounded-xl border bg-card/40 p-3">
          <div class="flex items-center gap-2">
            <h2 class="flex items-center gap-1.5 text-xs font-medium">
              Preset
              <InfoHint
                title="Presets"
                wide
                text="A preset is a complete pair of token sets, one for light and one for dark. Selecting one clears every override you have made, because a half-applied preset is the fastest way to end up with a theme nobody can explain. Save your work as a custom theme first if you want to keep it."
              />
            </h2>
            <span class="flex-1" />
            <Button
              v-if="overriddenCount > 0"
              variant="ghost"
              size="xs"
              title="Discard every override and return to the preset values"
              @click="theme.resetAll()"
            >
              <RotateCcw />
              Reset {{ overriddenCount }} override{{ overriddenCount === 1 ? '' : 's' }}
            </Button>
          </div>

          <div class="grid gap-1.5 sm:grid-cols-2">
            <div v-for="preset in theme.availableThemes" :key="preset.id" class="relative">
              <button
                type="button"
                class="flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                :class="preset.id === theme.presetId ? 'border-primary bg-accent/60' : 'bg-card'"
                :aria-pressed="preset.id === theme.presetId"
                @click="theme.selectPreset(preset.id)"
              >
                <span class="flex shrink-0 overflow-hidden rounded-sm border border-border/60">
                  <span
                    v-for="(chip, index) in chipsFor(preset)"
                    :key="index"
                    class="size-4"
                    :style="{ background: chip }"
                  />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-xs font-medium">{{ preset.name }}</span>
                  <span v-if="preset.author" class="block truncate text-[10px] text-muted-foreground">
                    {{ preset.author }}
                  </span>
                </span>
              </button>
              <Button
                v-if="customIds.has(preset.id)"
                variant="ghost"
                size="icon-xs"
                class="absolute top-1 right-1"
                :aria-label="`Delete ${preset.name}`"
                title="Delete this custom theme"
                @click="theme.deleteCustom(preset.id)"
              >
                <Trash2 />
              </Button>
            </div>
          </div>
        </section>

        <!-- Mode + actions -->
        <section class="flex flex-col gap-2.5 rounded-xl border bg-card/40 p-3">
          <div class="flex items-center gap-2">
            <h2 class="flex items-center gap-1.5 text-xs font-medium">
              Editing
              <InfoHint
                title="Which mode you are editing"
                wide
                text="Light and dark are two independent sets of values, and an edit lands only in the one selected here. Choose Both for the tokens that have no business differing between modes — radius, spacing, the font stacks — and keep it off for colors, where writing one value into both modes is how you end up with white text on a white background. Picking Light or Dark also switches the app into it, so you are always looking at what you are editing."
              />
            </h2>
            <span class="flex-1" />
            <span class="font-mono text-[10px] text-muted-foreground">
              {{ overriddenCount }} of {{ ALL_TOKENS.length }} overridden
            </span>
          </div>

          <div
            class="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1"
            role="group"
            aria-label="Mode being edited"
          >
            <button
              v-for="option in MODE_OPTIONS"
              :key="option.id"
              type="button"
              class="flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              :class="
                editTarget === option.id
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              "
              :aria-pressed="editTarget === option.id"
              @click="setTarget(option.id)"
            >
              <component :is="option.icon" class="size-3.5" aria-hidden="true" />
              {{ option.label }}
            </button>
          </div>

          <div class="flex flex-wrap gap-2">
            <Button
              class="flex-1"
              :disabled="palette.count === 0"
              title="Map the current palette's solved roles onto the token set"
              @click="generateFromPalette()"
            >
              <Wand2 />
              Generate from the current palette
            </Button>
            <InfoHint
              class="size-9"
              title="Generating from a palette"
              wide
              text="The generator already solves your palette into roles — background, text, primary, the chart series — and this drops that answer straight into the token set. The dark mode is derived from the light one with the perceptual inversion curve, then any foreground that lost its contrast in the process is repaired against its own fill. It overwrites every color token in both modes; the type and shape tokens are left alone."
            />
          </div>

          <div class="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" class="flex-1" @click="saveOpen = true">
              <Save />
              Save as custom theme
            </Button>
            <Button variant="outline" size="sm" class="flex-1" @click="copyStylesheet()">
              <Copy />
              Copy globals.css
            </Button>
            <InfoHint
              title="What gets copied"
              wide
              text="The full stylesheet: a :root block and a .dark block carrying all forty-four tokens plus the eight derived shadows, and an @theme inline block wiring them to Tailwind's color, font, radius, tracking and shadow keys. The radius and tracking ramps are emitted as calc() against their base token, so one value still re-shapes the whole set after you paste it."
            />
          </div>
        </section>

        <!-- Tokens -->
        <section class="flex flex-col gap-2 rounded-xl border bg-card/40 p-3">
          <div class="flex items-center gap-2">
            <Label for="token-filter" class="sr-only">Filter tokens</Label>
            <div class="relative flex-1">
              <Search
                class="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="token-filter"
                :model-value="filter"
                class="h-8 pl-7 text-xs"
                placeholder="Filter tokens"
                spellcheck="false"
                @update:model-value="filter = String($event)"
              />
            </div>
            <span class="shrink-0 text-[10px] text-muted-foreground">
              showing <span class="font-mono">{{ previewMode }}</span></span
            >
          </div>

          <Accordion
            type="multiple"
            :model-value="openGroups"
            class="w-full"
            @update:model-value="onAccordionChange"
          >
            <AccordionItem v-for="group in groups" :key="group.id" :value="group.id">
              <AccordionTrigger class="py-2.5 text-xs">
                <span class="flex items-center gap-2">
                  {{ group.label }}
                  <span class="font-mono text-[10px] text-muted-foreground">
                    {{ group.tokens.length }}
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent class="pt-0 pb-2">
                <TokenEditorRow
                  v-for="token in group.tokens"
                  :key="token.key"
                  :def="token"
                  :value="values[token.key] ?? ''"
                  :overridden="isOverridden(token.key)"
                  :against="againstFor(token.contrastAgainst)"
                  @update="updateToken(token.key, $event)"
                  @reset="resetToken(token.key)"
                />
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <p v-if="groups.length === 0" class="py-4 text-center text-xs text-muted-foreground">
            No token matches "{{ filter }}".
          </p>
        </section>
      </div>

      <!-- ------------------------------ preview ------------------------------ -->
      <div class="min-w-0 xl:sticky xl:top-[4.5rem] xl:max-h-[calc(100dvh-6rem)] xl:overflow-y-auto">
        <ThemePreview />
      </div>
    </div>

    <Dialog v-model:open="saveOpen">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save as a custom theme</DialogTitle>
          <DialogDescription>
            Freezes the current light and dark values as a preset of their own. Your overrides are
            folded into it, so the override list starts empty again.
          </DialogDescription>
        </DialogHeader>
        <div class="flex flex-col gap-1.5">
          <Label for="custom-theme-name" class="text-xs">Name</Label>
          <Input
            id="custom-theme-name"
            :model-value="customName"
            :placeholder="`${theme.basePreset.name} variant`"
            @update:model-value="customName = String($event)"
            @keydown.enter.prevent="saveCustom()"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" @click="saveOpen = false">Cancel</Button>
          <Button @click="saveCustom()">Save theme</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
