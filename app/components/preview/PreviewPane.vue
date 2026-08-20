<script setup lang="ts">
/**
 * The preview pane: picker, scheme and density controls, and the rendered
 * template.
 *
 * The decision the whole pane rests on: roles are solved once here and handed
 * down as CSS custom properties on a single wrapper, never as colors in props.
 * A template is therefore markup that reads `var(--p-*)` — it cannot disagree
 * with the role solver, it costs one file plus one registry row, and the grid
 * density can mount every template at once against the same variables.
 */
import { computed, defineAsyncComponent, ref, type Component } from 'vue'
import {
  CircleAlert,
  CircleCheck,
  LayoutGrid,
  Monitor,
  Moon,
  Square,
  Sun,
  TriangleAlert,
} from '@lucide/vue'
import { useElementSize } from '@vueuse/core'
import InfoHint from '@/components/common/InfoHint.vue'
import {
  PREVIEW_GROUPS,
  PREVIEW_TEMPLATES,
  type PreviewTemplate,
} from '@/components/preview/registry'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { formatColor } from '@/lib/color/convert'
import { apca, apcaVerdict, wcag, wcagLevel } from '@/lib/color/contrast'
import { assignRoles, auditRoles, rolesToCssVars, type RoleKey } from '@/lib/color/roles'
import { usePaletteStore } from '@/stores/palette'
import { useStudioStore } from '@/stores/studio'

const palette = usePaletteStore()
const studio = useStudioStore()

/**
 * The metric is deliberately not forwarded from the studio. `textTarget` and
 * `uiTarget` are APCA Lc numbers; handing the solver `wcag` without rescaling
 * them would put every role below target and force the whole map to be
 * derived. The badge strip below does honour the studio's metric, which is
 * where the choice actually belongs.
 */
const roles = computed(() => assignRoles(palette.colors, { scheme: studio.previewScheme }))

/** Custom properties inherit, so one wrapper paints the template and the tiles. */
const surfaceStyle = computed(() => {
  const vars: Record<`--${string}`, string> = {}
  for (const [key, value] of Object.entries(
    rolesToCssVars(roles.value, (color) => formatColor(color, 'oklch')),
  )) {
    vars[key as `--${string}`] = value
  }
  return vars
})

/* ---------------- template selection ---------------- */

const active = computed<PreviewTemplate>(
  () => PREVIEW_TEMPLATES.find((entry) => entry.id === studio.previewTemplate) ?? PREVIEW_TEMPLATES[0],
)

const grouped = computed(() =>
  PREVIEW_GROUPS.map((group) => ({
    group,
    items: PREVIEW_TEMPLATES.filter((entry) => entry.group === group),
  })).filter((entry) => entry.items.length > 0),
)

/**
 * One async wrapper per template, created once. Rebuilding it inside the render
 * would remount — and re-download — the template on every palette change.
 */
const wrappers = new Map<string, Component>()
function componentFor(entry: PreviewTemplate): Component {
  const cached = wrappers.get(entry.id)
  if (cached) return cached
  const created = defineAsyncComponent(entry.component)
  wrappers.set(entry.id, created)
  return created
}

const thin = computed(() => palette.count < active.value.minColors)

const SCHEMES = [
  { id: 'auto', label: 'Auto', icon: Monitor, hint: 'Let the palette decide' },
  { id: 'light', label: 'Light', icon: Sun, hint: 'Force a light scheme' },
  { id: 'dark', label: 'Dark', icon: Moon, hint: 'Force a dark scheme' },
] as const

const DENSITIES = [
  { id: 'single', label: 'Single', icon: Square, hint: 'One template, large' },
  { id: 'grid', label: 'Grid', icon: LayoutGrid, hint: 'Every template, as tiles' },
] as const

/* ---------------- grid density ---------------- */

/**
 * Tiles render at a fixed 480×340 and are scaled down, rather than being
 * rendered at tile size. A template laid out at 150px wide is not the template
 * you are choosing between; scaling keeps the thumbnail an honest miniature of
 * the single view.
 */
const TILE_WIDTH = 480
const TILE_HEIGHT = 340

const gridEl = ref<HTMLElement | null>(null)
const { width: gridWidth } = useElementSize(gridEl, { width: 360, height: 0 })

