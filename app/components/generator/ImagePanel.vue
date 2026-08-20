<script setup lang="ts">
/**
 * Extract a palette from an image.
 *
 * The whole point is that nothing is uploaded: the file is read with an object
 * URL, decoded into a canvas and clustered in this tab, so the panel says so in
 * plain words rather than making people guess. The other decision worth knowing
 * is that clustering blocks the main thread for a moment on a large photo, so
 * every run waits one animation frame first — the pending state gets to paint
 * before the tab freezes, which is the difference between "working" and "broken".
 */
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import {
  ImagePlus,
  LoaderCircle,
  Minus,
  Pipette,
  Plus,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from '@lucide/vue'
import { watchDebounced } from '@vueuse/core'
import { toast } from 'vue-sonner'
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
import {
  ALGORITHM_HINTS,
  ALGORITHM_LABELS,
  EXTRACT_SORT_HINTS,
  EXTRACT_SORT_LABELS,
  extractPalette,
  pickAt,
  type ExtractAlgorithm,
  type ExtractOptions,
  type ExtractedColor,
} from '@/lib/color/extract'
import { MAX_SWATCHES, usePaletteStore } from '@/stores/palette'
import { useStudioStore } from '@/stores/studio'
import type { Oklch } from '@/lib/color/types'

const palette = usePaletteStore()
const studio = useStudioStore()

/** The formats we can decode reliably in every evergreen browser. */
const ACCEPTED: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
]
const MAX_BYTES = 20 * 1024 * 1024

/**
 * Cap the backing canvas rather than the display size. `pickAt` samples the
 * canvas, so a 6000px original would mean a 6000px buffer sitting in memory for
 * a 220px preview; 1400px is far more resolution than an eyedropper needs.
 */
const MAX_CANVAS_EDGE = 1400

/* ---------------- state ---------------- */

const fileInput = ref<HTMLInputElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)

/** The decoded image is a raw DOM object; Vue must not proxy it. */
const image = shallowRef<HTMLImageElement | null>(null)
const fileName = ref('')
const dragging = ref(false)
const pending = ref(false)
const error = ref('')
const result = shallowRef<ExtractedColor[]>([])

/** Kept outside reactivity: it only ever exists to be revoked. */
let objectUrl: string | null = null

const algorithm = ref<ExtractAlgorithm>('vibrant')
const count = ref(5)
const sort = ref<ExtractOptions['sort']>('lightness')
const minChroma = ref(0.02)
const minLightness = ref(0.06)
const maxLightness = ref(0.985)

interface HoverReadout {
  left: number
  top: number
  css: string
  text: string
}
const hover = ref<HoverReadout | null>(null)

const options = computed<Partial<ExtractOptions>>(() => ({
  algorithm: algorithm.value,
  count: count.value,
  sort: sort.value,
  minChroma: minChroma.value,
  minLightness: minLightness.value,
  maxLightness: maxLightness.value,
}))

/** Bars are relative to the biggest cluster, or a 6% cluster would be invisible. */
const maxPopulation = computed(() =>
  result.value.reduce((peak, entry) => Math.max(peak, entry.population), 0.0001),
)

/* ---------------- loading ---------------- */

function releaseImage() {
  if (!objectUrl) return
  URL.revokeObjectURL(objectUrl)
  objectUrl = null
}

function drawToCanvas(img: HTMLImageElement) {
  const el = canvas.value
  if (!el) return
  const scale = Math.min(1, MAX_CANVAS_EDGE / Math.max(img.naturalWidth, img.naturalHeight))
  el.width = Math.max(1, Math.round(img.naturalWidth * scale))
  el.height = Math.max(1, Math.round(img.naturalHeight * scale))
  const ctx = el.getContext('2d', { willReadFrequently: true })
  if (!ctx) return
  ctx.drawImage(img, 0, 0, el.width, el.height)
}

