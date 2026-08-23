<script setup lang="ts">
/**
 * A terminal session: prompt, streamed output, a warning, an error and a
 * success line.
 *
 * The decision worth knowing: this is the only template that puts
 * `--p-success`, `--p-warning` and `--p-danger` on the same surface, in the
 * same weight, within a few lines of each other. Status colors are usually
 * separated by icons and cards, which hides the case where a palette has no
 * red and the role solver had to invent one.
 */
import { computed } from 'vue'
import { Ellipsis, SquareTerminal } from '@lucide/vue'
import InfoHint from '@/components/common/InfoHint.vue'
import type { RoleMap } from '@/lib/color/roles'
import type { Oklch } from '@/lib/color/types'

const props = defineProps<{ roles: RoleMap; colors: Oklch[] }>()

const rampCount = computed(() => Math.max(1, props.roles.ramp.length))
function ramp(index: number): string {
  const n = rampCount.value
  return `var(--p-ramp-${(((index % n) + n) % n) + 1})`
}

type LineKind = 'prompt' | 'out' | 'dim' | 'warn' | 'error' | 'ok' | 'listing'

interface Line {
  kind: LineKind
  text?: string
  /** `listing` lines render as colored filenames rather than a string. */
  entries?: string[]
}

const session: Line[] = [
  { kind: 'prompt', text: 'ls app/lib/color' },
  {
    kind: 'listing',
    entries: ['convert.ts', 'contrast.ts', 'gamut.ts', 'roles.ts', 'scale.ts', 'cvd.ts'],
  },
  { kind: 'prompt', text: 'npm run build' },
  { kind: 'dim', text: '> devcolorz@0.1.0 build' },
  { kind: 'dim', text: '> vue-tsc -b --noEmit && vite build' },
  { kind: 'out', text: 'transforming modules ................ 412/412' },
  { kind: 'warn', text: 'warn  chunk "color-names" is 284 kB after minification' },
  { kind: 'warn', text: '      consider dynamic import() to split it out' },
  { kind: 'error', text: 'error  roles.ts:214  primary and accent differ by ΔEOK 0.041' },
  { kind: 'dim', text: '       contrast gate requires 0.06 — see docs/CONVENTIONS.md' },
  { kind: 'out', text: 'retrying with derive=1 ...' },
  { kind: 'ok', text: '✓ 412 modules transformed in 1.84s' },
  { kind: 'ok', text: '✓ build complete — dist/ 218 kB gzipped' },
]

function colorFor(kind: LineKind): string {
  switch (kind) {
    case 'warn':
      return 'var(--p-warning)'
    case 'error':
      return 'var(--p-danger)'
    case 'ok':
      return 'var(--p-success)'
    case 'dim':
      return 'var(--p-text-muted)'
    default:
      return 'var(--p-text)'
  }
}
</script>

<template>
  <div
    class="@container w-full p-4 @xl:p-8"
    :style="{ background: 'var(--p-surface-alt)', color: 'var(--p-text)' }"
  >
    <div
      class="mx-auto max-w-3xl overflow-hidden rounded-xl shadow-2xl"
      :style="{ background: 'var(--p-background)', boxShadow: 'inset 0 0 0 1px var(--p-border)' }"
    >
      <!-- Window chrome -->
      <div
        class="flex items-center gap-2 border-b px-3 py-2"
        :style="{ borderColor: 'var(--p-border)', background: 'var(--p-surface)' }"
      >
        <span class="flex gap-1.5">
          <span class="size-2.5 rounded-full" :style="{ background: 'var(--p-danger)' }" />
          <span class="size-2.5 rounded-full" :style="{ background: 'var(--p-warning)' }" />
          <span class="size-2.5 rounded-full" :style="{ background: 'var(--p-success)' }" />
        </span>
        <span
          class="flex flex-1 items-center justify-center gap-1.5 text-[11px]"
          :style="{ color: 'var(--p-text-muted)' }"
        >
          <SquareTerminal class="size-3.5" />
          <span class="truncate font-mono">zsh — devcolorz — 96×28</span>
        </span>
        <InfoHint
          title="Three status colors, one surface"
          wide
          class="text-[color:var(--p-text-muted)] hover:text-[color:var(--p-text)]"
          text="Everywhere else in a product the success, warning and danger colors are separated by cards and icons, which papers over a weak assignment. Stacked as plain text a few lines apart, they have to carry meaning on hue and lightness alone. If the warning and error lines read as the same color here, the palette had no red or no yellow and the role solver invented one — check the roles panel before you ship it."
        />
        <Ellipsis class="size-3.5" :style="{ color: 'var(--p-text-muted)' }" />
      </div>

      <!-- Session -->
      <div class="overflow-x-auto px-3 py-3 font-mono text-[11px] leading-5">
        <div v-for="(line, i) in session" :key="i" class="whitespace-pre">
          <template v-if="line.kind === 'prompt'">
            <span :style="{ color: 'var(--p-success)' }">ana</span>
            <span :style="{ color: 'var(--p-text-muted)' }">@</span>
            <span :style="{ color: 'var(--p-info)' }">studio</span>
            <span :style="{ color: 'var(--p-text-muted)' }"> ~/devcolorz </span>
            <span :style="{ color: 'var(--p-accent)' }">$ </span>
            <span :style="{ color: 'var(--p-text)' }">{{ line.text }}</span>
          </template>
          <!--
            The filename is painted in the text role, not in a ramp step. A
            ramp step *is* the background at one end of any palette, so the
            first filenames in a listing rendered in exactly the surface colour
            and disappeared. The ramp still identifies the file — it just does
            it with a dot beside the name rather than with the name itself.
          -->
          <template v-else-if="line.kind === 'listing'">
            <span
              v-for="(entry, e) in line.entries"
              :key="entry"
              :style="{ color: 'var(--p-text)' }"
              ><span
                class="mr-1 inline-block size-1.5 rounded-full align-middle"
                :style="{ background: ramp(e) }"
              />{{ entry }}<span v-if="e < (line.entries?.length ?? 0) - 1">  </span></span
            >
          </template>
          <template v-else>
            <span :style="{ color: colorFor(line.kind) }">{{ line.text }}</span>
          </template>
        </div>

        <!-- Live prompt with a cursor -->
        <div class="whitespace-pre">
          <span :style="{ color: 'var(--p-success)' }">ana</span>
          <span :style="{ color: 'var(--p-text-muted)' }">@</span>
          <span :style="{ color: 'var(--p-info)' }">studio</span>
          <span :style="{ color: 'var(--p-text-muted)' }"> ~/devcolorz </span>
          <span :style="{ color: 'var(--p-accent)' }">$ </span>
          <span
            class="inline-block h-3 w-[7px] translate-y-px animate-pulse"
            :style="{ background: 'var(--p-text)' }"
          />
        </div>
      </div>

      <!-- Status strip -->
      <div
        class="flex items-center gap-3 border-t px-3 py-1.5 text-[10px]"
        :style="{
          borderColor: 'var(--p-border)',
          background: 'var(--p-surface)',
          color: 'var(--p-text-muted)',
        }"
      >
        <span>exit 0</span>
        <span class="flex-1" />
        <span class="tabular-nums">1.84s</span>
        <span class="hidden @lg:inline">node 22.11</span>
      </div>
    </div>
  </div>
</template>
