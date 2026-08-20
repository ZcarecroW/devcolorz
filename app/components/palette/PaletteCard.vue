<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import type { RouteLocationRaw } from 'vue-router'
import { Eye, Heart, SquareArrowOutUpRight, Trash2, Wand2 } from '@lucide/vue'
import { toast } from 'vue-sonner'
import InfoHint from '@/components/common/InfoHint.vue'
import {
  VISIBILITY_HINTS,
  VISIBILITY_LABELS,
  VISIBILITY_ORDER,
  bandsFor,
  relativeTime,
  type PaletteSummary,
  type PaletteVisibility,
} from '@/lib/palette/document'
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
                :label="choice.label"
                :description="choice.hint"
              />
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