async function loadFile(file: File) {
  if (!ACCEPTED.includes(file.type)) {
    error.value = `${file.type || 'That file'} is not a supported image. Use PNG, JPEG, WebP, GIF or AVIF.`
    return
  }
  if (file.size > MAX_BYTES) {
    const size = (file.size / 1024 / 1024).toFixed(1)
    error.value = `That image is ${size} MB and the limit is 20 MB. Resize it or export at lower quality — extraction downsamples to 220px anyway, so nothing is lost.`
    return
  }

  error.value = ''
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.decoding = 'async'
  img.src = url
  try {
    await img.decode()
  } catch {
    URL.revokeObjectURL(url)
    error.value = 'That image could not be decoded. It may be corrupt, or in a format this browser does not read.'
    return
  }

  // Only now is the old URL certainly no longer needed.
  releaseImage()
  objectUrl = url
  image.value = img
  fileName.value = file.name
  hover.value = null
  await nextTick()
  drawToCanvas(img)
  void run()
}

function clearImage() {
  releaseImage()
  image.value = null
  fileName.value = ''
  result.value = []
  hover.value = null
  error.value = ''
  if (fileInput.value) fileInput.value.value = ''
}

function onFileInput(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) void loadFile(file)
}

function onDrop(event: DragEvent) {
  dragging.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) void loadFile(file)
}

/**
 * Paste is listened for on `window` because there is nothing sensible to focus
 * first — people copy a screenshot and hit Ctrl+V expecting it to land.
 */
function onPaste(event: ClipboardEvent) {
  const items = event.clipboardData?.items
  if (!items) return
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue
    const file = item.getAsFile()
    if (!file) continue
    event.preventDefault()
    void loadFile(file)
    return
  }
}

onMounted(() => window.addEventListener('paste', onPaste))
onUnmounted(() => {
  window.removeEventListener('paste', onPaste)
  releaseImage()
})

/* ---------------- extraction ---------------- */

/** Guards against a slow run finishing after a newer one and overwriting it. */
let runToken = 0

async function run() {
  const img = image.value
  if (!img) return
  const token = ++runToken
  pending.value = true

  // One frame of breathing room so the pending state is on screen before the
  // clustering loop takes the main thread.
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

  try {
    const extracted = await extractPalette(img, options.value)
    if (token !== runToken) return
    result.value = extracted
    error.value = extracted.length
      ? ''
      : 'The filters removed every pixel. Lower the chroma floor or widen the lightness bounds.'
  } catch {
    if (token === runToken) error.value = 'Extraction failed on this image.'
  } finally {
    if (token === runToken) pending.value = false
  }
}

watchDebounced(options, () => void run(), { debounce: 150 })

function stepCount(delta: number) {
  count.value = Math.max(2, Math.min(20, count.value + delta))
}

/* ---------------- eyedropper ---------------- */

function pointFor(el: HTMLCanvasElement, event: MouseEvent): { x: number; y: number } | null {
  const rect = el.getBoundingClientRect()
  if (!rect.width || !rect.height) return null
  return {
    x: Math.round(((event.clientX - rect.left) / rect.width) * el.width),
    y: Math.round(((event.clientY - rect.top) / rect.height) * el.height),
  }
}

function onCanvasMove(event: MouseEvent) {
  const el = canvas.value
  if (!el) return
  const point = pointFor(el, event)
  if (!point) return
  const color = pickAt(el, point.x, point.y)
  if (!color) {
    hover.value = null
    return
  }
  const rect = el.getBoundingClientRect()
  hover.value = {
    left: event.clientX - rect.left,
    top: event.clientY - rect.top,
    css: formatColor(color, 'oklch'),
    text: formatColor(color, studio.format),
  }
}

function onCanvasClick(event: MouseEvent) {
  const el = canvas.value
  if (!el) return
  // A keyboard-activated click reports no coordinates, so sample the middle
  // rather than silently picking the top-left corner.
  const point =
    event.detail === 0
      ? { x: Math.floor(el.width / 2), y: Math.floor(el.height / 2) }
      : pointFor(el, event)
  if (!point) return
  const color = pickAt(el, point.x, point.y)
  if (color) addOne(color)
}