const tileColumns = computed(() => (gridWidth.value >= 700 ? 3 : gridWidth.value >= 340 ? 2 : 1))
const tileScale = computed(() => {
  const usable = (gridWidth.value - 8 * (tileColumns.value - 1)) / tileColumns.value
  return Math.max(0.2, usable / TILE_WIDTH)
})
const tileHeight = computed(() => Math.round(TILE_HEIGHT * tileScale.value))

/* ---------------- contrast badges ---------------- */

interface BadgePair {
  key: string
  label: string
  fg: RoleKey
  bg: RoleKey
  wcagTarget: number
  apcaTarget: number
}

const BADGE_PAIRS: BadgePair[] = [
  { key: 'body', label: 'Body', fg: 'text', bg: 'background', wcagTarget: 4.5, apcaTarget: 75 },
  { key: 'muted', label: 'Muted', fg: 'textMuted', bg: 'surface', wcagTarget: 4.5, apcaTarget: 60 },
  { key: 'primary', label: 'On primary', fg: 'textOnPrimary', bg: 'primary', wcagTarget: 4.5, apcaTarget: 60 },
  { key: 'accent', label: 'On accent', fg: 'textOnAccent', bg: 'accent', wcagTarget: 4.5, apcaTarget: 60 },
  { key: 'border', label: 'Border', fg: 'borderStrong', bg: 'background', wcagTarget: 3, apcaTarget: 25 },
]

interface ContrastBadge {
  key: string
  label: string
  fill: string
  ink: string
  value: string
  ok: boolean
  note: string
}

const contrastBadges = computed<ContrastBadge[]>(() =>
  BADGE_PAIRS.map((pair) => {
    const foreground = roles.value[pair.fg].color
    const background = roles.value[pair.bg].color
    const fill = formatColor(background, 'oklch')
    const ink = formatColor(foreground, 'oklch')
    if (studio.metric === 'wcag') {
      const ratio = wcag(foreground, background)
      return {
        key: pair.key,
        label: pair.label,
        fill,
        ink,
        value: `${ratio.toFixed(1)}:1`,
        ok: ratio >= pair.wcagTarget,
        note: `${wcagLevel(ratio)} — this pair needs ${pair.wcagTarget}:1`,
      }
    }
    const lc = Math.abs(apca(foreground, background))
    return {
      key: pair.key,
      label: pair.label,
      fill,
      ink,
      value: `Lc ${lc.toFixed(0)}`,
      ok: lc >= pair.apcaTarget,
      note: `${apcaVerdict(lc).use} — this pair needs Lc ${pair.apcaTarget}`,
    }
  }),
)

/* ---------------- audit & legend ---------------- */

const audit = computed(() => auditRoles(roles.value))

const ROLE_LABELS: Record<RoleKey, string> = {
  background: 'Background',
  surface: 'Surface',
  surfaceAlt: 'Surface alt',
  overlay: 'Overlay',
  text: 'Text',
  textMuted: 'Muted text',
  textOnPrimary: 'On primary',
  textOnAccent: 'On accent',
  border: 'Border',
  borderStrong: 'Strong border',
  primary: 'Primary',
  primaryHover: 'Primary hover',
  secondary: 'Secondary',
  accent: 'Accent',
  success: 'Success',
  warning: 'Warning',
  danger: 'Danger',
  info: 'Info',
}

const ROLE_KEYS = Object.keys(ROLE_LABELS) as RoleKey[]

const legend = computed(() =>
  ROLE_KEYS.map((key) => {
    const entry = roles.value[key]
    return {
      key,
      label: ROLE_LABELS[key],
      fill: formatColor(entry.color, 'oklch'),
      derived: entry.derived,
      source: entry.source,
    }
  }),
)

const takenFromPalette = computed(() => legend.value.filter((entry) => !entry.derived))
const derivedRoles = computed(() => legend.value.filter((entry) => entry.derived))
</script>

