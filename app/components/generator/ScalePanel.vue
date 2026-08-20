<script setup lang="ts">
/**
 * Tonal scales — one palette color in, a whole design-system ramp out.
 *
 * The decision worth knowing: every value a slider can drag lives in a single
 * object that is replaced wholesale and read back through `refDebounced`, so
 * `generateScale` sees a settled value 80ms after the drag rather than on every
 * pointer event. Contrast mode runs a lightness search per step, so an
 * undebounced drag would solve the ramp hundreds of times a second.
 */
import { computed, ref } from 'vue'
import { Check, Copy, Plus, ReplaceAll } from '@lucide/vue'
import { refDebounced } from '@vueuse/core'
import { toast } from 'vue-sonner'
import InfoHint from '@/components/common/InfoHint.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { METRIC_HINTS, apcaVerdict, wcagLevel, type ContrastMetric } from '@/lib/color/contrast'
import { formatColor } from '@/lib/color/convert'
import { describeColor } from '@/lib/color/name'
import {
  DEFAULT_SCALE_OPTIONS,
  SCALE_MODE_HINTS,
  SCALE_PRESET_HINTS,
  generateNeutralScale,
  generateScale,
  type ScaleMode,
  type ScaleOptions,
  type ScalePreset,
  type ScaleStop,
} from '@/lib/color/scale'
import type { Oklch } from '@/lib/color/types'
import { usePaletteStore } from '@/stores/palette'
import { useStudioStore } from '@/stores/studio'

const palette = usePaletteStore()
const studio = useStudioStore()

/* The engine ships hints for these but no display labels, so they live here. */
const PRESET_LABELS: Record<ScalePreset, string> = {
  tailwind: 'Tailwind — 50 to 950',
  radix: 'Radix — 1 to 12',
  material: 'Material 3 — 0 to 100',
  custom: 'Custom',
}

const MODE_LABELS: Record<ScaleMode, string> = {
  lightness: 'Even lightness',
  contrast: 'Solved for contrast',
  hybrid: 'Hybrid',
}

const METRIC_LABELS: Record<ContrastMetric, string> = {
  wcag: 'WCAG 2.x ratio',
  apca: 'APCA (Lc)',
}

/* ---------------- seed ---------------- */

const seedIndex = ref(0)

/** Clamped, because the palette can shrink underneath the selection. */
const activeSeed = computed(() => Math.min(seedIndex.value, Math.max(0, palette.count - 1)))

const seed = computed<Oklch | null>(() => {
  const swatch = palette.swatches[activeSeed.value]
  return swatch ? swatch.color : null
})

/* ---------------- discrete controls ---------------- */

const preset = ref<ScalePreset>(DEFAULT_SCALE_OPTIONS.preset)
// Hybrid rather than the engine default: it keeps the even-lightness look and
// only moves the steps that miss their target, which is what UI work wants.
const mode = ref<ScaleMode>('hybrid')
const customSteps = ref(DEFAULT_SCALE_OPTIONS.steps)
const pinSeed = ref(DEFAULT_SCALE_OPTIONS.pinSeed)

function setSteps(raw: string) {
  const parsed = Number.parseInt(raw, 10)
  customSteps.value = Number.isFinite(parsed)
    ? Math.max(2, Math.min(24, parsed))
    : DEFAULT_SCALE_OPTIONS.steps
}

/* ---------------- continuous controls ---------------- */

interface RampShape {
  lightEnd: number
  darkEnd: number
  chromaFalloff: number
  curve: number
  tint: number
}

const shape = ref<RampShape>({
  lightEnd: DEFAULT_SCALE_OPTIONS.lightEnd,
  darkEnd: DEFAULT_SCALE_OPTIONS.darkEnd,
  chromaFalloff: DEFAULT_SCALE_OPTIONS.chromaFalloff,
  curve: DEFAULT_SCALE_OPTIONS.curve,
  // The engine's own default tint: enough to read as intentional, not as color.
  tint: 0.012,
})

/**
 * The whole object is replaced on every input so the debounce actually sees a
 * new value — mutating a key in place would not retrigger the watcher.
 */
const settled = refDebounced(shape, 80)

function shapeModel(key: keyof RampShape) {
  return computed({
    get: () => shape.value[key],
    set: (value: number) => {
      shape.value = { ...shape.value, [key]: value }
    },
  })
}

const lightEnd = shapeModel('lightEnd')
const darkEnd = shapeModel('darkEnd')
const chromaFalloff = shapeModel('chromaFalloff')
const curve = shapeModel('curve')
const tint = shapeModel('tint')

