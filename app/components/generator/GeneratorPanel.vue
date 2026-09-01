<script setup lang="ts">
/**
 * The range panel.
 *
 * The idea Coolors never had: instead of pressing space and hoping, you
 * describe the region of a colour space you want, and every roll lands inside
 * it. The preview grid underneath re-rolls as you drag, so you can see the
 * character of a setting before you commit a palette to it.
 */
import { computed, ref, watch } from 'vue'
import { Dices, RotateCcw, Shuffle, Sparkles, Wand2 } from '@lucide/vue'
import { refDebounced } from '@vueuse/core'
import ChannelRangeRow from '@/components/generator/ChannelRangeRow.vue'
import InfoHint from '@/components/common/InfoHint.vue'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatColor } from '@/lib/color/convert'
import { GAMUT_STRATEGY_HINTS, GAMUT_STRATEGY_LABELS } from '@/lib/color/gamut'
import { rangeMidpoint } from '@/lib/color/gradient'
import { previewSwatches, randomSeed } from '@/lib/color/random'
import { SPACES, SPACE_IDS, getSpace } from '@/lib/color/spaces'
import { allLockedNotice } from '@/lib/palette/notices'
import { usePaletteStore } from '@/stores/palette'
import type { ChannelConstraint, GamutStrategy, SpaceId } from '@/lib/color/types'

const palette = usePaletteStore()

const space = computed(() => getSpace(palette.constraints.space))

/** Every other channel's midpoint, so each track paints in context. */
const midpoints = computed(() => {
  const out: Record<string, number> = {}
  for (const channel of space.value.channels) {
    const constraint = palette.constraints.channels[channel.key]
    if (!constraint) continue
    out[channel.key] = constraint.locked
      ? constraint.value
      : rangeMidpoint(constraint.range.min, constraint.range.max, channel.cyclic, channel.max)
  }
  return out
})

/** Every channel's selected range, for working out what is actually reachable. */
const ranges = computed(() => {
  const out: Record<string, { min: number; max: number }> = {}
  for (const channel of space.value.channels) {
    const constraint = palette.constraints.channels[channel.key]
    if (constraint) out[channel.key] = constraint.range
  }
  return out
})

/** Channels pinned to one value, which narrows the reachability test. */
const fixedChannels = computed(() => {
  const out: Record<string, number> = {}
  for (const channel of space.value.channels) {
    const constraint = palette.constraints.channels[channel.key]
    if (constraint?.locked) out[channel.key] = constraint.value
  }
  return out
})

const previewSeed = ref(0x5eed)
const previewCount = ref(48)

/**
 * Debounced so dragging a thumb does not regenerate 48 gamut-mapped colours on
 * every pointer event, but fast enough that the grid still feels live.
 */
const constraintsSignal = computed(() => JSON.stringify(palette.constraints))
const debouncedSignal = refDebounced(constraintsSignal, 60)

/** The raw preview colors; the template renders their CSS form. */
const preview = computed(() => {
  void debouncedSignal.value
  return previewSwatches(
    { ...palette.constraints, seed: palette.constraints.seed ?? previewSeed.value },
    previewCount.value,
  )
})

const previewCss = computed(() => preview.value.map((c) => formatColor(c, 'oklch')))

function updateChannel(key: string, value: ChannelConstraint) {
  palette.constraints = {
    ...palette.constraints,
    channels: { ...palette.constraints.channels, [key]: value },
  }
}

function rerollPreview() {
  previewSeed.value = randomSeed()
}

/**
 * Drop a preview swatch into the palette. It replaces the first unlocked
 * colour, so clicking through the grid builds a palette without ever
 * overwriting something the user deliberately kept.
 */
function applyPreview(index: number) {
  const color = preview.value[index]
  if (!color) return
  // No fallback to swatches[0]: when every colour is locked there is no slot
  // the user has left writable, and overwriting one anyway contradicted the
  // lock that is still shown lit on that swatch.
  const target = palette.swatches.find((s) => !s.locked)
  if (!target) {
    allLockedNotice()
    return
  }
  palette.setColor(target.id, color, 'Pick from preview')
}

watch(
  () => palette.constraints.space,
  () => rerollPreview(),
)

const distinctness = computed({
  get: () => palette.constraints.minDistance,
  set: (value: number) => {
    palette.constraints = { ...palette.constraints, minDistance: value }
  },
})

/**
 * The seed field, as typed.
 *
 * Parsed on commit rather than on every keystroke: round-tripping each key
 * through `parseInt` rewrote "007" to "7" under the cursor and wiped a lone
 * "-" the moment it was typed, so a negative seed could only ever be pasted.
 * The same pattern the channel range boxes use.
 */
const seedDraft = ref(palette.constraints.seed === null ? '' : String(palette.constraints.seed))

watch(
  () => palette.constraints.seed,
  (seed) => {
    const shown = seed === null ? '' : String(seed)
    if (Number.parseInt(seedDraft.value, 10) !== seed || shown === '') seedDraft.value = shown
  },
)

function commitSeed() {
  const parsed = Number.parseInt(seedDraft.value.trim(), 10)
  const seed = Number.isFinite(parsed) ? parsed : null
  seedDraft.value = seed === null ? '' : String(seed)
  if (seed === palette.constraints.seed) return
  palette.constraints = { ...palette.constraints, seed }
}
</script>

