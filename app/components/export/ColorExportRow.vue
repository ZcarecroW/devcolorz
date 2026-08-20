<script setup lang="ts">
/**
 * One color's export overrides.
 *
 * The three variant toggles are tri-state on purpose. "Follow the global
 * setting" and "off" are different answers, and a plain switch would collapse
 * them — pinning a color to whatever the panel happened to say the moment you
 * glanced at it. Here a chip stays on `auto` until you deliberately move it.
 */
import { computed } from 'vue'
import { Eye, EyeOff, RotateCcw, X } from '@lucide/vue'
import InfoHint from '@/components/common/InfoHint.vue'
import { Input } from '@/components/ui/input'
import { formatColor, parseColor } from '@/lib/color/convert'
import type { Oklch, Swatch } from '@/lib/color/types'
import type { ColorOverride } from '@/lib/export/config'

const props = defineProps<{
  swatch: Swatch
  /** What is stored for this swatch today, or undefined when it follows the globals. */
  override: ColorOverride | undefined
  /** The global switches, so each chip can show what `auto` currently resolves to. */
  defaults: { alpha: boolean; dark: boolean; scale: boolean }
  /** The variable this swatch will emit, or null when it is excluded. */
  tokenName: string | null
  /** The dark counterpart the current strategy produces, used as the picker's starting point. */
  computedDark: Oklch | null
}>()

const emit = defineEmits<{
  (e: 'update', value: ColorOverride): void
}>()

type VariantKey = 'alpha' | 'dark' | 'scale'

const VARIANT_LABELS: Record<VariantKey, string> = {
  alpha: 'Alpha',
  dark: 'Dark',
  scale: 'Scale',
}

const VARIANT_HINTS: Record<VariantKey, string> = {
  alpha: 'Emit the transparent ladder for this color. Worth turning off for colors that only ever appear as flat fills — every step is another variable your stylesheet has to carry.',
  dark: 'Emit a dark-mode counterpart for this color. Turn it off for anything already mode-agnostic, such as a mid-lightness brand accent that reads on either background, so the dark block does not restate a value that never changes.',
  scale: 'Emit a full tonal scale from this color. A scale is eleven or twelve tokens, so switching it on for every swatch in a ten-color palette produces well over a hundred variables.',
}

const lightCss = computed(() => formatColor(props.swatch.color, 'oklch'))

const excluded = computed(() => Boolean(props.override?.exclude))

const hasOverride = computed(() => Object.keys(props.override ?? {}).length > 0)

/** Label shown when the user has not typed an export name of their own. */
const placeholder = computed(() => props.swatch.name || 'inherit name')

const variants = computed(() =>
  (Object.keys(VARIANT_LABELS) as VariantKey[]).map((key) => {
    const explicit = props.override?.[key]
    return {
      key,
      label: VARIANT_LABELS[key],
      hint: VARIANT_HINTS[key],
      explicit,
      effective: explicit ?? props.defaults[key],
    }
  }),
)

const darkOn = computed(() => props.override?.dark ?? props.defaults.dark)
const darkPinned = computed(() => Boolean(props.override?.darkColor))
const darkHex = computed(() =>
  formatColor(props.override?.darkColor ?? props.computedDark ?? props.swatch.color, 'hex'),
)

function next(): ColorOverride {
  return { ...props.override }
}

function setName(value: string) {
  const patch = next()
  if (value.trim()) patch.name = value
  else delete patch.name
  emit('update', patch)
}

/** auto → on → off → auto. */
function cycle(key: VariantKey) {
  const patch = next()
  const current = props.override?.[key]
  if (current === undefined) patch[key] = true
  else if (current) patch[key] = false
  else delete patch[key]
  emit('update', patch)
}

function toggleExclude() {
  const patch = next()
  if (patch.exclude) delete patch.exclude
  else patch.exclude = true
  emit('update', patch)
}

function pickDark(event: Event) {
  const parsed = parseColor((event.target as HTMLInputElement).value)
  if (!parsed) return
  const patch = next()
  patch.darkColor = parsed
  emit('update', patch)
}

function unpinDark() {
  const patch = next()
  delete patch.darkColor
  emit('update', patch)
}

function stateLabel(explicit: boolean | undefined, effective: boolean): string {
  if (explicit === undefined) return effective ? 'auto · on' : 'auto · off'
  return explicit ? 'on' : 'off'
}
</script>

<template>
  <div
    class="rounded-md border bg-card/40 p-2 transition-opacity"
    :class="excluded && 'opacity-50'"
  >
    <div class="flex items-center gap-2">
      <span
        class="size-5 shrink-0 rounded-sm border"
        :style="{ background: lightCss }"
        :title="lightCss"
      />
      <Input
        :model-value="props.override?.name ?? ''"
        :placeholder="placeholder"
        class="h-7 min-w-0 flex-1 px-2 text-xs"
        :aria-label="`Export name for ${props.swatch.name || lightCss}`"
        @update:model-value="setName(String($event))"
      />
      <button
        type="button"
        class="inline-flex size-6 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        :class="excluded && 'border-destructive/50 text-destructive'"
        :aria-pressed="excluded"
        :aria-label="excluded ? 'Include this color in the export' : 'Leave this color out of the export'"
        :title="excluded ? 'Excluded — click to include' : 'Exclude from the export'"
        @click="toggleExclude"
      >
        <EyeOff v-if="excluded" class="size-3.5" />
        <Eye v-else class="size-3.5" />
      </button>
      <button
        v-if="hasOverride"
        type="button"
        class="inline-flex size-6 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label="Clear this color's overrides"
        title="Back to the global settings"
        @click="emit('update', {})"
      >
        <RotateCcw class="size-3.5" />
      </button>
    </div>

    <p class="mt-1 truncate font-mono text-[10px] text-muted-foreground">
      {{ props.tokenName ?? 'not exported' }}
    </p>

    <div class="mt-1.5 flex flex-wrap items-center gap-1">
      <template v-for="variant in variants" :key="variant.key">
        <button
          type="button"
          class="rounded-full border px-2 py-0.5 text-[10px] leading-4 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          :class="
            variant.explicit === undefined
              ? 'border-dashed text-muted-foreground hover:text-foreground'
              : variant.effective
                ? 'border-primary bg-primary/15 text-primary'
                : 'border-border bg-muted text-muted-foreground line-through'
          "
          :aria-pressed="variant.explicit === undefined ? 'mixed' : variant.explicit"
          :aria-label="`${variant.label} for this color: ${stateLabel(variant.explicit, variant.effective)}`"
          :title="`${variant.label}: ${stateLabel(variant.explicit, variant.effective)} — click to change`"
          @click="cycle(variant.key)"
        >
          {{ variant.label }}
        </button>
        <InfoHint :title="variant.label" :text="variant.hint" wide />
      </template>

      <span class="flex-1" />

      <label
        v-if="darkOn"
        class="inline-flex items-center gap-1"
        :title="darkPinned ? 'Hand-picked dark value' : 'Dark value the strategy computed — pick to override it'"
      >
        <span class="sr-only">Dark value for this color</span>
        <input
          type="color"
          class="size-5 cursor-pointer rounded-sm border bg-transparent p-0"
          :class="darkPinned && 'ring-2 ring-primary'"
          :value="darkHex"
          @input="pickDark"
        />
      </label>
      <button
        v-if="darkOn && darkPinned"
        type="button"
        class="inline-flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label="Go back to the computed dark value"
        title="Back to the computed dark value"
        @click="unpinDark"
      >
        <X class="size-3" />
      </button>
    </div>
  </div>
</template>
