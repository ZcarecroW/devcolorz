<script setup lang="ts">
/**
 * Harmony schemes.
 *
 * The wheel selector is the part that matters. "Complementary" means one thing
 * on the RGB wheel and something quite different on the artist's wheel, and
 * every other tool silently picks one without telling you. Here it is a
 * visible, explained choice, and the previews update live so you can see what
 * the difference actually looks like.
 */
import { computed, ref } from 'vue'
import { Check } from '@lucide/vue'
import InfoHint from '@/components/common/InfoHint.vue'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { formatColor } from '@/lib/color/convert'
import {
  ANGLE_HARMONIES,
  HARMONY_HINTS,
  HARMONY_IDS,
  HARMONY_LABELS,
  WHEEL_HINTS,
  WHEEL_LABELS,
  harmony,
  type HarmonyId,
  type HueWheel,
} from '@/lib/color/harmony'
import { allLockedNotice } from '@/lib/palette/notices'
import { usePaletteStore } from '@/stores/palette'

const palette = usePaletteStore()

const wheel = ref<HueWheel>('ryb')
const angle = ref(30)
const vary = ref(true)
const anchorIndex = ref(0)

const anchor = computed(
  () => palette.swatches[Math.min(anchorIndex.value, palette.count - 1)] ?? palette.swatches[0],
)

/** Preview each scheme against the current anchor, at the current count. */
const schemes = computed(() =>
  HARMONY_IDS.map((id) => ({
    id,
    label: HARMONY_LABELS[id],
    hint: HARMONY_HINTS[id],
    colors: anchor.value
      ? harmony(anchor.value.color, id, {
          wheel: wheel.value,
          count: Math.max(2, Math.min(12, palette.count)),
          angle: angle.value,
          vary: vary.value,
        }).map((c) => formatColor(c, 'oklch'))
      : [],
  })),
)

const takesAngle = (id: HarmonyId) => ANGLE_HARMONIES.includes(id)

/** Named in the spread tooltip, so the scope is stated rather than implied. */
const angleSchemeNames = ANGLE_HARMONIES.map((id) => HARMONY_LABELS[id].toLowerCase()).join(' and ')

const spreadHint = computed(
  () =>
    'Only two schemes have a separation to set, and this controls both: the step between ' +
    'neighbours in an analogous set, and how far the two satellites sit from the complement in ' +
    'a split complementary. Every other scheme has fixed geometry — a triad is three points at ' +
    '120 degrees, and moving this would make it something other than a triad. The ' +
    angleSchemeNames +
    ' cards below update as you drag; the rest deliberately do not.',
)

function apply(id: HarmonyId) {
  // The anchor the user picked above, not whichever swatch happens to be
  // locked — the panel shows every preview built from that anchor, so applying
  // one from a different colour would not be the palette on screen.
  const applied = palette.applyHarmony(
    id,
    { wheel: wheel.value, angle: angle.value, vary: vary.value },
    anchor.value?.id,
  )
  if (!applied) allLockedNotice()
}
</script>

