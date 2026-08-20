<script lang="ts">
/**
 * The palette card used by the library grid, the explore grid and anywhere
 * else a saved palette needs a face — plus the API shapes those pages speak.
 *
 * The shapes live beside the card rather than in `@/lib/api` because the card
 * is the one component that has to agree with the server about what a palette
 * is; keeping the contract next to its only consumer means a server change
 * moves one file, not four. The card holds no request state: every action is
 * an event, so the page above owns optimism, errors and confirmation.
 */
import { bestBlackOrWhite } from '@/lib/color/contrast'
import { formatColor, parseColor } from '@/lib/color/convert'
import type { Oklch } from '@/lib/color/types'
import { encodeState } from '@/lib/palette/url'
import type { PaletteState } from '@/lib/palette/url'

export type PaletteVisibility = 'private' | 'unlisted' | 'public'

/** One entry of the stored document. The server only ever reads `hex`. */
export interface PaletteDocColor {
  hex: string
  name?: string
  locked?: boolean
}

/**
 * The palette document.
 *
 * Opaque to the server, which derives a hex index from it but never interprets
 * it — that is what keeps the color engine in exactly one place.
 */
export interface PaletteDoc {
  version: number
  colors: PaletteDocColor[]
  seed?: number | null
}

export interface PaletteSummary {
  uuid: string
  slug: string
  title: string
  /** Hex strings, already prefixed with `#`. */
  colors: string[]
  colorCount: number
  visibility: PaletteVisibility
  likes: number
  views: number
  updatedAt: number
  createdAt: number
  owner?: { displayName: string }
  /** Present when the endpoint returned the full document. */
  doc?: PaletteDoc | null
}

export interface PaletteDetail extends PaletteSummary {
  description: string
  liked: boolean
}

export interface PaletteListResponse {
  items: PaletteSummary[]
  nextCursor: string | null
}

export const VISIBILITY_ORDER: PaletteVisibility[] = ['private', 'unlisted', 'public']

export const VISIBILITY_LABELS: Record<PaletteVisibility, string> = {
  private: 'Private',
  unlisted: 'Unlisted',
  public: 'Public',
}

/** One line each, shown inside the selector so the choice is never a guess. */
export const VISIBILITY_HINTS: Record<PaletteVisibility, string> = {
  private: 'Only you can open it, even with the link.',
  unlisted: 'Anyone with the link can open it; it stays out of Explore and search.',
  public: 'Listed in Explore, likeable, and indexable by search engines.',
}

/** Pack palette-store state into a document the server will accept. */
export function docFromState(state: PaletteState): PaletteDoc {
  return {
    version: 1,
    colors: state.colors.map((color, index) => ({
      hex: formatColor(color, 'hex'),
      name: state.names[index] ?? '',
      locked: Boolean(state.locks[index]),
    })),
    seed: state.seed ?? null,
  }
}

/**
 * Unpack a stored palette back into editor state.
 *
 * Prefers the document, which carries names and locks, and falls back to the
 * flat hex list the grid endpoints return — so "open in generator" works from
 * a card that never fetched the full record.
 */
export function stateFromPalette(item: PaletteSummary): PaletteState | null {
  const entries: PaletteDocColor[] = item.doc?.colors?.length
    ? item.doc.colors
    : item.colors.map((hex) => ({ hex }))

  const colors: Oklch[] = []
  const names: string[] = []
  const locks: boolean[] = []
  for (const entry of entries) {
    const parsed = parseColor(entry.hex)
    if (!parsed) continue
    colors.push(parsed)
    names.push(entry.name ?? '')
    locks.push(Boolean(entry.locked))
  }
  if (!colors.length) return null
  return { colors, locks, names, seed: item.doc?.seed ?? null }
}

/**
 * Encode a stored palette for the studio's `/p/:state` route.
 *
 * Opening a palette goes through the URL rather than through the store because
 * the studio re-initialises itself from the route on mount; handing it the
 * state directly would only get overwritten, and this way the address bar ends
 * up holding a share link for what is on screen.
 */
export async function encodeForGenerator(item: PaletteSummary): Promise<string | null> {
  const state = stateFromPalette(item)
  return state ? encodeState(state) : null
}

/** A hex plus the black-or-white that stays legible on it. */
export interface PaletteBand {
  hex: string
  css: string
  text: string
}

export function bandsFor(hexes: string[]): PaletteBand[] {
  const out: PaletteBand[] = []
  for (const hex of hexes) {
    const parsed = parseColor(hex)
    if (!parsed) continue
    out.push({
      hex: formatColor(parsed, 'hex'),
      css: formatColor(parsed, 'oklch'),
      text: formatColor(bestBlackOrWhite(parsed), 'oklch'),
    })
  }
  return out
}

