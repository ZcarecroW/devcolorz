<script setup lang="ts">
/**
 * The accessibility lab.
 *
 * Everything here is measured against the palette as it stands rather than
 * against a set of recommended colours, because the useful question is not
 * "is this color accessible" — no color is — but "which of my pairs fail, and
 * what is the smallest edit that fixes them". So every finding comes with the
 * edit attached: a contrast repair from the matrix, a hue-and-lightness nudge
 * from the collision list.
 */
import { computed, ref, watch } from 'vue'
import { ArrowLeftRight, Eye } from '@lucide/vue'
import ContrastMatrix from '@/components/a11y/ContrastMatrix.vue'
import InfoHint from '@/components/common/InfoHint.vue'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { css } from '@/lib/color/convert'
import { METRIC_HINTS, score, type ContrastMetric } from '@/lib/color/contrast'
import {
  CVD_AUDIT_SET,
  CVD_TYPES,
  cvdSafetyScore,
  findCollisions,
  simulate,
  simulatePalette,
  type CvdCollision,
  type CvdType,
} from '@/lib/color/cvd'
import { deltaEOK, maxChroma } from '@/lib/color/gamut'
import { usePaletteStore } from '@/stores/palette'
import { useStudioStore } from '@/stores/studio'
import type { Oklch } from '@/lib/color/types'

const palette = usePaletteStore()
const studio = useStudioStore()

const METRICS: Array<{ id: ContrastMetric; label: string }> = [
  { id: 'wcag', label: 'WCAG 2.x' },
  { id: 'apca', label: 'APCA' },
]

/* ---------------- contrast summary ---------------- */

const bodyTarget = computed(() => (studio.metric === 'apca' ? 75 : 4.5))
const uiTarget = computed(() => (studio.metric === 'apca' ? 45 : 3))

/**
 * Ordered pairs, not combinations. APCA is directional — light-on-dark and
 * dark-on-light score differently — so "A on B" and "B on A" are two separate
 * questions and both need counting.
 */
const pairs = computed(() => {
  const colors = palette.colors
  const out: Array<{ text: number; background: number; value: number }> = []
  for (let i = 0; i < colors.length; i++) {
    for (let j = 0; j < colors.length; j++) {
      if (i === j) continue
      out.push({ text: i, background: j, value: score(colors[i], colors[j], studio.metric) })
    }
  }
  return out
})

const bodyPasses = computed(() => pairs.value.filter((p) => p.value >= bodyTarget.value).length)
const uiPasses = computed(() => pairs.value.filter((p) => p.value >= uiTarget.value).length)

const worst = computed(() => {
  let found: { text: number; background: number; value: number } | null = null
  for (const pair of pairs.value) {
    if (!found || pair.value < found.value) found = pair
  }
  return found
})

function formatScore(value: number): string {
  return studio.metric === 'wcag' ? `${value.toFixed(2)}:1` : `Lc ${Math.round(value)}`
}

function labelAt(index: number): string {
  const swatch = palette.swatches[index]
  return swatch ? palette.labelFor(swatch) : ''
}

function applyFix(id: string, color: Oklch) {
  palette.setColor(id, color, 'Fix contrast')
}

/* ---------------- colour vision ---------------- */

const authored = computed(() => palette.colors.map((c) => css(c)))

const audits = computed(() =>
  CVD_AUDIT_SET.map((id) => ({
    id,
    def: CVD_TYPES[id],
    strip: simulatePalette(palette.colors, id).map((c) => css(c)),
  })),
)

const safety = computed(() => cvdSafetyScore(palette.colors))

const safetyVerdict = computed(() => {
  if (palette.count < 2) return 'Add a second color and this starts measuring something.'
  const value = safety.value
  if (value === 100)
    return 'Every pair that is distinct to normal vision stays distinct under all five simulations. Color can safely carry meaning in this palette.'
  if (value >= 85)
    return 'Almost everything survives. Check the collisions below and decide whether those two colors ever appear next to each other in your interface.'
  if (value >= 60)
    return 'A real share of your pairs collapse. Anything that means something by hue alone — status, series, categories — needs a second cue such as a shape or a label.'
  if (value >= 30)
    return 'Most pairs collapse somewhere in the audit. The fix is usually lightness: spread the colors apart in L rather than around the hue wheel.'
  return 'Color communicates almost nothing here once a deficiency is applied. Rebuild the palette around lightness contrast.'
})

/** Which simulation the studio switch turns on. */
const chosen = ref<CvdType>(studio.cvd === 'none' ? 'deuteranomaly' : studio.cvd)

// The toolbar and the command palette set the simulation too. Read once at
// mount, this label kept naming the deficiency picked here after the toolbar
// had switched to another, and flicking the switch off and on brought the
// stale one back in place of the toolbar's choice.
watch(
  () => studio.cvd,
  (id) => {
    if (id !== 'none') chosen.value = id
  },
)

const simulating = computed({
  get: () => studio.cvd !== 'none',
  set: (on: boolean) => {
    studio.cvd = on ? chosen.value : 'none'
  },
})