/* ---------------- handing colors to the palette ---------------- */

function addOne(color: Oklch) {
  if (palette.count >= MAX_SWATCHES) {
    toast.error(`The palette is full at ${MAX_SWATCHES} colors`)
    return
  }
  palette.addSwatch(palette.count, color)
  toast.success(`Added ${formatColor(color, studio.format)}`)
}

function useAsPalette() {
  if (!result.value.length) return
  palette.setColors(
    result.value.map((entry) => entry.color),
    'From image',
  )
}

function addAll() {
  const room = MAX_SWATCHES - palette.count
  if (room <= 0) {
    toast.error(`The palette is full at ${MAX_SWATCHES} colors`)
    return
  }
  const taken = result.value.slice(0, room)
  for (const entry of taken) palette.addSwatch(palette.count, entry.color)
  if (taken.length < result.value.length) {
    toast.success(`Added ${taken.length} of ${result.value.length} — the palette hit its limit`)
  }
}
</script>

<template>
  <div
    class="flex min-h-0 flex-col gap-3"
    @dragenter.prevent="dragging = true"
    @dragover.prevent="dragging = true"
    @dragleave.prevent="dragging = false"
    @drop.prevent="onDrop"
  >
    <!-- Where the photo goes. People are right to ask; answer before they do. -->
    <p class="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
      <ShieldCheck class="mt-px size-3.5 shrink-0 text-primary" />
      <span>
        Nothing is uploaded. Decoding, sampling and clustering all happen in this tab, and the file
        never leaves the machine.
      </span>
    </p>

    <input
      ref="fileInput"
      type="file"
      class="sr-only"
      accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
      aria-label="Choose an image to extract colors from"
      @change="onFileInput"
    />

    <!-- Drop zone -->
    <div
      v-if="!image"
      class="flex flex-col items-center gap-2 rounded-lg border border-dashed px-3 py-6 text-center transition-colors"
      :class="dragging ? 'border-primary bg-primary/5' : 'bg-card/40'"
    >
      <ImagePlus class="size-6 text-muted-foreground" />
      <p class="text-xs text-muted-foreground">Drop an image here, paste one, or pick a file.</p>
      <Button variant="outline" size="sm" @click="fileInput?.click()">
        <Upload /> Choose image
      </Button>
      <p class="text-[10px] text-muted-foreground/80">PNG, JPEG, WebP, GIF or AVIF, up to 20 MB.</p>
    </div>

    <!-- Loaded image -->
    <div v-else class="rounded-lg border bg-card/40 p-2.5">
      <div class="mb-2 flex items-center gap-2">
        <Pipette class="size-3.5 shrink-0 text-muted-foreground" />
        <span class="min-w-0 flex-1 truncate text-[11px] text-muted-foreground" :title="fileName">
          {{ fileName }}
        </span>
        <InfoHint
          title="Click to sample"
          wide
          text="Clicking the image adds the color under the cursor to the palette. The reading averages a 5×5 block of pixels rather than a single one, because JPEG noise and dithering will otherwise hand you a color that is not really in the photograph."
        />
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Remove image"
          title="Remove image"
          @click="clearImage"
        >
          <X />
        </Button>
      </div>

      <div class="relative flex justify-center overflow-hidden rounded-md bg-muted/40">
        <button
          type="button"
          class="relative inline-block cursor-crosshair rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label="Sample a color from the image. Click a point, or press Enter to sample the center."
          @click="onCanvasClick"
          @mousemove="onCanvasMove"
          @mouseleave="hover = null"
        >
          <canvas ref="canvas" class="block max-h-[220px] max-w-full rounded-md" />
          <span
            v-if="hover"
            class="pointer-events-none absolute z-10 flex -translate-x-1/2 -translate-y-[calc(100%+12px)] items-center gap-1.5 rounded-md border bg-popover/95 px-1.5 py-1 shadow-md"
            :style="{ left: `${hover.left}px`, top: `${hover.top}px` }"
          >
            <span
              class="size-5 shrink-0 rounded-sm border border-border/60"
              :style="{ background: hover.css }"
            />
            <span class="font-mono text-[10px] whitespace-nowrap text-popover-foreground tabular-nums">
              {{ hover.text }}
            </span>
          </span>
        </button>
      </div>

      <div class="mt-2 flex justify-center">
        <Button variant="ghost" size="xs" @click="fileInput?.click()">
          <Upload /> Replace image
        </Button>
      </div>
    </div>

    <p v-if="error" class="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px] leading-snug text-destructive">
      {{ error }}
    </p>

    <!-- Controls -->
    <div class="grid gap-2.5 rounded-lg border bg-card/40 p-2.5">
      <div class="flex items-center gap-2">
        <Label class="flex w-24 shrink-0 items-center gap-1 text-xs">
          Algorithm
          <InfoHint title="Algorithm" wide :text="ALGORITHM_HINTS[algorithm]" />
        </Label>
        <Select
          :model-value="algorithm"
          @update:model-value="algorithm = $event as ExtractAlgorithm"
        >
          <SelectTrigger size="sm" class="flex-1" aria-label="Extraction algorithm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="(label, id) in ALGORITHM_LABELS"
              :key="id"
              :value="id"
              :label="label"
              :description="ALGORITHM_HINTS[id]"
            />
          </SelectContent>
        </Select>
      </div>

      <div class="flex items-center gap-2">
        <Label class="flex w-24 shrink-0 items-center gap-1 text-xs">
          Colors
          <InfoHint
            title="How many colors"
            wide
            text="How many clusters the algorithm is asked for. Fewer means each color covers more of the image and comes back closer to an average; more surfaces detail but starts returning near-duplicates of the dominant tone. Five is the usual sweet spot for a photograph, three for a logo."
          />
        </Label>
        <div class="flex flex-1 items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="One color fewer"
            :disabled="count <= 2"
            @click="stepCount(-1)"
          >
            <Minus />
          </Button>
          <span
            class="w-8 text-center font-mono text-xs tabular-nums"
            role="status"
            aria-label="Colors to extract"
          >
            {{ count }}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="One color more"
            :disabled="count >= 20"
            @click="stepCount(1)"
          >
            <Plus />
          </Button>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <Label class="flex w-24 shrink-0 items-center gap-1 text-xs">
          Order
          <InfoHint title="Sort order" wide :text="EXTRACT_SORT_HINTS[sort]" />
        </Label>
        <Select
          :model-value="sort"
          @update:model-value="sort = $event as ExtractOptions['sort']"
        >
          <SelectTrigger size="sm" class="flex-1" aria-label="Result order">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="(label, id) in EXTRACT_SORT_LABELS"
              :key="id"
              :value="id"
              :label="label"
              :description="EXTRACT_SORT_HINTS[id]"
            />
          </SelectContent>
        </Select>
      </div>

      <div class="flex items-center gap-2">
        <Label class="flex w-24 shrink-0 items-center gap-1 text-xs">
          Chroma floor
          <InfoHint
            title="Minimum chroma"
            wide
            text="Pixels less colorful than this are thrown away before clustering. Photographs are mostly desaturated — sky, skin, concrete, shadow — so without a floor the clusters converge on greys and the colors you actually noticed never appear. Raise it until the accents show up; set it to zero if you want an honest average of the whole image."
          />
        </Label>
        <input
          v-model.number="minChroma"
          type="range"
          class="h-4 flex-1 accent-primary"
          min="0"
          max="0.08"
          step="0.002"
          aria-label="Minimum chroma"
        />
        <span class="w-10 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
          {{ minChroma.toFixed(3) }}
        </span>
      </div>

      <div class="flex items-center gap-2">
        <Label class="flex w-24 shrink-0 items-center gap-1 text-xs">
          Dark cutoff
          <InfoHint
            title="Minimum lightness"
            wide
            text="Pixels darker than this are ignored. Black borders, letterboxing and deep shadow all collapse into one enormous near-black cluster that will happily eat a slot in a five-color palette while telling you nothing about the image. Lower it if the photo is genuinely dark and you want its blacks represented."
          />
        </Label>
        <input
          v-model.number="minLightness"
          type="range"
          class="h-4 flex-1 accent-primary"
          min="0"
          max="0.5"
          step="0.005"
          aria-label="Minimum lightness"
        />
        <span class="w-10 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
          {{ Math.round(minLightness * 100) }}%
        </span>
      </div>

      <div class="flex items-center gap-2">
        <Label class="flex w-24 shrink-0 items-center gap-1 text-xs">
          Light cutoff
          <InfoHint
            title="Maximum lightness"
            wide
            text="The same problem at the other end. Blown highlights, white studio backgrounds and paper scans are a huge mass of near-white pixels that carry no usable hue, and they will dominate any clustering that includes them. Raise it toward 100% when the image is a high-key shot whose pale tones are the point."
          />
        </Label>
        <input
          v-model.number="maxLightness"
          type="range"
          class="h-4 flex-1 accent-primary"
          min="0.5"
          max="1"
          step="0.005"
          aria-label="Maximum lightness"
        />
        <span class="w-10 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
          {{ Math.round(maxLightness * 100) }}%
        </span>
      </div>
    </div>

    <!-- Result -->
    <div class="rounded-lg border bg-card/40 p-2.5">
      <div class="mb-2 flex items-center gap-1">
        <Label class="text-xs">Extracted</Label>
        <InfoHint
          title="Population bars"
          wide
          text="The bar under each color is how much of the sampled image it accounts for. Bars are scaled against the largest cluster so small differences stay readable, while the percentage next to each is the true share. Vibrant ranks by how interesting a cluster is rather than how large, so its shares will not add up to the whole photo."
        />
        <span class="flex-1" />
        <span
          v-if="pending"
          class="flex items-center gap-1 text-[11px] text-muted-foreground"
          role="status"
        >
          <LoaderCircle class="size-3 animate-spin" /> Extracting
        </span>
      </div>

      <p v-if="!image" class="text-[11px] text-muted-foreground">
        Load an image and its colors appear here.
      </p>
      <p v-else-if="!result.length && !pending" class="text-[11px] text-muted-foreground">
        Nothing came back from these settings.
      </p>
      <div v-else class="flex gap-1" :class="pending && 'opacity-50'">
        <button
          v-for="(entry, index) in result"
          :key="index"
          type="button"
          class="group/entry flex min-w-0 flex-1 flex-col gap-1 rounded-md p-0.5 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          :aria-label="`Add ${formatColor(entry.color, studio.format)} to the palette`"
          :title="`${formatColor(entry.color, studio.format)} — ${Math.round(entry.population * 100)}% of the image`"
          @click="addOne(entry.color)"
        >
          <span
            class="block h-10 rounded-md transition-transform group-hover/entry:scale-105"
            :style="{ background: formatColor(entry.color, 'oklch') }"
          />
          <span class="block h-1 overflow-hidden rounded-full bg-muted">
            <span
              class="block h-full rounded-full bg-foreground/40"
              :style="{ width: `${Math.max(4, (entry.population / maxPopulation) * 100)}%` }"
            />
          </span>
          <span class="block truncate text-center text-[9px] text-muted-foreground tabular-nums">
            {{ Math.round(entry.population * 100) }}%
          </span>
        </button>
      </div>
    </div>

    <div class="flex flex-wrap gap-2">
      <Button class="flex-1" :disabled="!result.length" @click="useAsPalette">
        <Sparkles /> Use as palette
      </Button>
      <Button variant="outline" :disabled="!result.length" @click="addAll">
        <Plus /> Add to palette
      </Button>
    </div>
  </div>
</template>