const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3600],
  ['minute', 60],
]

/** Unix seconds to "3 days ago", in the visitor's locale. */
export function relativeTime(unixSeconds: number): string {
  const delta = unixSeconds - Date.now() / 1000
  const magnitude = Math.abs(delta)
  for (const [unit, size] of UNITS) {
    if (magnitude >= size) return RELATIVE.format(Math.round(delta / size), unit)
  }
  return RELATIVE.format(Math.round(delta), 'second')
}
</script>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import type { RouteLocationRaw } from 'vue-router'
import { Eye, Heart, SquareArrowOutUpRight, Trash2, Wand2 } from '@lucide/vue'
import { toast } from 'vue-sonner'
import InfoHint from '@/components/common/InfoHint.vue'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const props = withDefaults(
  defineProps<{
    palette: PaletteSummary
    /** Where the title links. Omitted renders the title as plain text. */
    to?: RouteLocationRaw
    /** Show the owner's display name in the meta line. */
    showOwner?: boolean
    /** Owner controls: inline rename, visibility, delete. */
    owned?: boolean
    /** Show the like button. */
    likeable?: boolean
    liked?: boolean
    /** Grey the controls out while a request for this card is in flight. */
    busy?: boolean
  }>(),
  { showOwner: false, owned: false, likeable: false, liked: false, busy: false },
)

const emit = defineEmits<{
  open: []
  rename: [title: string]
  visibility: [value: PaletteVisibility]
  remove: []
  like: []
}>()

const bands = computed(() => bandsFor(props.palette.colors))

const displayTitle = computed(() => props.palette.title || 'Untitled palette')
const updatedLabel = computed(() => relativeTime(props.palette.updatedAt))
const updatedExact = computed(() => new Date(props.palette.updatedAt * 1000).toLocaleString())
const ownerName = computed(() => props.palette.owner?.displayName ?? '')
const visibilityLabel = computed(() => VISIBILITY_LABELS[props.palette.visibility])

const visibilityChoices = VISIBILITY_ORDER.map((value) => ({
  value,
  label: VISIBILITY_LABELS[value],
  hint: VISIBILITY_HINTS[value],
}))

/**
 * Rename is a borderless input rather than click-to-edit. Click-to-edit hides
 * the affordance and needs focus choreography to feel right; an input that
 * reveals its border on hover does the same job with no mode to get stuck in.
 */
const draft = ref(props.palette.title)
const focused = ref(false)

// Only adopt the server's title when the user is not mid-edit, so a slow PATCH
// cannot yank characters out from under them.
watch(
  () => props.palette.title,
  (title) => {
    if (!focused.value) draft.value = title
  },
)

function commitRename() {
  focused.value = false
  const next = draft.value.trim()
  if (!next || next === props.palette.title) {
    draft.value = props.palette.title
    return
  }
  emit('rename', next)
}

function abandonRename(event: KeyboardEvent) {
  draft.value = props.palette.title
  ;(event.target as HTMLInputElement).blur()
}

function blurTarget(event: KeyboardEvent) {
  ;(event.target as HTMLInputElement).blur()
}

async function copyHex(hex: string) {
  try {
    await navigator.clipboard.writeText(hex)
    toast.success(`Copied ${hex}`)
  } catch {
    toast.error('Could not reach the clipboard')
  }
}
</script>