function viewThrough(id: CvdType) {
  chosen.value = id
  studio.cvd = studio.cvd === id ? 'none' : id
}

/* ---------------- collisions ---------------- */

const COLLISION_LIMIT = 12

const collisions = computed(() => findCollisions(palette.colors))
const shownCollisions = computed(() => collisions.value.slice(0, COLLISION_LIMIT))

/**
 * Push the second colour of a colliding pair away from the first.
 *
 * Four candidates — hue ±25°, lightness ±0.08 — scored under the deficiency
 * that caused the collision, and the best one wins. Rotating hue alone is not
 * enough: under deuteranopia most of the wheel maps onto one axis, so the
 * lightness move is usually what actually separates them.
 */
function nudgeApart(collision: CvdCollision) {
  const target = palette.swatches[collision.b]
  const reference = palette.colors[collision.a]
  if (!target || !reference) return

  const hue = target.color.h ?? 0
  const lightness = target.color.l ?? 0.5
  const chroma = target.color.c ?? 0
  const seen = simulate(reference, collision.type)

  let best: Oklch | null = null
  let bestDistance = -Infinity
  for (const hueStep of [25, -25]) {
    for (const lightnessStep of [0.08, -0.08]) {
      const l = Math.min(0.98, Math.max(0.02, lightness + lightnessStep))
      const h = (((hue + hueStep) % 360) + 360) % 360
      const candidate: Oklch = { mode: 'oklch', l, c: Math.min(chroma, maxChroma(l, h)), h }
      const distance = deltaEOK(simulate(candidate, collision.type), seen)
      if (distance > bestDistance) {
        bestDistance = distance
        best = candidate
      }
    }
  }
  if (best) palette.setColor(target.id, best, 'Nudge apart')
}
</script>

