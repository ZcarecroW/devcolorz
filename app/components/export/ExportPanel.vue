<script setup lang="ts">
/**
 * The export panel.
 *
 * Everything here is a view over one `ExportConfig`. The panel never formats a
 * color itself — it hands the config to `buildGraph` and lets an emitter write
 * it down — so a setting can never mean one thing in the preview and another in
 * the file you download. Regeneration is debounced by 120ms because a ten-color
 * palette with scales and alpha ladders is a few thousand color conversions,
 * and nobody needs that on every keystroke.
 */
import { computed, ref, shallowRef } from 'vue'
import { Check, Copy, Download, Minus, Plus, RotateCcw, X } from '@lucide/vue'
import { refDebounced } from '@vueuse/core'
import { toast } from 'vue-sonner'
import ColorExportRow from '@/components/export/ColorExportRow.vue'
import InfoHint from '@/components/common/InfoHint.vue'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ALPHA_MODE_HINTS } from '@/lib/color/alpha'
import { FORMAT_HINTS, FORMAT_LABELS, formatColor } from '@/lib/color/convert'
import { INVERT_HINTS, INVERT_LABELS, reportInversion, toDark } from '@/lib/color/invert'
import { slugify } from '@/lib/color/name'
import {
  SCALE_MODE_HINTS,
  SCALE_MODE_LABELS,
  SCALE_PRESET_HINTS,
  SCALE_PRESET_LABELS,
} from '@/lib/color/scale'
import type { ColorFormat, Oklch, Swatch } from '@/lib/color/types'
import type { InvertStrategy } from '@/lib/color/invert'
import type { ScaleMode, ScalePreset } from '@/lib/color/scale'
import {
  ALPHA_MODE_LABELS,
  DARK_DELIVERY_HINTS,
  DARK_DELIVERY_LABELS,
  DEFAULT_EXPORT_CONFIG,
  FORMAT_ORDER,
  NAME_CASE_HINTS,
  NAME_CASE_LABELS,
} from '@/lib/export/config'
import type {
  AlphaMode,
  ColorOverride,
  DarkDelivery,
  ExportConfig,
  NameCase,
} from '@/lib/export/config'
import { EMITTERS, EMITTERS_BY_ID } from '@/lib/export/emitters'
import { buildGraph, composeName, stemsFor } from '@/lib/export/graph'
import { useStudioStore } from '@/stores/studio'
import { useSessionStore } from '@/stores/session'
import { usePaletteStore } from '@/stores/palette'

const palette = usePaletteStore()
const studio = useStudioStore()
const session = useSessionStore()

/**
 * Held in a `shallowRef` and replaced wholesale: the config carries raw color
 * objects in its overrides, and those must not be wrapped in a deep proxy.
 */
/**
 * The instance's own starting point, where the administrator has set one.
 *
 * `engine.defaultDarkStrategy` is stored, served by `/meta` and given a full
 * control in the admin console, and nothing read it — the panel always opened
 * on the value compiled into the client.
 */
function startingConfig(): ExportConfig {
  const strategy = session.meta?.defaults?.darkStrategy
  return {
    ...DEFAULT_EXPORT_CONFIG,
    ...(strategy ? { darkStrategy: strategy as InvertStrategy } : {}),
    overrides: {},
  }
}

const config = shallowRef<ExportConfig>(startingConfig())
/**
 * Store-backed so the sixteen "Export as …" commands can select a format, and
 * so the choice survives the panel being unmounted when another tab is shown.
 * The `?? EMITTERS[0]` fallback downstream still covers a persisted id that no
 * longer exists.
 */
const emitterId = computed({
  get: () => studio.exportEmitter,
  set: (value: string) => (studio.exportEmitter = value),
})

function patch(changes: Partial<ExportConfig>) {
  config.value = { ...config.value, ...changes }
}