/* ---------------- the ramps ---------------- */

const options = computed<Partial<ScaleOptions>>(() => ({
  preset: preset.value,
  mode: mode.value,
  steps: customSteps.value,
  lightEnd: settled.value.lightEnd,
  darkEnd: settled.value.darkEnd,
  chromaFalloff: settled.value.chromaFalloff,
  curve: settled.value.curve,
  metric: studio.metric,
  pinSeed: pinSeed.value,
  // Scales obey the generator's gamut policy, so a palette and the ramps built
  // from it never disagree about what to do with out-of-gamut colors.
  gamut: palette.constraints.gamut,
}))

const stops = computed<ScaleStop[]>(() =>
  seed.value ? generateScale(seed.value, options.value) : [],
)

const neutral = computed<ScaleStop[]>(() =>
  seed.value ? generateNeutralScale(seed.value, settled.value.tint, options.value) : [],
)

/* ---------------- readouts ---------------- */

function swatchCss(color: Oklch): string {
  return formatColor(color, 'oklch')
}

function contrastLabel(value: number): string {
  return studio.metric === 'apca' ? `Lc ${Math.round(value)}` : `${value.toFixed(2)}:1`
}

/** The level the number buys you — shown on hover, so the row stays readable. */
function levelLabel(value: number): string {
  return studio.metric === 'apca' ? apcaVerdict(value).use : `WCAG ${wcagLevel(value)}`
}

function purposeOf(stop: ScaleStop): string {
  return stop.purpose || describeColor(stop.color)
}

/* ---------------- actions ---------------- */

const copied = ref('')

function isCopied(group: string, key: string): boolean {
  return copied.value === `${group}:${key}`
}

async function copyStop(group: string, stop: ScaleStop) {
  const text = formatColor(stop.color, studio.format)
  const token = `${group}:${stop.key}`
  try {
    await navigator.clipboard.writeText(text)
    copied.value = token
    setTimeout(() => {
      if (copied.value === token) copied.value = ''
    }, 1200)
  } catch {
    toast.error('Could not reach the clipboard', {
      description: `Your browser blocked it. The value is ${text}.`,
    })
  }
}

function replacePalette() {
  if (!stops.value.length) return
  palette.setColors(
    stops.value.map((s) => s.color),
    'Apply scale',
  )
}
</script>

