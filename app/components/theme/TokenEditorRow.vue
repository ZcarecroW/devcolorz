<script setup lang="ts">
/**
 * One token in the theme editor.
 *
 * The row is deliberately dumb. The page hands it the already-resolved value
 * for whichever mode is being edited plus the resolved value of the token it
 * is checked against, and gets a string back. Keeping the light/dark/both
 * question in the page means forty-four rows do not each have to answer it.
 */
import { computed, ref, useId, watch } from 'vue'
import { RotateCcw, TriangleAlert } from '@lucide/vue'
import InfoHint from '@/components/common/InfoHint.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatColor, parseColor } from '@/lib/color/convert'
import { apca, wcag, wcagLevel } from '@/lib/color/contrast'
import { isInGamut, mapToGamut, maxChroma } from '@/lib/color/gamut'
import { TOKEN_BY_KEY, type TokenDef } from '@/lib/theme/tokens'
import type { Oklch } from '@/lib/color/types'

const props = defineProps<{
  def: TokenDef
  /** Resolved value for the mode being edited. */
  value: string
  /** True when this mode carries an override for the token. */
  overridden: boolean
  /** Resolved value of `def.contrastAgainst`, or null when there is none. */
  against: string | null
}>()

const emit = defineEmits<{
  (e: 'update', value: string): void
  (e: 'reset'): void
}>()

/** Stands in for an unparseable value so no computed has to be nullable. */
const NEUTRAL: Oklch = { mode: 'oklch', l: 0.5, c: 0, h: 0 }

/* ------------------------------------------------------------------ *
 * Contrast
 * ------------------------------------------------------------------ */

/**
 * Tokens whose name ends in `foreground` carry text, and text is the only
 * thing WCAG and APCA agree matters. Borders, rings and fills are checked
 * against the same partner but held to the far lower non-text bar.
 */
const isForeground = computed(() => props.def.key.endsWith('foreground'))

const againstLabel = computed(() =>
  props.def.contrastAgainst
    ? (TOKEN_BY_KEY[props.def.contrastAgainst]?.label ?? props.def.contrastAgainst)
    : '',
)

const pair = computed(() => {
  if (!props.against) return null
  const fg = parseColor(props.value)
  const bg = parseColor(props.against)
  if (!fg || !bg) return null
  const ratio = wcag(fg, bg)
  return { lc: Math.abs(apca(fg, bg)), ratio, level: wcagLevel(ratio) }
})

/** Lc 60 is the floor at which text stops being readable at any size. */
const failing = computed(() => (pair.value ? isForeground.value && pair.value.lc < 60 : false))

const contrastText = computed(() => {
  const p = pair.value
  if (!p) return ''
  const bar = isForeground.value
    ? 'Text wants Lc 75 for body copy and Lc 60 as an absolute floor for headings; below that it stops being content and becomes decoration.'
    : 'Non-text parts — borders, focus rings, filled shapes — need roughly Lc 45 to be reliably visible, well under the bar for text.'
  return `Against ${againstLabel.value}: APCA Lc ${p.lc.toFixed(0)}, WCAG ${p.ratio.toFixed(2)}:1 (${p.level}). ${bar}`
})

/* ------------------------------------------------------------------ *
 * Color editing
 * ------------------------------------------------------------------ */

const color = computed<Oklch>(() => parseColor(props.value) ?? NEUTRAL)
const swatchCss = computed(() => formatColor(color.value, 'oklch'))
const hex = computed(() => formatColor(color.value, 'hex'))
const inGamut = computed(() => isInGamut(color.value))

/** The most chroma sRGB actually holds at this lightness and hue. */
const chromaCeiling = computed(() => maxChroma(color.value.l ?? 0, color.value.h ?? 0))

/**
 * Emit a whole colour rather than a channel, so the caller never has to know
 * which notation the value arrived in — the row always hands back `oklch()`.
 */
function emitColor(next: Partial<Pick<Oklch, 'l' | 'c' | 'h'>>) {
  const base = color.value
  const merged: Oklch = {
    mode: 'oklch',
    l: next.l ?? base.l ?? 0,
    c: next.c ?? base.c ?? 0,
    h: next.h ?? base.h ?? 0,
  }
  if (base.alpha !== undefined && base.alpha < 1) merged.alpha = base.alpha
  emit('update', formatColor(merged, 'oklch'))
}

/* The free-text field keeps its own draft so typing is never fought by the
   store echoing a reformatted value back mid-keystroke. */
const draft = ref(props.value)
const parseFailed = ref(false)

watch(
  () => props.value,
  (next) => {
    draft.value = next
    parseFailed.value = false
  },
)

function commitText() {
  const parsed = parseColor(draft.value)
  if (!parsed) {
    parseFailed.value = true
    return
  }
  parseFailed.value = false
  emit('update', formatColor(parsed, 'oklch'))
}