<template>
  <div class="flex min-h-0 flex-col gap-3">
    <!-- Space selector -->
    <div class="flex items-center gap-2">
      <Label class="w-16 shrink-0 text-xs">Space</Label>
      <Select
        :model-value="palette.constraints.space"
        @update:model-value="palette.setSpace($event as SpaceId)"
      >
        <SelectTrigger size="sm" class="min-w-0 flex-1" aria-label="Color space">
          <SelectValue />
        </SelectTrigger>
        <SelectContent class="max-h-96">
          <SelectItem
            v-for="id in SPACE_IDS"
            :key="id"
            :value="id"
            :label="SPACES[id].label"
            :description="SPACES[id].description"
          >
            <template #badge>
              <span
                v-if="SPACES[id].perceptual"
                class="rounded-sm bg-primary/15 px-1 text-[9px] text-primary"
              >
                perceptual
              </span>
              <span
                v-if="SPACES[id].wideGamut"
                class="rounded-sm bg-muted px-1 text-[9px] text-muted-foreground"
              >
                wide gamut
              </span>
            </template>
          </SelectItem>
        </SelectContent>
      </Select>
      <InfoHint
        title="Which space?"
        wide
        :text="space.description"
      />
    </div>

    <!-- Channels -->
    <div class="flex flex-col gap-2">
      <ChannelRangeRow
        v-for="channel in space.channels"
        :key="channel.key"
        :space="palette.constraints.space"
        :channel="channel"
        :constraint="palette.constraints.channels[channel.key]"
        :others="midpoints"
        :ranges="ranges"
        :fixed="fixedChannels"
        @update="updateChannel(channel.key, $event)"
      />
    </div>

    <!-- Global constraints -->
    <div class="grid grid-cols-[minmax(0,1fr)] gap-2.5 rounded-lg border bg-card/40 p-2.5">
      <div class="flex items-center gap-2">
        <Label class="flex w-28 shrink-0 items-center gap-1 text-xs">
          Distinctness
          <InfoHint
            title="Minimum distance"
            wide
            text="How far apart generated colors must be, measured as ΔEOK — the perceptual distance used throughout this app. Around 8 keeps a palette readable; above 20 forces genuinely different hues. If the ranges are too tight to satisfy it, the requirement relaxes rather than hanging, so you always get a palette."
          />
        </Label>
        <input
          v-model.number="distinctness"
          type="range"
          class="h-4 min-w-0 flex-1 accent-primary"
          min="0"
          max="40"
          step="1"
          aria-label="Minimum perceptual distance"
        />
        <span class="w-8 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
          {{ distinctness }}
        </span>
      </div>

      <div class="flex items-center gap-2">
        <Label class="flex w-28 shrink-0 items-center gap-1 text-xs">
          Out of gamut
          <InfoHint
            title="Gamut mapping"
            wide
            :text="GAMUT_STRATEGY_HINTS[palette.constraints.gamut]"
          />
        </Label>
        <Select
          :model-value="palette.constraints.gamut"
          @update:model-value="
            palette.constraints = { ...palette.constraints, gamut: $event as GamutStrategy }
          "
        >
          <SelectTrigger size="sm" class="min-w-0 flex-1" aria-label="Gamut strategy">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="(label, id) in GAMUT_STRATEGY_LABELS"
              :key="id"
              :value="id"
              :label="label"
              :description="GAMUT_STRATEGY_HINTS[id]"
            />
          </SelectContent>
        </Select>
      </div>

      <div class="flex items-center gap-2">
        <Label class="flex w-28 shrink-0 items-center gap-1 text-xs">
          Seed
          <InfoHint
            title="Seed"
            wide
            text="Fix the random number generator so the same settings always produce the same palette. Leave it empty for fresh entropy on every roll. A seeded palette is reproducible from its share link, which is what makes 'here is the exact palette I got' possible."
          />
        </Label>
        <input
          v-model="seedDraft"
          class="min-w-0 flex-1 rounded-md border bg-background px-2 py-1 font-mono text-[11px] tabular-nums"
          placeholder="random"
          aria-label="Generator seed"
          inputmode="numeric"
          @blur="commitSeed"
          @keydown.enter.prevent="commitSeed"
        />
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="New seed"
          title="Roll a new seed"
          @click="palette.constraints = { ...palette.constraints, seed: randomSeed() }"
        >
          <Dices />
        </Button>
      </div>
    </div>

    <!-- Preview grid -->
    <div class="rounded-lg border bg-card/40 p-2.5">
      <div class="mb-2 flex items-center gap-2">
        <Label class="flex items-center gap-1 text-xs">
          Preview
          <InfoHint
            title="Live preview"
            wide
            text="A sample of what these settings actually produce, re-rolled as you drag. It uses a fixed seed so a small change to a range makes a small change to the grid, which is what lets you tune a setting rather than gamble on it. Click any swatch to drop it into the palette."
          />
        </Label>
        <span class="flex-1" />
        <Button variant="ghost" size="icon-xs" title="Re-roll the preview" @click="rerollPreview">
          <Shuffle />
        </Button>
      </div>
      <div class="grid grid-cols-12 gap-1">
        <button
          v-for="(color, index) in previewCss"
          :key="index"
          type="button"
          class="aspect-square rounded-sm ring-offset-1 ring-offset-card transition-transform hover:z-10 hover:scale-125 focus-visible:z-10 focus-visible:scale-125 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          :style="{ background: color }"
          :aria-label="`Use ${color}`"
          :title="color"
          @click="applyPreview(index)"
        />
      </div>
    </div>

    <div class="flex flex-wrap gap-2">
      <Button class="flex-1" @click="palette.roll() || allLockedNotice()">
        <Sparkles /> Generate
      </Button>
      <Button
        variant="outline"
        title="Derive ranges from the palette you already have — 'more like this'."
        @click="palette.learnConstraints()"
      >
        <Wand2 /> Learn from palette
      </Button>
      <Button variant="ghost" size="icon" title="Reset ranges" aria-label="Reset ranges" @click="palette.resetConstraints()">
        <RotateCcw />
      </Button>
    </div>
  </div>
</template>