<template>
  <div class="flex min-h-0 flex-col gap-3">
    <!-- Seed -->
    <div class="flex items-start gap-2 rounded-lg border bg-card/40 p-2.5">
      <Label class="flex w-20 shrink-0 items-center gap-1 pt-1 text-xs">
        Seed
        <InfoHint
          title="Seed color"
          wide
          text="Every step inherits this color's hue and its chroma envelope. Pick the color the scale is for — the brand color, not a background — because the ramp is only as good as the hue it is built on. Where the seed lands in the ramp follows its lightness, so a pale seed produces a scale that is dark almost everywhere."
        />
      </Label>
      <div class="flex flex-1 flex-wrap gap-1">
        <button
          v-for="(swatch, index) in palette.swatches"
          :key="swatch.id"
          type="button"
          class="size-6 rounded-md ring-offset-2 ring-offset-card transition"
          :class="activeSeed === index ? 'ring-2 ring-ring' : 'hover:scale-110'"
          :style="{ background: swatchCss(swatch.color) }"
          :aria-label="`Build the scale from color ${index + 1}`"
          :aria-pressed="activeSeed === index"
          @click="seedIndex = index"
        />
      </div>
    </div>

    <!-- Shape -->
    <div class="grid gap-2.5 rounded-lg border bg-card/40 p-2.5">
      <div class="flex items-center gap-2">
        <Label class="flex w-24 shrink-0 items-center gap-1 text-xs">
          Preset
          <InfoHint title="Naming and step count" wide :text="SCALE_PRESET_HINTS[preset]" />
        </Label>
        <Select
          :model-value="preset"
          @update:model-value="preset = $event as ScalePreset"
        >
          <SelectTrigger size="sm" class="flex-1" aria-label="Scale preset">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="(hint, id) in SCALE_PRESET_HINTS"
              :key="id"
              :value="id"
              class="items-start"
            >
              <span class="flex flex-col gap-0.5 py-0.5">
                <span class="text-xs">{{ PRESET_LABELS[id] }}</span>
                <span class="max-w-[20rem] text-[11px] leading-snug text-wrap text-muted-foreground">
                  {{ hint }}
                </span>
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div v-if="preset === 'custom'" class="flex items-center gap-2">
        <Label class="flex w-24 shrink-0 items-center gap-1 text-xs">
          Steps
          <InfoHint
            title="How many steps"
            wide
            text="Two to twenty-four, named 100, 200, 300 and so on. Below about nine you run out of distinct stops for background, border, solid and text roles and start reusing one step for two jobs. Above about fourteen neighbouring steps stop being tellable apart, which makes the extra ones decorative rather than useful."
          />
        </Label>
        <input
          :value="customSteps"
          type="number"
          min="2"
          max="24"
          step="1"
          inputmode="numeric"
          class="w-20 rounded-md border bg-background px-2 py-1 font-mono text-[11px] tabular-nums"
          aria-label="Number of steps"
          @change="setSteps(($event.target as HTMLInputElement).value)"
        />
      </div>

      <div class="flex items-center gap-2">
        <Label class="flex w-24 shrink-0 items-center gap-1 text-xs">
          Mode
          <InfoHint title="How steps are placed" wide :text="SCALE_MODE_HINTS[mode]" />
        </Label>
        <Select :model-value="mode" @update:model-value="mode = $event as ScaleMode">
          <SelectTrigger size="sm" class="flex-1" aria-label="Scale mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="(hint, id) in SCALE_MODE_HINTS"
              :key="id"
              :value="id"
              class="items-start"
            >
              <span class="flex flex-col gap-0.5 py-0.5">
                <span class="text-xs">{{ MODE_LABELS[id] }}</span>
                <span class="max-w-[20rem] text-[11px] leading-snug text-wrap text-muted-foreground">
                  {{ hint }}
                </span>
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div class="flex items-center gap-2">
        <Label class="flex w-24 shrink-0 items-center gap-1 text-xs">
          Light end
          <InfoHint
            title="Lightest step"
            wide
            text="OKLCH lightness of the top of the ramp, where 1 is white. Above 0.98 the step is indistinguishable from the page and you have wasted it; below 0.94 the tint is heavy enough to compete with white surfaces instead of sitting under them. Tailwind's own 50s live around 0.97."
          />
        </Label>
        <input
          v-model.number="lightEnd"
          type="range"
          class="h-4 flex-1 accent-primary"
          min="0.8"
          max="1"
          step="0.002"
          aria-label="Lightness of the lightest step"
        />
        <span class="w-10 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
          {{ lightEnd.toFixed(3) }}
        </span>
      </div>

      <div class="flex items-center gap-2">
        <Label class="flex w-24 shrink-0 items-center gap-1 text-xs">
          Dark end
          <InfoHint
            title="Darkest step"
            wide
            text="OKLCH lightness of the bottom of the ramp. Design systems stop around 0.15 to 0.22 rather than running to black, because a color with no lightness left has no hue left either and the family stops being recognisable. Go lower only when you need a near-black surface that still has to read as branded."
          />
        </Label>
        <input
          v-model.number="darkEnd"
          type="range"
          class="h-4 flex-1 accent-primary"
          min="0.05"
          max="0.45"
          step="0.005"
          aria-label="Lightness of the darkest step"
        />
        <span class="w-10 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
          {{ darkEnd.toFixed(3) }}
        </span>
      </div>

      <div class="flex items-center gap-2">
        <Label class="flex w-24 shrink-0 items-center gap-1 text-xs">
          Chroma falloff
          <InfoHint
            title="Saturation at the ends"
            wide
            text="How much chroma is drained from the two ends of the ramp. Some falloff is always right, because a near-white and a near-black physically cannot hold much of it: at 0 the tints turn muddy and the shades clip against the gamut boundary. At 1 both ends are effectively grey and the family loses its identity where it is used most — backgrounds and text. Around 0.5 keeps the hue readable at both extremes."
          />
        </Label>
        <input
          v-model.number="chromaFalloff"
          type="range"
          class="h-4 flex-1 accent-primary"
          min="0"
          max="1"
          step="0.01"
          aria-label="Chroma falloff at the ends of the ramp"
        />
        <span class="w-10 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
          {{ chromaFalloff.toFixed(2) }}
        </span>
      </div>

      <div class="flex items-center gap-2">
        <Label class="flex w-24 shrink-0 items-center gap-1 text-xs">
          Curve
          <InfoHint
            title="Where the steps bunch up"
            wide
            text="Bends the spacing of the lightness steps. Below 1 the ramp darkens early, so most steps land in the dark half — what a dark-first product needs, since that is where its surfaces are. Above 1 it stays light longer and spends the steps on tints. At 1 the steps are evenly spaced in perceptual lightness, which is the safe default."
          />
        </Label>
        <input
          v-model.number="curve"
          type="range"
          class="h-4 flex-1 accent-primary"
          min="0.6"
          max="1.6"
          step="0.02"
          aria-label="Lightness distribution curve"
        />
        <span class="w-10 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
          {{ curve.toFixed(2) }}
        </span>
      </div>

      <div class="flex items-center gap-2">
        <Label class="flex w-24 shrink-0 items-center gap-1 text-xs">
          Metric
          <InfoHint title="Contrast metric" wide>
            <p class="text-xs leading-relaxed text-muted-foreground">
              {{ METRIC_HINTS[studio.metric] }}
            </p>
            <p class="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              This is the studio-wide setting, so changing it here changes every contrast readout
              in the app.
            </p>
          </InfoHint>
        </Label>
        <Select
          :model-value="studio.metric"
          @update:model-value="studio.metric = $event as ContrastMetric"
        >
          <SelectTrigger size="sm" class="flex-1" aria-label="Contrast metric">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="(hint, id) in METRIC_HINTS"
              :key="id"
              :value="id"
              class="items-start"
            >
              <span class="flex flex-col gap-0.5 py-0.5">
                <span class="text-xs">{{ METRIC_LABELS[id] }}</span>
                <span class="max-w-[20rem] text-[11px] leading-snug text-wrap text-muted-foreground">
                  {{ hint }}
                </span>
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div class="flex items-center gap-2">
        <Label class="flex w-24 shrink-0 items-center gap-1 text-xs">
          Pin seed
          <InfoHint
            title="Keep the seed exactly"
            wide
            text="Preserves your seed color untouched at whichever step its lightness is closest to, so the ramp actually contains the brand color rather than a recomputed approximation of it. Switch it off and every step, including that one, is derived from the hue and chroma alone: the ramp gets marginally smoother and your exact hex disappears from it. Leave it on unless perfectly even spacing matters more than an exact match."
          />
        </Label>
        <Switch v-model="pinSeed" aria-label="Pin the seed color to its nearest step" />
        <span class="text-[11px] text-muted-foreground">
          {{ pinSeed ? 'Seed preserved exactly' : 'Every step recomputed' }}
        </span>
      </div>
    </div>

    <!-- The ramp -->
    <div class="rounded-lg border bg-card/40 p-2.5">
      <div class="mb-2 flex items-center gap-2">
        <Label class="flex items-center gap-1 text-xs">
          Scale
          <InfoHint
            title="Reading the ramp"
            wide
            text="Contrast is measured against white, in the metric selected above. The badge compares each step against the target ladder its preset implies — the WCAG ratios a Tailwind or Radix scale is built to hit — so it answers 'is this step dark enough for the job its number claims'. That ladder stays in WCAG ratios even when the numbers are reported in Lc, so read the badges as a WCAG check. Click any step to copy it in the studio's current format."
          />
        </Label>
        <span class="flex-1" />
        <span class="font-mono text-[11px] text-muted-foreground tabular-nums">
          {{ stops.length }} steps
        </span>
      </div>

      <p v-if="!stops.length" class="py-3 text-center text-[11px] text-muted-foreground">
        Add a color to the palette to build a scale from it.
      </p>

      <ul v-else class="flex flex-col gap-0.5">
        <li v-for="stop in stops" :key="stop.key" class="flex items-center gap-1.5">
          <button
            type="button"
            class="group/step flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            :aria-label="`Copy step ${stop.key}`"
            @click="copyStop('scale', stop)"
          >
            <span
              class="size-6 shrink-0 rounded-md border border-border/60"
              :style="{ background: swatchCss(stop.color) }"
            />
            <span class="w-8 shrink-0 font-mono text-[11px] tabular-nums">{{ stop.key }}</span>
            <span class="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
              {{ purposeOf(stop) }}
            </span>
            <Check v-if="isCopied('scale', stop.key)" class="size-3.5 shrink-0 text-primary" />
            <Copy
              v-else
              class="size-3.5 shrink-0 opacity-0 transition group-hover/step:opacity-60"
            />
          </button>
          <span
            class="w-14 shrink-0 text-right font-mono text-[11px] text-muted-foreground tabular-nums"
            :title="levelLabel(stop.contrast)"
          >
            {{ contrastLabel(stop.contrast) }}
          </span>
          <Badge
            :variant="stop.meetsTarget ? 'secondary' : 'destructive'"
            class="w-14 shrink-0 justify-center px-1 py-0 text-[10px]"
            :aria-label="
              stop.meetsTarget
                ? `Step ${stop.key} meets its contrast target`
                : `Step ${stop.key} is under its contrast target`
            "
          >
            {{ stop.meetsTarget ? 'meets' : 'under' }}
          </Badge>
          <Button
            variant="ghost"
            size="icon-xs"
            :aria-label="`Add step ${stop.key} to the palette`"
            title="Add to palette"
            @click="palette.addSwatch(undefined, stop.color)"
          >
            <Plus />
          </Button>
        </li>
      </ul>

      <div class="mt-2 flex items-center gap-2">
        <Button variant="outline" class="flex-1" :disabled="!stops.length" @click="replacePalette">
          <ReplaceAll /> Replace palette with this scale
        </Button>
        <InfoHint
          title="Replace the palette"
          wide
          text="Swaps every color in the strip for the steps of this ramp, so the palette becomes the scale and every other panel — roles, exports, previews — starts working from it. It lands as a single undo step, so you can look at the result and take it back."
        />
      </div>
    </div>

    <!-- Neutrals -->
    <div class="rounded-lg border bg-card/40 p-2.5">
      <div class="mb-2 flex items-center gap-2">
        <Label class="flex items-center gap-1 text-xs">
          Neutrals
          <InfoHint
            title="Why a tinted grey"
            wide
            text="A grey ramp that carries a few percent of the seed's chroma. Put a pure grey next to a saturated brand color and it reads as dirty and faintly opposed in hue, because the eye judges neutrality relative to what surrounds it. Greys pulled toward the brand hue read as deliberate, and they let borders, shadows, dividers and disabled text belong to the same family as everything else. Radix, Material and Tailwind all ship tinted greys for exactly this reason."
          />
        </Label>
      </div>

      <div class="mb-2 flex items-center gap-2">
        <Label class="flex w-24 shrink-0 items-center gap-1 text-xs">
          Tint
          <InfoHint
            title="How much brand in the grey"
            wide
            text="The chroma the neutrals keep, on the OKLCH scale where the brand color itself is usually 0.10 to 0.25. Below about 0.005 the tint is invisible and you may as well use a pure grey. Above about 0.02 it stops reading as neutral and starts competing with the brand ramp for attention. Most systems land between 0.01 and 0.015."
          />
        </Label>
        <input
          v-model.number="tint"
          type="range"
          class="h-4 flex-1 accent-primary"
          min="0"
          max="0.05"
          step="0.001"
          aria-label="Neutral tint amount"
        />
        <span class="w-10 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
          {{ tint.toFixed(3) }}
        </span>
      </div>

      <ul class="flex flex-col gap-0.5">
        <li v-for="stop in neutral" :key="stop.key" class="flex items-center gap-1.5">
          <button
            type="button"
            class="group/neutral flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            :aria-label="`Copy neutral step ${stop.key}`"
            @click="copyStop('neutral', stop)"
          >
            <span
              class="size-6 shrink-0 rounded-md border border-border/60"
              :style="{ background: swatchCss(stop.color) }"
            />
            <span class="w-8 shrink-0 font-mono text-[11px] tabular-nums">{{ stop.key }}</span>
            <span class="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
              {{ describeColor(stop.color) }}
            </span>
            <Check v-if="isCopied('neutral', stop.key)" class="size-3.5 shrink-0 text-primary" />
            <Copy
              v-else
              class="size-3.5 shrink-0 opacity-0 transition group-hover/neutral:opacity-60"
            />
          </button>
          <span
            class="w-14 shrink-0 text-right font-mono text-[11px] text-muted-foreground tabular-nums"
            :title="levelLabel(stop.contrast)"
          >
            {{ contrastLabel(stop.contrast) }}
          </span>
          <Badge
            :variant="stop.meetsTarget ? 'secondary' : 'destructive'"
            class="w-14 shrink-0 justify-center px-1 py-0 text-[10px]"
            :aria-label="
              stop.meetsTarget
                ? `Neutral ${stop.key} meets its contrast target`
                : `Neutral ${stop.key} is under its contrast target`
            "
          >
            {{ stop.meetsTarget ? 'meets' : 'under' }}
          </Badge>
          <Button
            variant="ghost"
            size="icon-xs"
            :aria-label="`Add neutral step ${stop.key} to the palette`"
            title="Add to palette"
            @click="palette.addSwatch(undefined, stop.color)"
          >
            <Plus />
          </Button>
        </li>
      </ul>
    </div>
  </div>
</template>