<template>
  <div class="flex min-h-0 flex-col gap-3">
    <!-- Metric -->
    <div class="rounded-lg border bg-card/40 p-2.5">
      <div class="mb-2 flex items-center gap-1">
        <Label class="text-xs">Contrast metric</Label>
        <InfoHint title="Why both metrics" wide>
          <p class="text-xs leading-relaxed text-muted-foreground">
            The two disagree, and both disagreements matter. Design against APCA, then confirm you
            still clear WCAG.
          </p>
          <p class="mt-2 text-xs leading-relaxed text-muted-foreground">
            <span class="font-medium text-popover-foreground">WCAG 2.x</span> —
            {{ METRIC_HINTS.wcag }}
          </p>
          <p class="mt-2 text-xs leading-relaxed text-muted-foreground">
            <span class="font-medium text-popover-foreground">APCA</span> — {{ METRIC_HINTS.apca }}
          </p>
        </InfoHint>
      </div>
      <div class="grid grid-cols-2 gap-1.5">
        <button
          v-for="metric in METRICS"
          :key="metric.id"
          type="button"
          class="rounded-md border px-2 py-1.5 text-xs transition-colors"
          :class="
            studio.metric === metric.id
              ? 'border-primary bg-primary/10 text-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          "
          :aria-pressed="studio.metric === metric.id"
          @click="studio.metric = metric.id"
        >
          {{ metric.label }}
        </button>
      </div>
    </div>

    <!-- Summary -->
    <div class="rounded-lg border bg-card/40 p-2.5">
      <p v-if="!pairs.length" class="text-[11px] text-muted-foreground">
        One color has nothing to contrast against. Add another.
      </p>
      <template v-else>
        <p class="text-xs leading-relaxed">
          <span class="font-mono font-medium tabular-nums">{{ bodyPasses }}</span>
          of
          <span class="font-mono tabular-nums">{{ pairs.length }}</span>
          combinations carry body text,
          <span class="font-mono font-medium tabular-nums">{{ uiPasses }}</span>
          carry UI and large text.
        </p>
        <p v-if="worst" class="mt-1 text-[11px] text-muted-foreground">
          Weakest pair: {{ labelAt(worst.text) }} on {{ labelAt(worst.background) }} at
          {{ formatScore(worst.value) }}.
        </p>
      </template>
    </div>

    <!-- Matrix -->
    <div v-if="palette.count > 1" class="rounded-lg border bg-card/40 p-2.5">
      <ContrastMatrix :swatches="palette.swatches" :metric="studio.metric" @fix="applyFix" />
    </div>

    <!-- Colour-blind safety -->
    <div class="flex items-start gap-3 rounded-lg border bg-card/40 p-3">
      <div class="flex w-12 shrink-0 flex-col items-center">
        <span class="text-4xl leading-none font-semibold tabular-nums">{{ safety }}</span>
        <span class="mt-1 text-[10px] text-muted-foreground">of 100</span>
      </div>
      <div class="min-w-0 flex-1">
        <p class="flex items-center gap-1 text-xs font-medium">
          Color-blind safety
          <InfoHint
            title="How the score is calculated"
            wide
            text="Of the pairs that a person with normal vision can tell apart, this is the percentage that stay distinguishable under all five audited deficiencies. Pairs that were already near-identical are excluded, because that is a palette problem rather than a color-vision one. It is a blunt number by design: it tells you whether to worry, and the list below tells you where."
          />
        </p>
        <p class="mt-1 text-[11px] leading-snug text-muted-foreground">{{ safetyVerdict }}</p>
      </div>
    </div>

    <!-- Studio-wide simulation -->
    <div class="flex items-center gap-2 rounded-lg border bg-card/40 p-2.5">
      <Label for="simulate-studio" class="flex min-w-0 flex-1 items-center gap-1 text-xs">
        Simulate the whole studio
        <InfoHint
          title="Studio-wide simulation"
          wide
          text="Applies the simulation as an SVG color matrix over the palette strip and every preview, so you are judging the real interface rather than a thumbnail of it. The filter runs in linear light, which is why what you see matches the strips below. Nothing about the palette changes — this alters what you see, not what you export."
        />
      </Label>
      <span v-if="simulating" class="truncate text-[11px] text-muted-foreground">
        {{ CVD_TYPES[chosen].label }}
      </span>
      <Switch id="simulate-studio" v-model="simulating" />
    </div>

    <!-- CVD audit -->
    <div class="flex flex-col gap-1.5">
      <div
        v-for="audit in audits"
        :key="audit.id"
        class="rounded-lg border bg-card/40 p-2.5"
        :class="studio.cvd === audit.id ? 'border-primary/60' : ''"
      >
        <div class="mb-2 flex items-center gap-1.5">
          <span class="text-xs font-medium">{{ audit.def.label }}</span>
          <span class="text-[10px] text-muted-foreground">{{ audit.def.prevalence }}</span>
          <InfoHint :title="audit.def.label" :text="audit.def.hint" wide side="right" />
          <span class="flex-1" />
          <Button
            variant="ghost"
            size="icon-xs"
            :aria-label="`View the studio through ${audit.def.label}`"
            :aria-pressed="studio.cvd === audit.id"
            :title="`View the studio through ${audit.def.label}`"
            :class="studio.cvd === audit.id ? 'text-primary' : ''"
            @click="viewThrough(audit.id)"
          >
            <Eye />
          </Button>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <p class="mb-1 text-[10px] tracking-wide text-muted-foreground uppercase">Authored</p>
            <div class="flex h-6 overflow-hidden rounded-md">
              <span
                v-for="(color, index) in authored"
                :key="index"
                class="flex-1"
                :style="{ background: color }"
              />
            </div>
          </div>
          <div>
            <p class="mb-1 text-[10px] tracking-wide text-muted-foreground uppercase">Simulated</p>
            <div class="flex h-6 overflow-hidden rounded-md">
              <span
                v-for="(color, index) in audit.strip"
                :key="index"
                class="flex-1"
                :style="{ background: color }"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Collisions -->
    <div class="rounded-lg border bg-card/40 p-2.5">
      <div class="mb-2 flex items-center gap-1">
        <Label class="text-xs">Collisions</Label>
        <InfoHint
          title="What counts as a collision"
          wide
          text="Two colors that a person with normal vision reads as clearly different, but that land within ΔEOK 5 of each other under one of the audited deficiencies. Pairs that were already close are left out. The nudge moves the second color's hue by 25 degrees and its lightness by 0.08, in whichever combination pulls it furthest away under that specific deficiency."
        />
        <span class="flex-1" />
        <span class="text-[10px] text-muted-foreground tabular-nums">{{ collisions.length }}</span>
      </div>

      <p v-if="!collisions.length" class="text-[11px] leading-snug text-muted-foreground">
        Nothing collapses. Every pair that is distinct now stays distinct through all five
        simulations.
      </p>

      <ul v-else class="flex flex-col gap-1.5">
        <li
          v-for="collision in shownCollisions"
          :key="`${collision.type}-${collision.a}-${collision.b}`"
          class="flex items-center gap-2 rounded-md border bg-background/40 p-1.5"
        >
          <span class="flex shrink-0">
            <span
              class="size-5 rounded-l-sm"
              :style="{ background: authored[collision.a] }"
              :title="labelAt(collision.a)"
            />
            <span
              class="size-5 rounded-r-sm"
              :style="{ background: authored[collision.b] }"
              :title="labelAt(collision.b)"
            />
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-[11px] leading-tight">
              {{ labelAt(collision.a) }} and {{ labelAt(collision.b) }}
            </p>
            <p class="truncate text-[10px] leading-tight text-muted-foreground">
              {{ CVD_TYPES[collision.type].label }} · ΔE
              <span class="tabular-nums">{{ collision.originalDistance.toFixed(0) }}</span>
              →
              <span class="tabular-nums">{{ collision.distance.toFixed(1) }}</span>
            </p>
          </div>
          <Button
            variant="outline"
            size="xs"
            :title="`Move ${labelAt(collision.b)} away from ${labelAt(collision.a)}`"
            @click="nudgeApart(collision)"
          >
            <ArrowLeftRight /> Nudge
          </Button>
        </li>
      </ul>

      <p
        v-if="collisions.length > shownCollisions.length"
        class="mt-2 text-[10px] text-muted-foreground"
      >
        {{ collisions.length - shownCollisions.length }} more, ordered by how far they collapse.
      </p>
    </div>
  </div>
</template>