function numberFrom(event: Event): number {
  return Number((event.target as HTMLInputElement).value)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

const emitter = computed(() => EMITTERS_BY_ID[emitterId.value] ?? EMITTERS[0])

/* ---------------- regeneration ---------------- */

interface Snapshot {
  swatches: Swatch[]
  config: ExportConfig
  title: string
  emitterId: string
}

const source = computed<Snapshot>(() => ({
  swatches: palette.swatches,
  config: config.value,
  title: palette.title || 'Palette',
  emitterId: emitterId.value,
}))

/** The one place the 120ms delay lives; everything expensive reads from here. */
const snapshot = refDebounced(source, 120)

const result = computed(() => {
  const snap = snapshot.value
  const chosen = EMITTERS_BY_ID[snap.emitterId] ?? EMITTERS[0]
  if (!snap.swatches.length) {
    return { text: '', tokens: 0, error: 'Add a color to the palette first.' }
  }
  try {
    const graph = buildGraph(snap.swatches, snap.config, snap.title)
    return {
      text: chosen.emit(graph),
      tokens: graph.tokens.length,
      renames: graph.renames,
      error: null as string | null,
    }
  } catch (error) {
    // A bad combination of settings must not take the studio down with it.
    return {
      text: '',
      tokens: 0,
      renames: [] as Array<{ from: string; to: string }>,
      error: error instanceof Error ? error.message : 'That combination could not be generated.',
    }
  }
})

const bytes = computed(() => new TextEncoder().encode(result.value.text).length)
const byteLabel = computed(() =>
  bytes.value < 1024 ? `${bytes.value} B` : `${(bytes.value / 1024).toFixed(1)} kB`,
)

/* ---------------- naming preview ---------------- */

const example = computed(() => {
  const cfg = config.value
  // The same stem the export will actually use, gaps and all — recomputing it
  // here re-derived `color-1` for a swatch that exports as `color-3`.
  const stems = stemsFor(palette.swatches, cfg)
  const index = palette.swatches.findIndex((s) => !cfg.overrides[s.id]?.exclude)
  const stem = index >= 0 ? stems[index] : `${cfg.fallbackStem}-1`
  return {
    base: composeName(cfg, stem),
    scale: composeName(cfg, stem, cfg.scalePreset === 'radix' ? '9' : '500'),
    alpha: composeName(cfg, stem, `a${cfg.alphaSteps[0] ?? 10}`),
  }
})

/**
 * The variable each swatch will emit — kept undebounced so the rows stay live.
 *
 * Numbered over the whole palette, exactly as `buildGraph` does. Numbering
 * over the surviving swatches instead made the row preview disagree with the
 * emitted file the moment one colour was excluded.
 */
const tokenNames = computed(() => {
  const cfg = config.value
  const stems = stemsFor(palette.swatches, cfg)
  const map: Record<string, string> = {}
  palette.swatches.forEach((swatch, index) => {
    if (cfg.overrides[swatch.id]?.exclude) return
    map[swatch.id] = composeName(cfg, stems[index])
  })
  return map
})

/* ---------------- light / dark preview ---------------- */

const darkPreview = computed(() => {
  const cfg = snapshot.value.config
  return snapshot.value.swatches.map((swatch) => {
    const override = cfg.overrides[swatch.id]
    const on = override?.dark ?? cfg.emitDark
    const derived = toDark(swatch.color, {
      strategy: cfg.darkStrategy,
      darkFloor: cfg.darkFloor,
      darkCeiling: cfg.darkCeiling,
      chromaCompensation: cfg.chromaCompensation,
    })
    const effective = on ? (override?.darkColor ?? derived) : swatch.color
    return {
      id: swatch.id,
      excluded: Boolean(override?.exclude),
      on,
      derived,
      lightCss: formatColor(swatch.color, 'oklch'),
      darkCss: formatColor(effective, 'oklch'),
      label: swatch.name || formatColor(swatch.color, 'hex'),
      drift: reportInversion(swatch.color, effective).drift,
    }
  })
})

const strip = computed(() => darkPreview.value.filter((entry) => !entry.excluded))

const derivedDarks = computed(() => {
  const map: Record<string, Oklch> = {}
  for (const entry of darkPreview.value) map[entry.id] = entry.derived
  return map
})

/**
 * APCA drift, in Lc points, between how a color read in light mode and how its
 * counterpart reads in dark. Under 10 the two modes feel like the same design;
 * over 25 something visibly changed weight.
 */
function driftClass(drift: number): string {
  if (drift < 10) return 'text-emerald-600 dark:text-emerald-400'
  if (drift < 25) return 'text-amber-600 dark:text-amber-400'
  return 'text-destructive'
}

/* ---------------- alpha steps ---------------- */

const alphaDraft = ref('')

function addAlphaStep() {
  const step = Math.round(Number(alphaDraft.value))
  alphaDraft.value = ''
  if (!Number.isFinite(step) || step < 1 || step > 99) return
  if (config.value.alphaSteps.includes(step)) return
  patch({ alphaSteps: [...config.value.alphaSteps, step].sort((a, b) => a - b) })
}

function removeAlphaStep(step: number) {
  patch({ alphaSteps: config.value.alphaSteps.filter((value) => value !== step) })
}

/* ---------------- per-color overrides ---------------- */

const overrideDefaults = computed(() => ({
  alpha: config.value.emitAlpha,
  dark: config.value.emitDark,
  scale: config.value.emitScales,
}))

const overrideCount = computed(() => Object.keys(config.value.overrides).length)

function setOverride(id: string, value: ColorOverride) {
  const next = { ...config.value.overrides }
  if (Object.keys(value).length === 0) delete next[id]
  else next[id] = value
  patch({ overrides: next })
}

/* ---------------- output actions ---------------- */

const copied = ref(false)

const fileName = computed(
  () => `${slugify(palette.title || 'palette')}.${emitter.value.ext}`,
)

async function copy() {
  if (!result.value.text) return
  try {
    await navigator.clipboard.writeText(result.value.text)
    copied.value = true
    setTimeout(() => (copied.value = false), 1200)
  } catch {
    toast.error('Could not reach the clipboard', {
      description: 'Your browser blocked it. Select the text and copy manually.',
    })
  }
}

function download() {
  if (!result.value.text) return
  const url = URL.createObjectURL(new Blob([result.value.text], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName.value
  document.body.append(link)
  link.click()
  link.remove()
  // Revoking synchronously cancels the download in Safari; one tick is enough.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function resetAll() {
  config.value = startingConfig()
}

/** Formats that carry no float channels, so the precision control does nothing. */
const PRECISION_FREE: ColorFormat[] = ['hex', 'hexa', 'rgb', 'rgb-legacy', 'hsl', 'hsl-legacy']
const precisionApplies = computed(() => !PRECISION_FREE.includes(config.value.format))
</script>

<template>
  <div class="flex min-h-0 flex-col gap-3">
    <!-- Format cards -->
    <section class="rounded-lg border bg-card/40 p-2.5">
      <div class="mb-2 flex items-center gap-1">
        <Label class="text-xs">Format</Label>
        <InfoHint
          title="Which format?"
          wide
          text="Every format below is written from the same token set, so the choice changes the syntax and nothing else. Pick the one your build actually consumes: CSS custom properties for a plain stylesheet, the Tailwind theme block if Tailwind generates your utilities, DTCG JSON if the tokens feed a design tool."
        />
        <span class="flex-1" />
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Reset every export setting"
          title="Reset every export setting"
          @click="resetAll"
        >
          <RotateCcw />
        </Button>
      </div>
      <div class="grid grid-cols-2 gap-1.5">
        <button
          v-for="item in EMITTERS"
          :key="item.id"
          type="button"
          class="rounded-md border p-1.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          :class="
            item.id === emitterId
              ? 'border-primary bg-primary/10'
              : 'hover:border-foreground/25 hover:bg-accent/40'
          "
          :aria-pressed="item.id === emitterId"
          :title="item.hint"
          @click="emitterId = item.id"
        >
          <span class="block text-[11px] leading-tight font-medium">{{ item.label }}</span>
          <span class="mt-0.5 line-clamp-2 block text-[10px] leading-snug text-muted-foreground">
            {{ item.hint }}
          </span>
        </button>
      </div>
      <p class="mt-2 text-[11px] leading-snug text-muted-foreground">{{ emitter.hint }}</p>
    </section>

    <Accordion
      type="multiple"
      :default-value="['notation', 'naming', 'dark']"
      class="rounded-lg border bg-card/40 px-2.5"
    >
      <!-- ─────────── Notation ─────────── -->
      <AccordionItem value="notation">
        <AccordionTrigger class="py-2.5 text-xs">Notation</AccordionTrigger>
        <AccordionContent class="flex flex-col gap-2.5 pb-3">
          <div class="flex items-center gap-2">
            <Label class="flex w-20 shrink-0 items-center gap-1 text-xs">
              Values
              <InfoHint title="Color notation" wide :text="FORMAT_HINTS[config.format]" />
            </Label>
            <Select
              :model-value="config.format"
              @update:model-value="patch({ format: $event as ColorFormat })"
            >
              <SelectTrigger size="sm" class="flex-1" aria-label="Color notation">
                <SelectValue />
              </SelectTrigger>
              <SelectContent class="max-h-96">
                <SelectItem
                  v-for="id in FORMAT_ORDER"
                  :key="id"
                  :value="id"
                  :label="FORMAT_LABELS[id]"
                  :description="FORMAT_HINTS[id]"
                />
              </SelectContent>
            </Select>
          </div>

          <div class="flex items-center gap-2">
            <Label class="flex w-20 shrink-0 items-center gap-1 text-xs">
              Precision
              <InfoHint
                title="Decimal places"
                wide
                text="How many decimals each float channel keeps. Three is enough to survive a round trip through OKLCH without a visible shift and keeps the file small; five is for pipelines that re-convert the values several times. Hex, rgb() and hsl() have fixed precision, so the control is inert for them."
              />
            </Label>
            <div class="flex items-center gap-1" :class="!precisionApplies && 'opacity-50'">
              <Button
                variant="outline"
                size="icon-xs"
                aria-label="Fewer decimal places"
                :disabled="config.precision <= 0"
                @click="patch({ precision: clamp(config.precision - 1, 0, 6) })"
              >
                <Minus />
              </Button>
              <span class="w-6 text-center font-mono text-xs tabular-nums">
                {{ config.precision }}
              </span>
              <Button
                variant="outline"
                size="icon-xs"
                aria-label="More decimal places"
                :disabled="config.precision >= 6"
                @click="patch({ precision: clamp(config.precision + 1, 0, 6) })"
              >
                <Plus />
              </Button>
            </div>
            <span v-if="!precisionApplies" class="text-[10px] text-muted-foreground">
              not used by {{ FORMAT_LABELS[config.format] }}
            </span>
          </div>
        </AccordionContent>
      </AccordionItem>

      <!-- ─────────── Naming ─────────── -->
      <AccordionItem value="naming">
        <AccordionTrigger class="py-2.5 text-xs">Naming</AccordionTrigger>
        <AccordionContent class="flex flex-col gap-2.5 pb-3">
          <div class="flex items-center gap-2">
            <Label class="flex w-20 shrink-0 items-center gap-1 text-xs" for="export-prefix">
              Prefix
              <InfoHint
                title="Prefix"
                wide
                text="Prepended to every variable. A namespace is what stops your tokens colliding with a component library's, and Tailwind v4 in particular only generates color utilities from variables under `--color-`. Leave it empty only if you own the whole stylesheet."
              />
            </Label>
            <Input
              id="export-prefix"
              :model-value="config.prefix"
              class="h-8 flex-1 font-mono text-xs"
              placeholder="none"
              @update:model-value="patch({ prefix: String($event) })"
            />
          </div>

          <div class="flex items-center gap-2">
            <Label class="flex w-20 shrink-0 items-center gap-1 text-xs" for="export-suffix">
              Suffix
              <InfoHint
                title="Suffix"
                wide
                text="Appended after the color's own name but before any variant suffix, so a scale step still lands last. Useful when the palette is one layer of a larger token set and everything needs a `-raw` or `-base` marker."
              />
            </Label>
            <Input
              id="export-suffix"
              :model-value="config.suffix"
              class="h-8 flex-1 font-mono text-xs"
              placeholder="none"
              @update:model-value="patch({ suffix: String($event) })"
            />
          </div>

          <div class="flex items-center gap-2">
            <Label class="flex w-20 shrink-0 items-center gap-1 text-xs">
              Case
              <InfoHint title="Name case" wide :text="NAME_CASE_HINTS[config.case]" />
            </Label>
            <Select
              :model-value="config.case"
              @update:model-value="patch({ case: $event as NameCase })"
            >
              <SelectTrigger size="sm" class="flex-1" aria-label="Variable name case">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="(label, id) in NAME_CASE_LABELS"
                  :key="id"
                  :value="id"
                  :label="label"
                  :description="NAME_CASE_HINTS[id]"
                />
              </SelectContent>
            </Select>
          </div>

          <div class="flex items-center gap-2">
            <Label class="flex flex-1 items-center gap-1 text-xs" for="export-use-names">
              Use color names
              <InfoHint
                title="Names or numbers"
                wide
                text="With this on, a swatch called Marine exports as `marine`, which reads far better in a stylesheet. The cost is that renaming a color renames a variable, and every rule referencing the old one silently stops resolving. Turn it off for a numbered set that a rename can never break."
              />
            </Label>
            <Switch
              id="export-use-names"
              :model-value="config.useNames"
              @update:model-value="patch({ useNames: $event })"
            />
          </div>

          <div class="flex items-center gap-2">
            <Label class="flex w-20 shrink-0 items-center gap-1 text-xs" for="export-stem">
              Fallback
              <InfoHint
                title="Fallback stem"
                wide
                text="The stem unnamed colors fall back to, numbered by their position in the palette: color-1, color-2 and so on. Position is what makes it stable — reorder the palette and the names follow the strip rather than the colors."
              />
            </Label>
            <Input
              id="export-stem"
              :model-value="config.fallbackStem"
              class="h-8 flex-1 font-mono text-xs"
              placeholder="color"
              @update:model-value="patch({ fallbackStem: String($event) })"
            />
          </div>

          <div class="rounded-md border bg-background/60 p-2">
            <p class="mb-1 text-[10px] tracking-wide text-muted-foreground uppercase">
              First color exports as
            </p>
            <p class="truncate font-mono text-xs text-foreground">{{ example.base }}</p>
            <p v-if="config.emitScales" class="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
              {{ example.scale }}
            </p>
            <p v-if="config.emitAlpha" class="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
              {{ example.alpha }}
            </p>
          </div>
        </AccordionContent>
      </AccordionItem>

      <!-- ─────────── Variants ─────────── -->
      <AccordionItem value="variants">
        <AccordionTrigger class="py-2.5 text-xs">Variants</AccordionTrigger>
        <AccordionContent class="flex flex-col gap-3 pb-3">
          <!-- Alpha -->
          <div class="flex flex-col gap-2">
            <div class="flex items-center gap-2">
              <Label class="flex flex-1 items-center gap-1 text-xs" for="export-alpha">
                Transparent variants
                <InfoHint
                  title="Transparent variants"
                  wide
                  text="Adds a ladder of translucent versions of each color. They are what borders, hover fills and scrims should be made of, because a translucent token adapts to whatever sits behind it while a flat tint only ever matches one background."
                />
              </Label>
              <Switch
                id="export-alpha"
                :model-value="config.emitAlpha"
                @update:model-value="patch({ emitAlpha: $event })"
              />
            </div>

            <template v-if="config.emitAlpha">
              <div class="flex items-center gap-2">
                <Label class="flex w-20 shrink-0 items-center gap-1 text-xs">
                  Mode
                  <InfoHint
                    title="Alpha mode"
                    wide
                    :text="ALPHA_MODE_HINTS[config.alphaMode]"
                  />
                </Label>
                <Select
                  :model-value="config.alphaMode"
                  @update:model-value="patch({ alphaMode: $event as AlphaMode })"
                >
                  <SelectTrigger size="sm" class="flex-1" aria-label="Transparency mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem
                      v-for="(label, id) in ALPHA_MODE_LABELS"
                      :key="id"
                      :value="id"
                      :label="label"
                      :description="ALPHA_MODE_HINTS[id]"
                    />
                  </SelectContent>
                </Select>
              </div>

              <div>
                <div class="mb-1.5 flex items-center gap-1">
                  <Label class="text-xs">Steps</Label>
                  <InfoHint
                    title="Opacity steps"
                    wide
                    text="Each step becomes its own variable, so ten steps on ten colors is a hundred extra tokens. Most interfaces need four or five: something faint for hover, a little more for borders, and a heavy one for scrims."
                  />
                  <span class="flex-1" />
                  <span class="font-mono text-[10px] text-muted-foreground tabular-nums">
                    {{ config.alphaSteps.length }} steps
                  </span>
                </div>
                <div class="flex flex-wrap gap-1">
                  <button
                    v-for="step in config.alphaSteps"
                    :key="step"
                    type="button"
                    class="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 font-mono text-[10px] tabular-nums transition-colors hover:border-destructive/60 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    :aria-label="`Remove the ${step} percent step`"
                    :title="`Remove ${step}%`"
                    @click="removeAlphaStep(step)"
                  >
                    {{ step }}%
                    <X class="size-2.5" />
                  </button>
                  <form class="flex items-center gap-1" @submit.prevent="addAlphaStep">
                    <input
                      v-model="alphaDraft"
                      class="w-12 rounded-full border bg-background px-2 py-0.5 text-center font-mono text-[10px] tabular-nums"
                      inputmode="numeric"
                      placeholder="%"
                      aria-label="New opacity step, in percent"
                    />
                    <Button
                      type="submit"
                      variant="outline"
                      size="icon-xs"
                      aria-label="Add this opacity step"
                    >
                      <Plus />
                    </Button>
                  </form>
                </div>
              </div>
            </template>
          </div>

          <!-- Scales -->
          <div class="flex flex-col gap-2 border-t pt-3">
            <div class="flex items-center gap-2">
              <Label class="flex flex-1 items-center gap-1 text-xs" for="export-scales">
                Tonal scales
                <InfoHint
                  title="Tonal scales"
                  wide
                  text="Expands every color into a full ramp — eleven or twelve steps from near-white to near-black. This is what turns a palette into a design system, and it multiplies the token count by roughly eleven, so switch it on globally only when you mean it. The per-color section can enable it for one brand color and leave the rest flat."
                />
              </Label>
              <Switch
                id="export-scales"
                :model-value="config.emitScales"
                @update:model-value="patch({ emitScales: $event })"
              />
            </div>

            <template v-if="config.emitScales">
              <div class="flex items-center gap-2">
                <Label class="flex w-20 shrink-0 items-center gap-1 text-xs">
                  Preset
                  <InfoHint
                    title="Scale preset"
                    wide
                    :text="SCALE_PRESET_HINTS[config.scalePreset]"
                  />
                </Label>
                <Select
                  :model-value="config.scalePreset"
                  @update:model-value="patch({ scalePreset: $event as ScalePreset })"
                >
                  <SelectTrigger size="sm" class="flex-1" aria-label="Scale preset">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem
                      v-for="(hint, id) in SCALE_PRESET_HINTS"
                      :key="id"
                      :value="id"
                      :label="SCALE_PRESET_LABELS[id]"
                      :description="hint"
                    />
                  </SelectContent>
                </Select>
              </div>

              <div class="flex items-center gap-2">
                <Label class="flex w-20 shrink-0 items-center gap-1 text-xs">
                  Mode
                  <InfoHint title="Scale mode" wide :text="SCALE_MODE_HINTS[config.scaleMode]" />
                </Label>
                <Select
                  :model-value="config.scaleMode"
                  @update:model-value="patch({ scaleMode: $event as ScaleMode })"
                >
                  <SelectTrigger size="sm" class="flex-1" aria-label="Scale mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem
                      v-for="(hint, id) in SCALE_MODE_HINTS"
                      :key="id"
                      :value="id"
                      :label="SCALE_MODE_LABELS[id]"
                      :description="hint"
                    />
                  </SelectContent>
                </Select>
              </div>

              <div v-if="config.scalePreset === 'custom'" class="flex items-center gap-2">
                <Label class="flex w-20 shrink-0 items-center gap-1 text-xs">
                  Steps
                  <InfoHint
                    title="Step count"
                    wide
                    text="How many stops a custom ramp gets, named 100 upward. Five is enough for a compact component palette; past about sixteen the steps stop being visually distinguishable and you are just making the file bigger."
                  />
                </Label>
                <div class="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon-xs"
                    aria-label="Fewer scale steps"
                    :disabled="config.scaleSteps <= 2"
                    @click="patch({ scaleSteps: clamp(config.scaleSteps - 1, 2, 24) })"
                  >
                    <Minus />
                  </Button>
                  <span class="w-6 text-center font-mono text-xs tabular-nums">
                    {{ config.scaleSteps }}
                  </span>
                  <Button
                    variant="outline"
                    size="icon-xs"
                    aria-label="More scale steps"
                    :disabled="config.scaleSteps >= 24"
                    @click="patch({ scaleSteps: clamp(config.scaleSteps + 1, 2, 24) })"
                  >
                    <Plus />
                  </Button>
                </div>
              </div>
            </template>
          </div>
        </AccordionContent>
      </AccordionItem>

      <!-- ─────────── Light / dark ─────────── -->
      <AccordionItem value="dark">
        <AccordionTrigger class="py-2.5 text-xs">Light / dark</AccordionTrigger>
        <AccordionContent class="flex flex-col gap-3 pb-3">
          <div class="flex items-center gap-2">
            <Label class="flex flex-1 items-center gap-1 text-xs" for="export-dark">
              Generate dark variants
              <InfoHint
                title="Dark variants"
                wide
                text="Derives a second value for every color and emits it alongside the light one. A dark theme is not a filter applied at the end — it is a second set of decisions, and this is where they get made."
              />
            </Label>
            <Switch
              id="export-dark"
              :model-value="config.emitDark"
              @update:model-value="patch({ emitDark: $event })"
            />
          </div>

          <template v-if="config.emitDark">
            <!-- Strategy: the explanations are the point, so they are on the page. -->
            <div class="flex flex-col gap-1.5">
              <div class="flex items-center gap-1">
                <Label class="text-xs">Strategy</Label>
                <InfoHint
                  title="Inversion strategy"
                  wide
                  text="How a light-mode color becomes a dark-mode one. This single choice decides whether your dark theme looks designed or looks like someone inverted the stylesheet, and the six answers below genuinely disagree with each other. Read them — the recommended one is not the obvious one."
                />
              </div>
              <div
                v-for="(label, id) in INVERT_LABELS"
                :key="id"
                class="flex items-start gap-1"
              >
                <button
                  type="button"
                  class="flex-1 rounded-md border p-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  :class="
                    id === config.darkStrategy
                      ? 'border-primary bg-primary/10'
                      : 'hover:border-foreground/25 hover:bg-accent/40'
                  "
                  :aria-pressed="id === config.darkStrategy"
                  @click="patch({ darkStrategy: id as InvertStrategy })"
                >
                  <span class="block text-[11px] leading-tight font-medium">{{ label }}</span>
                  <span
                    class="mt-0.5 block text-[10px] leading-snug text-muted-foreground"
                    :class="id === config.darkStrategy ? '' : 'line-clamp-2'"
                  >
                    {{ INVERT_HINTS[id] }}
                  </span>
                </button>
                <InfoHint :title="label" :text="INVERT_HINTS[id]" wide class="mt-2" />
              </div>
            </div>

            <!-- Curve controls -->
            <div class="flex flex-col gap-2.5 border-t pt-3">
              <div class="flex items-center gap-2">
                <Label class="flex w-24 shrink-0 items-center gap-1 text-xs">
                  Dark floor
                  <InfoHint
                    title="Dark floor"
                    wide
                    text="The lowest lightness anything is allowed to reach in dark mode. Pure black backgrounds look like a hole in the screen and make text edges shimmer on OLED, so real dark themes bottom out around 0.12–0.18. Raise it for a softer, more paper-like dark surface."
                  />
                </Label>
                <input
                  type="range"
                  class="h-4 flex-1 accent-primary"
                  min="0"
                  max="0.4"
                  step="0.01"
                  :value="config.darkFloor"
                  aria-label="Dark floor lightness"
                  @input="patch({ darkFloor: numberFrom($event) })"
                />
                <span class="w-8 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
                  {{ config.darkFloor.toFixed(2) }}
                </span>
              </div>

              <div class="flex items-center gap-2">
                <Label class="flex w-24 shrink-0 items-center gap-1 text-xs">
                  Dark ceiling
                  <InfoHint
                    title="Dark ceiling"
                    wide
                    text="The highest lightness anything reaches in dark mode. Pure white text on a dark background blooms and is measurably harder to read for long stretches, which is why most dark themes cap around 0.90–0.95. Lower it if the interface feels glaring at night."
                  />
                </Label>
                <input
                  type="range"
                  class="h-4 flex-1 accent-primary"
                  min="0.6"
                  max="1"
                  step="0.01"
                  :value="config.darkCeiling"
                  aria-label="Dark ceiling lightness"
                  @input="patch({ darkCeiling: numberFrom($event) })"
                />
                <span class="w-8 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
                  {{ config.darkCeiling.toFixed(2) }}
                </span>
              </div>

              <div class="flex items-center gap-2">
                <Label class="flex w-24 shrink-0 items-center gap-1 text-xs">
                  Chroma comp.
                  <InfoHint
                    title="Chroma compensation"
                    wide
                    text="A color that was saturated at 45% lightness cannot hold the same chroma at 85%, and forcing it produces a washed, chalky result. This rescales chroma to what the gamut actually supports at the new lightness. At 0 the original chroma is kept and clipped; at 1 it is fully rescaled, which is safer but slightly duller."
                  />
                </Label>
                <input
                  type="range"
                  class="h-4 flex-1 accent-primary"
                  min="0"
                  max="1"
                  step="0.05"
                  :value="config.chromaCompensation"
                  aria-label="Chroma compensation"
                  @input="patch({ chromaCompensation: numberFrom($event) })"
                />
                <span class="w-8 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
                  {{ config.chromaCompensation.toFixed(2) }}
                </span>
              </div>
            </div>

            <!-- Delivery -->
            <div class="flex flex-col gap-2 border-t pt-3">
              <div class="flex items-center gap-2">
                <Label class="flex w-20 shrink-0 items-center gap-1 text-xs">
                  Delivery
                  <InfoHint
                    title="How dark mode is applied"
                    wide
                    :text="DARK_DELIVERY_HINTS[config.darkDelivery]"
                  />
                </Label>
                <Select
                  :model-value="config.darkDelivery"
                  @update:model-value="patch({ darkDelivery: $event as DarkDelivery })"
                >
                  <SelectTrigger size="sm" class="flex-1" aria-label="Dark mode delivery">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem
                      v-for="(label, id) in DARK_DELIVERY_LABELS"
                      :key="id"
                      :value="id"
                      :label="label"
                      :description="DARK_DELIVERY_HINTS[id]"
                    />
                  </SelectContent>
                </Select>
              </div>

              <div
                v-if="config.darkDelivery === 'class' || config.darkDelivery === 'both'"
                class="flex items-center gap-2"
              >
                <Label class="w-20 shrink-0 text-xs" for="export-dark-class">Dark class</Label>
                <Input
                  id="export-dark-class"
                  :model-value="config.darkClass"
                  class="h-8 flex-1 font-mono text-xs"
                  placeholder=".dark"
                  @update:model-value="patch({ darkClass: String($event) })"
                />
              </div>

              <div v-if="config.darkDelivery === 'both'" class="flex items-center gap-2">
                <Label class="flex w-20 shrink-0 items-center gap-1 text-xs" for="export-light-class">
                  Light class
                  <InfoHint
                    title="Forcing light back on"
                    wide
                    text="The other half of a two-way toggle. The media query supplies the default, the dark class forces dark on a light system, and this class forces light on a dark one. It is emitted inside the media query, where it can win without outranking the query itself — put it on the same element your dark class goes on."
                  />
                </Label>
                <Input
                  id="export-light-class"
                  :model-value="config.lightClass"
                  class="h-8 flex-1 font-mono text-xs"
                  placeholder=".light"
                  @update:model-value="patch({ lightClass: String($event) })"
                />
              </div>

              <div v-if="config.darkDelivery === 'attribute'" class="flex items-center gap-2">
                <Label class="w-20 shrink-0 text-xs" for="export-dark-attr">Attribute</Label>
                <Input
                  id="export-dark-attr"
                  :model-value="config.darkAttribute"
                  class="h-8 flex-1 font-mono text-xs"
                  placeholder='[data-theme="dark"]'
                  @update:model-value="patch({ darkAttribute: String($event) })"
                />
              </div>
            </div>

            <!-- Before / after -->
            <div class="border-t pt-3">
              <div class="mb-1.5 flex items-center gap-1">
                <Label class="text-xs">Before and after</Label>
                <InfoHint
                  title="APCA drift"
                  wide
                  text="Each column is a color above the dark counterpart this strategy produces. The number is the APCA drift: how far the contrast against the dark background moved from the contrast the original had against white. Under 10 the two modes read the same; over 25 that color changed weight and will look like a different design decision at night."
                />
              </div>
              <div class="scroll-slim flex gap-1 overflow-x-auto pb-1">
                <div
                  v-for="entry in strip"
                  :key="entry.id"
                  class="flex min-w-9 flex-1 flex-col items-stretch"
                  :title="`${entry.label} — drift ${entry.drift.toFixed(0)} Lc`"
                >
                  <span class="h-7 rounded-t-sm border border-b-0" :style="{ background: entry.lightCss }" />
                  <span class="h-7 rounded-b-sm border border-t-0" :style="{ background: entry.darkCss }" />
                  <span
                    class="mt-0.5 text-center font-mono text-[10px] tabular-nums"
                    :class="driftClass(entry.drift)"
                  >
                    {{ entry.drift.toFixed(0) }}
                  </span>
                </div>
              </div>
            </div>
          </template>
        </AccordionContent>
      </AccordionItem>

      <!-- ─────────── Per color ─────────── -->
      <AccordionItem value="per-color">
        <AccordionTrigger class="py-2.5 text-xs">
          <span class="flex items-center gap-2">
            Per color
            <span
              v-if="overrideCount"
              class="rounded-sm bg-primary/15 px-1 text-[9px] text-primary tabular-nums"
            >
              {{ overrideCount }} overridden
            </span>
          </span>
        </AccordionTrigger>
        <AccordionContent class="flex flex-col gap-2 pb-3">
          <p class="text-[11px] leading-snug text-muted-foreground">
            Global settings are the starting point, not the verdict. A brand color usually wants a
            full scale and a hand-tuned dark value; the four supporting colors beside it usually
            want neither.
          </p>
          <ColorExportRow
            v-for="swatch in palette.swatches"
            :key="swatch.id"
            :swatch="swatch"
            :override="config.overrides[swatch.id]"
            :defaults="overrideDefaults"
            :token-name="tokenNames[swatch.id] ?? null"
            :computed-dark="derivedDarks[swatch.id] ?? null"
            @update="setOverride(swatch.id, $event)"
          />
        </AccordionContent>
      </AccordionItem>

      <!-- ─────────── Output shape ─────────── -->
      <AccordionItem value="shape" class="border-b-0">
        <AccordionTrigger class="py-2.5 text-xs">Output shape</AccordionTrigger>
        <AccordionContent class="flex flex-col gap-2.5 pb-3">
          <div class="flex items-center gap-2">
            <Label class="flex w-20 shrink-0 items-center gap-1 text-xs" for="export-selector">
              Selector
              <InfoHint
                title="Selector"
                wide
                text="Where the light-mode custom properties are declared. `:root` puts them on the document so everything inherits them. Scope them to a class instead when the palette applies to one region of a page rather than the whole app."
              />
            </Label>
            <Input
              id="export-selector"
              :model-value="config.selector"
              class="h-8 flex-1 font-mono text-xs"
              placeholder=":root"
              @update:model-value="patch({ selector: String($event) })"
            />
          </div>

          <div class="flex items-center gap-2">
            <Label class="flex w-20 shrink-0 items-center gap-1 text-xs">
              Order
              <InfoHint
                title="Token order"
                wide
                text="Palette order matches the strip, which is what makes the export easy to check against what you see. Alphabetical is friendlier to code review because a diff stays local when a color is added. Lightness order groups the light surfaces together and reads well in a design handoff."
              />
            </Label>
            <Select
              :model-value="config.sortBy"
              @update:model-value="patch({ sortBy: $event as ExportConfig['sortBy'] })"
            >
              <SelectTrigger size="sm" class="flex-1" aria-label="Token order">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="palette">Palette order</SelectItem>
                <SelectItem value="name">Alphabetical</SelectItem>
                <SelectItem value="lightness">Light to dark</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="flex items-center gap-2">
            <Label class="flex flex-1 items-center gap-1 text-xs" for="export-comments">
              Comments
              <InfoHint
                title="Comments"
                wide
                text="Writes a header and a note beside each token saying which color it came from. Helpful in a file a human will open, noise in one a build step consumes."
              />
            </Label>
            <Switch
              id="export-comments"
              :model-value="config.includeComments"
              @update:model-value="patch({ includeComments: $event })"
            />
          </div>

          <div class="flex items-center gap-2">
            <Label class="flex flex-1 items-center gap-1 text-xs" for="export-contrast">
              Contrast notes
              <InfoHint
                title="Contrast notes"
                wide
                text="Annotates each token with its WCAG ratio and APCA Lc against white. It makes the file considerably longer, and it is the single most useful thing you can hand a developer who has to decide what to put text on."
              />
            </Label>
            <Switch
              id="export-contrast"
              :model-value="config.includeContrast"
              @update:model-value="patch({ includeContrast: $event })"
            />
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>

    <!-- ─────────── Output ─────────── -->
    <section class="flex flex-col gap-2 rounded-lg border bg-card/40 p-2.5">
      <div class="flex items-center gap-2">
        <Label class="text-xs">{{ emitter.label }}</Label>
        <span class="flex-1" />
        <span class="font-mono text-[10px] text-muted-foreground tabular-nums">
          {{ result.tokens }} tokens · {{ byteLabel }}
        </span>
      </div>

      <p v-if="result.error" class="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-[11px] leading-snug text-destructive">
        {{ result.error }}
      </p>

      <!--
        A rename is not a detail to keep to ourselves. Two colors that expand
        to the same variable — "Blue 500" beside the 500 step of "Blue" — used
        to overwrite one another silently; saying which one moved is the
        difference between a puzzle and a decision.
      -->
      <p
        v-if="result.renames && result.renames.length"
        class="rounded-md border border-warning/40 bg-warning/10 p-2 text-[11px] leading-snug text-warning"
      >
        {{ result.renames.length }} variable{{ result.renames.length === 1 ? '' : 's' }} would have
        collided and {{ result.renames.length === 1 ? 'was' : 'were' }} renamed:
        <span v-for="(rename, index) in result.renames" :key="rename.to" class="font-mono">
          {{ index ? ', ' : '' }}{{ rename.from }} → {{ rename.to }}
        </span>
      </p>

      <pre
        v-if="!result.error"
        class="scroll-slim max-h-72 overflow-auto rounded-md border bg-background/60 p-2 font-mono text-[10px] leading-relaxed"
        :data-language="emitter.language"
      >{{ result.text }}</pre>

      <div class="flex gap-2">
        <Button class="flex-1" :disabled="!result.text" @click="copy">
          <Check v-if="copied" />
          <Copy v-else />
          {{ copied ? 'Copied' : 'Copy' }}
        </Button>
        <!--
          `shrink` overrides the button's own `shrink-0` — they are the same
          tailwind-merge group, so `min-w-0` alone would not have done it. A
          palette with an ordinary name produces a filename long enough to push
          the button out of the card and under the edge of the sidebar.
        -->
        <Button
          variant="outline"
          class="min-w-0 shrink"
          :disabled="!result.text"
          :title="`Download ${fileName}`"
          @click="download"
        >
          <Download /> <span class="truncate">{{ fileName }}</span>
        </Button>
      </div>
    </section>
  </div>
</template>