<template>
  <div class="flex min-h-0 flex-col gap-3">
    <div class="rounded-lg border bg-card/40 p-2.5">
      <div class="mb-2 flex items-center gap-1">
        <Label class="text-xs">Color wheel</Label>
        <InfoHint
          title="Which wheel?"
          wide
          text="Hue rotations happen on the wheel you pick here, and the wheels genuinely disagree. On the artist's RYB wheel blue's complement is orange; on the perceptual OKLCH wheel it is yellow. Neither is wrong — but if you say 'complementary' to a designer, they mean the first one."
        />
      </div>
      <div class="grid grid-cols-3 gap-1.5">
        <button
          v-for="(label, id) in WHEEL_LABELS"
          :key="id"
          type="button"
          class="rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors"
          :class="
            wheel === id
              ? 'border-primary bg-primary/10 text-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          "
          :title="WHEEL_HINTS[id]"
          :aria-pressed="wheel === id"
          @click="wheel = id as HueWheel"
        >
          {{ label }}
        </button>
      </div>
      <p class="mt-2 text-[11px] leading-snug text-muted-foreground">{{ WHEEL_HINTS[wheel] }}</p>
    </div>

    <div class="flex items-center gap-2 rounded-lg border bg-card/40 p-2.5">
      <Label class="w-16 shrink-0 text-xs">Anchor</Label>
      <div class="flex min-w-0 flex-1 flex-wrap gap-1">
        <button
          v-for="(swatch, index) in palette.swatches"
          :key="swatch.id"
          type="button"
          class="size-6 rounded-md ring-offset-2 ring-offset-card transition"
          :class="anchorIndex === index ? 'ring-2 ring-ring' : 'hover:scale-110'"
          :style="{ background: formatColor(swatch.color, 'oklch') }"
          :aria-label="`Use color ${index + 1} as the harmony anchor`"
          :aria-pressed="anchorIndex === index"
          @click="anchorIndex = index"
        />
      </div>
    </div>

    <div class="flex flex-col gap-2.5 rounded-lg border bg-card/40 p-2.5">
      <div class="flex items-center gap-2">
        <Label class="flex min-w-0 flex-1 items-center gap-1 text-xs">
          Vary tone
          <InfoHint
            title="Vary lightness and chroma"
            wide
            text="A harmony of pure hue rotations gives you colors of identical weight, which read as a swatch chart rather than a palette. This fans lightness and chroma outward from the anchor so the set has a natural hierarchy — one dominant color, the rest supporting."
          />
        </Label>
        <button
          type="button"
          role="switch"
          aria-label="Vary lightness and chroma across the scheme"
          :aria-checked="vary"
          class="relative h-5 w-9 shrink-0 rounded-full transition-colors"
          :class="vary ? 'bg-primary' : 'bg-input'"
          @click="vary = !vary"
        >
          <span
            class="absolute top-0.5 size-4 rounded-full bg-background transition-all"
            :class="vary ? 'left-4.5' : 'left-0.5'"
          />
        </button>
      </div>

      <div class="flex items-center gap-2">
        <Label for="harmony-spread" class="flex shrink-0 items-center gap-1 text-xs">
          Spread
          <InfoHint title="What spread changes" wide :text="spreadHint" />
        </Label>
        <input
          id="harmony-spread"
          v-model.number="angle"
          type="range"
          class="h-4 min-w-0 flex-1 accent-primary"
          min="8"
          max="90"
          step="1"
        />
        <span class="w-9 shrink-0 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
          {{ angle }}°
        </span>
      </div>
    </div>

    <!--
      The card is one target, but the explanation trigger is not inside it.
      A button inside a button is not valid HTML, and the click on the info
      icon reached the card underneath: opening the tooltip also applied the
      scheme and overwrote the palette. The card's own button is stretched
      behind the content instead, and only the trigger takes pointer events.
    -->
    <div class="flex flex-col gap-1.5">
      <div
        v-for="scheme in schemes"
        :key="scheme.id"
        class="group/scheme relative rounded-lg border bg-card/40 p-2 text-left transition-colors hover:border-primary/50 hover:bg-accent/40 focus-within:border-primary"
      >
        <button
          type="button"
          class="absolute inset-0 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          :aria-label="`Apply the ${scheme.label} scheme to the palette`"
          @click="apply(scheme.id)"
        />
        <div class="pointer-events-none relative mb-1.5 flex items-center gap-2">
          <span class="min-w-0 truncate text-xs font-medium">{{ scheme.label }}</span>
          <InfoHint
            class="pointer-events-auto"
            :title="scheme.label"
            :text="scheme.hint"
            wide
            side="right"
          />
          <span
            v-if="takesAngle(scheme.id)"
            class="shrink-0 rounded-sm bg-muted px-1 font-mono text-[9px] text-muted-foreground tabular-nums"
            title="Spread applies to this scheme"
          >
            {{ angle }}°
          </span>
          <span class="flex-1" />
          <Check class="size-3.5 shrink-0 opacity-0 transition group-hover/scheme:opacity-60" />
        </div>
        <div class="pointer-events-none relative flex h-7 overflow-hidden rounded-md">
          <span
            v-for="(color, index) in scheme.colors"
            :key="index"
            class="flex-1"
            :style="{ background: color }"
          />
        </div>
      </div>
    </div>

    <Button variant="outline" class="w-full" @click="palette.sortBy('hue')">
      Sort palette around the wheel
    </Button>
  </div>
</template>