<template>
  <div class="flex flex-col gap-3 p-3">
    <!-- Template picker -->
    <div class="flex items-center gap-2">
      <Select v-model="studio.previewTemplate">
        <!-- Custom trigger content: the items carry a description, and
             SelectValue would drag it into the trigger. -->
        <SelectTrigger size="sm" class="min-w-0 flex-1" aria-label="Preview template">
          <span class="truncate text-xs">{{ active.label }}</span>
          <span class="ml-auto shrink-0 text-[10px] text-muted-foreground">
            {{ active.group }}
          </span>
        </SelectTrigger>
        <SelectContent class="max-h-96">
          <SelectGroup v-for="section in grouped" :key="section.group">
            <SelectLabel>{{ section.group }}</SelectLabel>
            <SelectItem
              v-for="entry in section.items"
              :key="entry.id"
              :value="entry.id"
              :label="entry.label"
              :description="entry.description"
            />
          </SelectGroup>
        </SelectContent>
      </Select>
      <InfoHint
        title="Preview templates"
        wide
        text="Each template is a real layout, not a swatch grid: the same palette can look confident on a landing page and unreadable in a dashboard. The UI kit and the tonal ramp are the two QA surfaces — they exercise every role and every step, so a problem shows up there before a client finds it."
      />
    </div>

    <p class="-mt-1 text-[11px] leading-snug text-muted-foreground">
      {{ active.description }}
    </p>
    <p v-if="thin" class="-mt-2 text-[11px] leading-snug text-muted-foreground">
      This one reads best with {{ active.minColors }} colors or more; the palette has
      {{ palette.count }}. Missing roles are derived rather than repeated.
    </p>

    <!-- Scheme, density, badges -->
    <div class="flex flex-wrap items-center gap-2">
      <div
        class="flex items-center rounded-md border bg-background p-0.5"
        role="group"
        aria-label="Preview scheme"
      >
        <button
          v-for="scheme in SCHEMES"
          :key="scheme.id"
          type="button"
          class="inline-flex items-center gap-1 rounded-[5px] px-2 py-1 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          :class="
            studio.previewScheme === scheme.id
              ? 'bg-secondary text-secondary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          "
          :aria-pressed="studio.previewScheme === scheme.id"
          :title="scheme.hint"
          @click="studio.previewScheme = scheme.id"
        >
          <component :is="scheme.icon" class="size-3" />
          {{ scheme.label }}
        </button>
      </div>
      <InfoHint
        title="Light or dark"
        wide
        text="Auto reads the palette's mean lightness and picks the scheme it already leans toward. Forcing the other one is the useful test: a palette built for a white page usually loses its accents on a dark background, and this is where you find out before the dark-mode ticket lands."
      />

      <div
        class="flex items-center rounded-md border bg-background p-0.5"
        role="group"
        aria-label="Preview density"
      >
        <button
          v-for="density in DENSITIES"
          :key="density.id"
          type="button"
          class="inline-flex items-center gap-1 rounded-[5px] px-2 py-1 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          :class="
            studio.previewDensity === density.id
              ? 'bg-secondary text-secondary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          "
          :aria-pressed="studio.previewDensity === density.id"
          :title="density.hint"
          @click="studio.previewDensity = density.id"
        >
          <component :is="density.icon" class="size-3" />
          {{ density.label }}
        </button>
      </div>
      <InfoHint
        title="One or all"
        wide
        text="Grid renders every template as a scaled-down tile against the same roles. It is slower and smaller, and it is the only view that catches a palette which works in one context and falls apart in another. Click a tile to open it large."
      />

      <div class="ml-auto flex items-center gap-1.5">
        <Label for="preview-contrast-badges" class="text-xs">Badges</Label>
        <Switch
          id="preview-contrast-badges"
          :model-value="studio.showContrastBadges"
          @update:model-value="studio.showContrastBadges = $event"
        />
        <InfoHint
          title="Contrast badges"
          wide
          :text="`Scores the five pairs a template leans on hardest, drawn in the colors being measured so the number and the evidence sit together. It reports whichever metric the studio is set to — currently ${studio.metric === 'wcag' ? 'WCAG 2 ratios' : 'APCA lightness contrast'}.`"
        />
      </div>
    </div>

    <!-- Badge strip -->
    <div v-if="studio.showContrastBadges" class="flex flex-wrap gap-1.5">
      <span
        v-for="badge in contrastBadges"
        :key="badge.key"
        class="inline-flex items-center gap-1.5 rounded-md border px-1.5 py-1 text-[11px]"
        :style="{ background: badge.fill, color: badge.ink, borderColor: badge.ink }"
        :title="badge.note"
      >
        {{ badge.label }}
        <span class="font-mono tabular-nums">{{ badge.value }}</span>
        <span aria-hidden="true">{{ badge.ok ? '✓' : '✗' }}</span>
        <span class="sr-only">{{ badge.ok ? 'passes' : 'fails' }}: {{ badge.note }}</span>
      </span>
    </div>

    <!-- The preview itself. Every child inherits the role variables from here. -->
    <div :style="surfaceStyle">
      <div
        v-if="studio.previewDensity === 'single'"
        class="overflow-hidden rounded-lg border"
        :aria-label="`${active.label} preview`"
        role="group"
      >
        <component :is="componentFor(active)" :roles="roles" :colors="palette.colors" />
      </div>

      <div
        v-else
        ref="gridEl"
        class="grid gap-2"
        :style="{ gridTemplateColumns: `repeat(${tileColumns}, minmax(0, 1fr))` }"
      >
        <div
          v-for="entry in PREVIEW_TEMPLATES"
          :key="entry.id"
          class="relative overflow-hidden rounded-lg border"
          :class="entry.id === studio.previewTemplate ? 'border-primary' : ''"
        >
          <div class="relative overflow-hidden" :style="{ height: `${tileHeight}px` }">
            <div
              class="absolute top-0 left-0 origin-top-left"
              aria-hidden="true"
              :style="{
                width: `${TILE_WIDTH}px`,
                height: `${TILE_HEIGHT}px`,
                transform: `scale(${tileScale})`,
              }"
            >
              <component :is="componentFor(entry)" :roles="roles" :colors="palette.colors" />
            </div>
          </div>
          <div class="flex items-center gap-2 border-t bg-card px-2 py-1">
            <span class="truncate text-[11px] font-medium">{{ entry.label }}</span>
            <span class="ml-auto shrink-0 text-[10px] text-muted-foreground">
              {{ entry.group }}
            </span>
          </div>
          <!-- A stretched button rather than a wrapping one: the tile contains
               block content, which a button may not. -->
          <button
            type="button"
            class="absolute inset-0 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            :aria-label="`Show ${entry.label} at full size`"
            @click="
              studio.previewTemplate = entry.id;
              studio.previewDensity = 'single'
            "
          />
        </div>
      </div>
    </div>

    <!-- Audit -->
    <div class="flex flex-col gap-1">
      <div
        v-for="item in audit"
        :key="item.key"
        class="flex gap-1.5 rounded-md border px-2 py-1.5 text-[11px] leading-snug"
        :class="
          item.severity === 'error'
            ? 'border-destructive/40 bg-destructive/10 text-destructive'
            : 'bg-muted/50 text-muted-foreground'
        "
      >
        <CircleAlert v-if="item.severity === 'error'" class="mt-px size-3.5 shrink-0" />
        <TriangleAlert v-else class="mt-px size-3.5 shrink-0" />
        <span>{{ item.message }}</span>
      </div>
      <p
        v-if="!audit.length"
        class="flex items-center gap-1.5 text-[11px] text-muted-foreground"
      >
        <CircleCheck class="size-3.5 shrink-0" />
        Every role clears its contrast target on this background.
      </p>
    </div>

    <!-- Legend -->
    <div class="flex flex-col gap-1.5 border-t pt-2.5">
      <div class="flex items-center gap-1.5">
        <span class="text-[11px] font-medium">
          {{ takenFromPalette.length }} from the palette, {{ derivedRoles.length }} derived
        </span>
        <InfoHint
          title="Derived roles"
          wide
          text="A palette of five colors cannot fill eighteen roles honestly, so surfaces, borders, hover states and any missing status color are computed from the colors you do have. Derived roles are marked with a dashed outline. If a role you care about is derived, add a color near that hue and it will be adopted."
        />
        <span class="ml-auto text-[10px] text-muted-foreground">
          scheme: {{ roles.scheme }}{{ studio.previewScheme === 'auto' ? ' (auto)' : '' }}
        </span>
      </div>
      <div class="flex flex-wrap gap-1">
        <span
          v-for="entry in legend"
          :key="entry.key"
          class="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] text-muted-foreground"
          :class="entry.derived ? 'border-dashed' : ''"
          :title="
            entry.derived
              ? `${entry.label} is derived from the palette`
              : `${entry.label} is palette color ${entry.source + 1}`
          "
        >
          <span
            class="size-2.5 rounded-[3px] border border-border/60"
            :style="{ background: entry.fill }"
          />
          {{ entry.label }}
          <span v-if="!entry.derived" class="font-mono tabular-nums">
            #{{ entry.source + 1 }}
          </span>
        </span>
      </div>
    </div>
  </div>
</template>