/* ------------------------------------------------------------------ *
 * Non-colour editing
 * ------------------------------------------------------------------ */

const FONT_STACKS = [
  'Inter, ui-sans-serif, system-ui, sans-serif',
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  '"Geist", ui-sans-serif, system-ui, sans-serif',
  'Outfit, ui-sans-serif, system-ui, sans-serif',
  'ui-serif, Georgia, Cambria, "Times New Roman", serif',
  '"Instrument Serif", ui-serif, Georgia, serif',
  'Merriweather, ui-serif, Georgia, serif',
  '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  'ui-monospace, SFMono-Regular, "Cascadia Code", Consolas, monospace',
  '"IBM Plex Mono", ui-monospace, Menlo, monospace',
]

const fontListId = `fonts-${useId()}`

/** `-?digits` plus an optional unit; the shadow inputs are deliberately unitless. */
const LENGTH_PATTERN = /^\s*(-?\d*\.?\d+)\s*([a-z%]*)\s*$/i

const length = computed(() => {
  const match = LENGTH_PATTERN.exec(props.value ?? '')
  return { amount: match ? Number(match[1]) : 0, unit: match ? match[2].toLowerCase() : '' }
})

/** Relative units want fine steps; the unitless pixel counts want whole ones. */
const lengthStep = computed(() => (length.value.unit === '' ? 1 : 0.025))

const UNITS = ['rem', 'em', 'px', '%']

function emitLength(amount: number, unit: string) {
  const rounded = Number(amount.toFixed(4))
  emit('update', `${rounded}${unit}`)
}

const numberValue = computed(() => {
  const parsed = Number.parseFloat(props.value ?? '')
  return Number.isFinite(parsed) ? parsed : 0
})
</script>

