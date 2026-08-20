<script setup lang="ts">
/**
 * The studio toolbar — everything that acts on the palette as a whole.
 *
 * The one decision worth knowing: this bar owns the two global overlays
 * (the shortcut sheet and the command palette) rather than the page. Both are
 * driven purely by studio-store flags, so anything anywhere can open them
 * without the page having to thread props down, and the page stays a layout.
 */
import { computed } from 'vue'
import {
  ArrowUpDown,
  Eye,
  Link2,
  Minus,
  Plus,
  Redo2,
  Repeat,
  Shuffle,
  Sparkles,
  Undo2,
} from '@lucide/vue'
import CommandPalette from '@/components/studio/CommandPalette.vue'
import ShortcutsDialog from '@/components/studio/ShortcutsDialog.vue'
import InfoHint from '@/components/common/InfoHint.vue'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import { FORMAT_HINTS, FORMAT_LABELS } from '@/lib/color/convert'
import { CVD_IDS, CVD_TYPES, type CvdType } from '@/lib/color/cvd'
import { MAX_SWATCHES, MIN_SWATCHES, usePaletteStore, type SortKey } from '@/stores/palette'
import { useStudioStore } from '@/stores/studio'
import type { ColorFormat } from '@/lib/color/types'

const emit = defineEmits<{ copyLink: [] }>()

const palette = usePaletteStore()
const studio = useStudioStore()

const FORMAT_IDS = Object.keys(FORMAT_LABELS) as ColorFormat[]

const SORTS: Array<{ key: Exclude<SortKey, 'none'>; label: string; hint: string }> = [
  { key: 'lightness', label: 'Lightness', hint: 'Light to dark. Reads as a designed ramp.' },
  { key: 'chroma', label: 'Chroma', hint: 'Most colorful first, neutrals last.' },
  { key: 'hue', label: 'Hue', hint: 'Around the color wheel, starting at red.' },
  { key: 'temperature', label: 'Temperature', hint: 'Warm hues first, cool ones last.' },
]

/**
 * History entries carry the label of the action that produced them, so the
 * button can name what it is about to undo instead of saying "Undo".
 */
const undoLabel = computed(() => {
  const entry = palette.past[palette.past.length - 1]
  return entry ? `Undo ${entry.label.toLowerCase()}` : 'Nothing to undo'
})
const redoLabel = computed(() => {
  const entry = palette.future[0]
  return entry ? `Redo ${entry.label.toLowerCase()}` : 'Nothing to redo'
})

const simulating = computed(() => studio.cvd !== 'none')
const cvdLabel = computed(() => CVD_TYPES[studio.cvd].label)
</script>