<template>
  <article
    class="group flex flex-col overflow-hidden rounded-xl border bg-card text-card-foreground transition-shadow focus-within:shadow-md hover:shadow-md"
  >
    <!-- The only surface here painted from the palette rather than the theme. -->
    <div class="flex h-24 w-full sm:h-28">
      <button
        v-for="band in bands"
        :key="band.hex"
        type="button"
        class="relative min-w-0 flex-1 cursor-copy overflow-hidden focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none"
        :style="{ background: band.css }"
        :aria-label="`Copy ${band.hex}`"
        @click="copyHex(band.hex)"
      >
        <span
          class="pointer-events-none absolute inset-x-0 bottom-1.5 text-center font-mono text-[10px] tracking-tight opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
          :style="{ color: band.text }"
        >
          {{ band.hex }}
        </span>
      </button>
      <div v-if="!bands.length" class="flex-1 bg-muted" />
    </div>

    <div class="flex min-w-0 flex-col gap-2 p-3">
      <div class="flex min-w-0 items-center gap-1">
        <Input
          v-if="props.owned"
          :model-value="draft"
          :disabled="props.busy"
          class="h-7 border-transparent bg-transparent px-1.5 text-sm font-medium shadow-none hover:border-input focus-visible:border-ring"
          aria-label="Palette title"
          maxlength="120"
          @update:model-value="draft = String($event)"
          @focus="focused = true"
          @blur="commitRename"
          @keyup.enter="blurTarget"
          @keydown.esc="abandonRename"
        />
        <RouterLink
          v-else-if="props.to"
          :to="props.to"
          class="truncate rounded-sm px-1.5 text-sm font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {{ displayTitle }}
        </RouterLink>
        <span v-else class="truncate px-1.5 text-sm font-medium">{{ displayTitle }}</span>
      </div>

      <p
        class="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-1.5 text-[11px] text-muted-foreground"
      >
        <span v-if="props.showOwner && ownerName" class="truncate font-medium text-foreground/80">
          {{ ownerName }}
        </span>
        <span>{{ props.palette.colorCount }} colors</span>
        <span aria-hidden="true">·</span>
        <span :title="updatedExact">{{ updatedLabel }}</span>
        <span v-if="props.palette.views > 0" class="inline-flex items-center gap-1">
          <Eye class="size-3" aria-hidden="true" />
          <span class="tabular-nums">{{ props.palette.views }}</span>
          <span class="sr-only">views</span>
        </span>
      </p>

      <div class="flex flex-wrap items-center gap-1.5">
        <Button
          size="sm"
          variant="secondary"
          class="flex-1"
          :disabled="props.busy"
          @click="emit('open')"
        >
          <Wand2 /> Open in generator
        </Button>

        <Button
          v-if="props.likeable"
          size="sm"
          :variant="props.liked ? 'default' : 'outline'"
          :aria-pressed="props.liked"
          :aria-label="props.liked ? 'Remove your like' : 'Like this palette'"
          @click="emit('like')"
        >
          <Heart :class="props.liked && 'fill-current'" />
          <span class="tabular-nums">{{ props.palette.likes }}</span>
        </Button>

        <span
          v-else-if="props.palette.likes > 0"
          class="inline-flex items-center gap-1 px-1 text-xs text-muted-foreground"
        >
          <Heart class="size-3.5" aria-hidden="true" />
          <span class="tabular-nums">{{ props.palette.likes }}</span>
          <span class="sr-only">likes</span>
        </span>

        <template v-if="props.owned">
          <Select
            :model-value="props.palette.visibility"
            :disabled="props.busy"
            @update:model-value="emit('visibility', $event as PaletteVisibility)"
          >
            <SelectTrigger size="sm" class="w-auto" aria-label="Who can see this palette">
              <SelectValue>{{ visibilityLabel }}</SelectValue>
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem
                v-for="choice in visibilityChoices"
                :key="choice.value"
                :value="choice.value"
                class="items-start"
              >
                <span class="flex flex-col gap-0.5 py-0.5">
                  <span class="text-xs font-medium">{{ choice.label }}</span>
                  <span
                    class="max-w-[18rem] text-[11px] leading-snug text-wrap text-muted-foreground"
                  >
                    {{ choice.hint }}
                  </span>
                </span>
              </SelectItem>
            </SelectContent>
          </Select>

          <InfoHint
            title="Visibility"
            wide
            text="Private keeps a palette to your account. Unlisted gives it a public address without listing it, which is what you want for a client review. Public adds it to Explore, where it can be liked and found by search. You can change this whenever you like, and a link you already sent keeps working unless you switch back to private."
          />

          <RouterLink
            v-if="props.palette.visibility !== 'private'"
            :to="{ name: 'public-palette', params: { slug: props.palette.slug } }"
            class="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            :aria-label="`Open the public page for ${displayTitle}`"
          >
            <SquareArrowOutUpRight class="size-4" />
          </RouterLink>

          <AlertDialog>
            <AlertDialogTrigger as-child>
              <Button
                size="icon-sm"
                variant="ghost"
                :disabled="props.busy"
                class="text-muted-foreground hover:text-destructive"
                :aria-label="`Delete ${displayTitle}`"
              >
                <Trash2 />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {{ displayTitle }}?</AlertDialogTitle>
                <AlertDialogDescription>
                  The palette and its version history go away, and any link you shared stops
                  working. Open it in the generator first if you want to keep a share link for the
                  colors.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep it</AlertDialogCancel>
                <AlertDialogAction
                  class="bg-destructive text-white hover:bg-destructive/90"
                  @click="emit('remove')"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </template>
      </div>
    </div>
  </article>
</template>