<template>
  <div class="flex items-center gap-2 py-1">
    <div class="flex min-w-0 flex-1 items-center gap-1.5">
      <span
        class="truncate text-xs"
        :class="props.overridden ? 'font-medium text-foreground' : 'text-muted-foreground'"
      >
        {{ props.def.label }}
      </span>
      <InfoHint :title="props.def.label" wide>
        <p class="text-xs leading-relaxed text-muted-foreground">{{ props.def.hint }}</p>
        <p v-if="pair" class="mt-2 text-xs leading-relaxed text-muted-foreground">
          {{ contrastText }}
        </p>
      </InfoHint>
    </div>

    <!-- Live contrast against the token this one sits on. -->
    <span
      v-if="pair"
      class="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[10px] tabular-nums"
      :class="failing ? 'bg-destructive/15 text-destructive' : 'bg-muted text-muted-foreground'"
      :title="contrastText"
    >
      <TriangleAlert v-if="failing" class="size-3" aria-hidden="true" />
      Lc {{ pair.lc.toFixed(0) }} · {{ pair.level }}
    </span>

    <!-- Color -->
    <Popover v-if="props.def.kind === 'color'">
      <PopoverTrigger as-child>
        <button
          type="button"
          class="flex shrink-0 items-center gap-1.5 rounded-md border bg-card px-1.5 py-1 transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          :title="props.value"
          :aria-label="`Edit ${props.def.label}, currently ${props.value}`"
        >
          <span
            class="size-5 rounded-sm border border-border/60"
            :style="{ background: swatchCss }"
          />
          <span class="font-mono text-[10px] tabular-nums text-muted-foreground">{{ hex }}</span>
        </button>
      </PopoverTrigger>

      <PopoverContent class="w-80" align="end">
        <div class="flex flex-col gap-3">
          <div class="flex items-center gap-2">
            <span
              class="size-9 shrink-0 rounded-md border border-border/60"
              :style="{ background: swatchCss }"
            />
            <div class="min-w-0">
              <p class="truncate text-xs font-medium">{{ props.def.label }}</p>
              <p class="truncate font-mono text-[10px] text-muted-foreground">--{{ props.def.key }}</p>
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <div class="flex items-center gap-2">
              <label class="w-4 shrink-0 font-mono text-[10px] text-muted-foreground" :for="`${fontListId}-l`">L</label>
              <input
                :id="`${fontListId}-l`"
                type="range"
                class="h-4 flex-1 accent-primary"
                min="0"
                max="1"
                step="0.001"
                :value="color.l ?? 0"
                @input="emitColor({ l: Number(($event.target as HTMLInputElement).value) })"
              />
              <span class="w-12 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
                {{ ((color.l ?? 0) * 100).toFixed(1) }}%
              </span>
            </div>

            <div class="flex items-center gap-2">
              <label class="w-4 shrink-0 font-mono text-[10px] text-muted-foreground" :for="`${fontListId}-c`">C</label>
              <input
                :id="`${fontListId}-c`"
                type="range"
                class="h-4 flex-1 accent-primary"
                min="0"
                max="0.4"
                step="0.001"
                :value="color.c ?? 0"
                @input="emitColor({ c: Number(($event.target as HTMLInputElement).value) })"
              />
              <span class="w-12 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
                {{ (color.c ?? 0).toFixed(3) }}
              </span>
            </div>

            <div class="flex items-center gap-2">
              <label class="w-4 shrink-0 font-mono text-[10px] text-muted-foreground" :for="`${fontListId}-h`">H</label>
              <input
                :id="`${fontListId}-h`"
                type="range"
                class="h-4 flex-1 accent-primary"
                min="0"
                max="360"
                step="0.1"
                :value="color.h ?? 0"
                @input="emitColor({ h: Number(($event.target as HTMLInputElement).value) })"
              />
              <span class="w-12 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
                {{ (color.h ?? 0).toFixed(1) }}°
              </span>
            </div>
          </div>

          <div class="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
            <span class="font-mono tabular-nums">sRGB holds {{ chromaCeiling.toFixed(3) }} C here</span>
            <Button
              v-if="!inGamut"
              variant="outline"
              size="xs"
              title="Pull the color back inside sRGB, keeping its hue"
              @click="emit('update', formatColor(mapToGamut(color, 'css4'), 'oklch'))"
            >
              Fit to sRGB
            </Button>
          </div>

          <div class="flex flex-col gap-1">
            <div class="flex items-center gap-1.5">
              <span class="text-[10px] text-muted-foreground">Any notation</span>
              <InfoHint
                title="Typing a value"
                wide
                text="Hex, rgb(), hsl(), lab(), oklch() — anything CSS understands is parsed and stored as oklch(), because that is the notation the sliders and every contrast check work in. Converting on the way in rather than keeping the original text means one value, one meaning, and no drift between what you typed and what the app computes with."
              />
            </div>
            <Input
              :model-value="draft"
              class="h-8 font-mono text-xs"
              spellcheck="false"
              :aria-invalid="parseFailed || undefined"
              :aria-label="`${props.def.label} value`"
              @update:model-value="draft = String($event)"
              @change="commitText"
              @keydown.enter.prevent="commitText"
            />
            <p v-if="parseFailed" class="text-[10px] text-destructive">
              Not a color CSS can read. Try a hex value or oklch().
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>

    <!-- Font stack -->
    <template v-else-if="props.def.kind === 'font'">
      <Input
        :model-value="props.value"
        :list="fontListId"
        class="h-8 w-56 font-mono text-[11px]"
        spellcheck="false"
        :aria-label="props.def.label"
        @update:model-value="emit('update', String($event))"
      />
      <datalist :id="fontListId">
        <option v-for="stack in FONT_STACKS" :key="stack" :value="stack" />
      </datalist>
    </template>

    <!-- Length -->
    <div v-else-if="props.def.kind === 'length'" class="flex shrink-0 items-center gap-1">
      <Input
        type="number"
        :model-value="length.amount"
        :step="lengthStep"
        class="h-8 w-20 text-right font-mono text-[11px] tabular-nums"
        :aria-label="props.def.label"
        @update:model-value="emitLength(Number($event), length.unit)"
      />
      <!--
        The shadow inputs are stored unitless because the shadow ramp appends
        `px` itself; offering a unit picker there would produce `3pxpx`.
      -->
      <select
        v-if="length.unit"
        class="h-8 rounded-md border border-input bg-transparent px-1 text-[11px] text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        :value="length.unit"
        :aria-label="`${props.def.label} unit`"
        @change="emitLength(length.amount, ($event.target as HTMLSelectElement).value)"
      >
        <option v-for="unit in UNITS" :key="unit" :value="unit">{{ unit }}</option>
      </select>
      <span v-else class="w-6 text-[11px] text-muted-foreground">px</span>
    </div>

    <!-- Number -->
    <div v-else class="flex w-32 shrink-0 items-center gap-2">
      <input
        type="range"
        class="h-4 flex-1 accent-primary"
        min="0"
        max="1"
        step="0.01"
        :value="numberValue"
        :aria-label="props.def.label"
        @input="emit('update', ($event.target as HTMLInputElement).value)"
      />
      <span class="w-8 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
        {{ numberValue.toFixed(2) }}
      </span>
    </div>

    <Button
      v-if="props.overridden"
      variant="ghost"
      size="icon-xs"
      :aria-label="`Reset ${props.def.label} to the preset value`"
      title="Reset to the preset value"
      @click="emit('reset')"
    >
      <RotateCcw />
    </Button>
    <span v-else class="size-6 shrink-0" aria-hidden="true" />
  </div>
</template>