<template>
  <header class="shrink-0 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
    <div class="flex flex-wrap items-center gap-x-2 gap-y-2 px-3 py-2 xl:flex-nowrap">
      <!-- Title -->
      <input
        v-model="palette.title"
        class="min-w-0 flex-1 basis-48 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-medium transition-colors hover:border-border focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none xl:max-w-56"
        placeholder="Untitled palette"
        aria-label="Palette title"
        maxlength="80"
        spellcheck="false"
      />

      <!-- History -->
      <div class="flex items-center">
        <Button
          variant="ghost"
          size="icon-sm"
          :disabled="!palette.canUndo"
          :title="undoLabel"
          :aria-label="undoLabel"
          @click="palette.undo()"
        >
          <Undo2 />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          :disabled="!palette.canRedo"
          :title="redoLabel"
          :aria-label="redoLabel"
          @click="palette.redo()"
        >
          <Redo2 />
        </Button>
      </div>

      <!-- Count -->
      <div
        class="flex items-center rounded-md border bg-background"
        role="group"
        aria-label="Number of colors"
      >
        <Button
          variant="ghost"
          size="icon-sm"
          class="rounded-r-none"
          :disabled="palette.count <= MIN_SWATCHES"
          aria-label="One color fewer"
          @click="palette.setCount(palette.count - 1)"
        >
          <Minus />
        </Button>
        <span class="w-7 text-center font-mono text-xs tabular-nums" aria-live="polite">
          {{ palette.count }}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          class="rounded-l-none"
          :disabled="palette.count >= MAX_SWATCHES"
          aria-label="One color more"
          @click="palette.setCount(palette.count + 1)"
        >
          <Plus />
        </Button>
      </div>
      <InfoHint
        title="How many colors"
        wide
        :text="`Anything from ${MIN_SWATCHES} to ${MAX_SWATCHES}. Growing the palette generates the new colors under the current ranges and keeps them distinct from the ones already there; shrinking it drops unlocked colors from the end first, so locks survive. Most brand palettes settle at five or six, but a full UI scale needs more.`"
      />

      <!-- Generate -->
      <Button size="sm" class="gap-1.5" @click="palette.roll()">
        <Sparkles />
        Generate
        <kbd
          class="ml-0.5 hidden rounded border border-primary-foreground/30 bg-primary-foreground/15 px-1 font-mono text-[10px] leading-4 text-primary-foreground/90 sm:inline"
        >
          Space
        </kbd>
      </Button>

      <!-- Notation -->
      <div class="flex items-center gap-1">
        <Select
          :model-value="studio.format"
          @update:model-value="studio.format = $event as ColorFormat"
        >
          <SelectTrigger size="sm" class="w-[7.5rem]" aria-label="Color notation">
            <span class="truncate font-mono text-xs">{{ FORMAT_LABELS[studio.format] }}</span>
          </SelectTrigger>
          <SelectContent class="max-h-96">
            <SelectItem
              v-for="id in FORMAT_IDS"
              :key="id"
              :value="id"
              :label="FORMAT_LABELS[id]"
              :description="FORMAT_HINTS[id]"
            />
          </SelectContent>
        </Select>
        <InfoHint title="Notation" wide :text="FORMAT_HINTS[studio.format]" />
      </div>

      <!-- Order -->
      <div class="flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="outline" size="sm" class="gap-1.5">
              <ArrowUpDown />
              <span class="hidden sm:inline">Order</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" class="w-60">
            <DropdownMenuLabel class="text-xs font-normal text-muted-foreground">
              Sort by
            </DropdownMenuLabel>
            <DropdownMenuItem
              v-for="sort in SORTS"
              :key="sort.key"
              class="items-start gap-2"
              @select="palette.sortBy(sort.key)"
            >
              <span class="flex flex-col gap-0.5">
                <span class="text-sm">{{ sort.label }}</span>
                <span class="text-[11px] leading-snug text-muted-foreground">{{ sort.hint }}</span>
              </span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem @select="palette.shuffle()">
              <Shuffle /> Shuffle
            </DropdownMenuItem>
            <DropdownMenuItem @select="palette.reverse()">
              <Repeat /> Reverse
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <InfoHint
          title="Order matters"
          wide
          text="Position is the only thing a preview template has to go on before roles are assigned, so reordering changes which color becomes the background and which becomes the accent. Sorting by lightness is the safe choice; shuffle is the fast way to find a better assignment without touching the colors themselves."
        />
      </div>

      <!-- Color vision -->
      <div class="flex items-center gap-1">
        <Select
          :model-value="studio.cvd"
          @update:model-value="studio.cvd = $event as CvdType"
        >
          <SelectTrigger
            size="sm"
            class="w-[9.5rem]"
            :class="simulating && 'border-primary text-primary'"
            aria-label="Simulate color vision"
          >
            <Eye class="size-4" />
            <span class="truncate text-xs">{{ cvdLabel }}</span>
          </SelectTrigger>
          <SelectContent class="max-h-96">
            <SelectItem
              v-for="id in CVD_IDS"
              :key="id"
              :value="id"
              :label="CVD_TYPES[id].label"
              :description="CVD_TYPES[id].hint"
            >
              <template #badge>
                <span class="rounded-sm bg-muted px-1 text-[9px] text-muted-foreground">
                  {{ CVD_TYPES[id].prevalence }}
                </span>
              </template>
            </SelectItem>
          </SelectContent>
        </Select>
        <InfoHint title="Color vision" wide :text="CVD_TYPES[studio.cvd].hint" />
      </div>

      <div class="hidden flex-1 xl:block" />

      <!-- Share and help -->
      <div class="flex items-center gap-1">
        <Button variant="outline" size="sm" class="gap-1.5" @click="emit('copyLink')">
          <Link2 />
          <span class="hidden sm:inline">Copy link</span>
        </Button>
        <InfoHint
          title="What the link carries"
          wide
          text="The whole palette is packed into the URL fragment — colors, locks and names. Nothing is uploaded and no account is involved, so the link works forever and reveals nothing to the server. The cost is length: a twenty-color palette makes a long URL."
        />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts"
          @click="studio.shortcutsOpen = true"
        >
          <span class="text-sm font-semibold">?</span>
        </Button>
      </div>
    </div>

    <!--
      A simulation that silently stays on is worse than no simulation at all:
      every judgement made afterwards is about colors nobody authored. So it
      gets its own row, not a subtle icon state.
    -->
    <div
      v-if="simulating"
      class="flex flex-wrap items-center gap-x-2 gap-y-1 border-t bg-primary/10 px-3 py-1.5 text-xs text-primary"
    >
      <Eye class="size-3.5 shrink-0" />
      <span class="font-medium">Simulating {{ cvdLabel }}</span>
      <span class="text-primary/80">
        The palette strip and every preview are filtered. The controls on the left, and the values
        you export, are not — this changes what you see, never what you save.
      </span>
      <Button
        variant="ghost"
        size="xs"
        class="ml-auto text-primary hover:bg-primary/15 hover:text-primary"
        @click="studio.cvd = 'none'"
      >
        Back to normal vision
      </Button>
    </div>

    <ShortcutsDialog />
    <CommandPalette />
  </header>
</template>
