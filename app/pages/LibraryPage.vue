<script setup lang="ts">
/**
 * The signed-in user's saved palettes.
 *
 * Saving is a convenience, not the product: everything here also exists as a
 * share link that needs no account at all, and the empty state says so rather
 * than pretending the library is the point. Opening a palette routes through
 * the studio's share URL instead of writing the store directly, because the
 * studio re-initialises from the route on mount and would otherwise discard
 * whatever we pushed in.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { LayoutGrid, Plus, Search, Sparkles } from '@lucide/vue'
import { refDebounced } from '@vueuse/core'
import { toast } from 'vue-sonner'
import InfoHint from '@/components/common/InfoHint.vue'
import PaletteCard from '@/components/palette/PaletteCard.vue'
import {
  docFromState,
  encodeForGenerator,
} from '@/lib/palette/document'
import type {
  PaletteListResponse,
  PaletteSummary,
  PaletteVisibility,
} from '@/lib/palette/document'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError, api } from '@/lib/api'
import { usePaletteStore } from '@/stores/palette'
import { useSessionStore } from '@/stores/session'

type LibrarySort = 'updated' | 'created' | 'name'

const SORT_LABELS: Record<LibrarySort, string> = {
  updated: 'Last edited',
  created: 'Date created',
  name: 'Title',
}

const SORT_HINTS: Record<LibrarySort, string> = {
  updated: 'Most recently edited first. The right default: what you touched last is almost always what you want next.',
  created: 'Newest first, and stable — a palette never moves because you renamed it.',
  name: 'Alphabetical, case-insensitive. Useful once you name palettes after projects rather than colors.',
}

const SORT_ORDER: LibrarySort[] = ['updated', 'created', 'name']

const palette = usePaletteStore()
const session = useSessionStore()
const router = useRouter()

const items = ref<PaletteSummary[]>([])
const nextCursor = ref<string | null>(null)
const loading = ref(true)
const loadingMore = ref(false)
const creating = ref(false)
/** Uuid of the palette with a write in flight, so only its card greys out. */
const busyUuid = ref<string | null>(null)
const error = ref<string | null>(null)
const signedOut = ref(false)

const search = ref('')
// Debounced so typing a hex does not fire six requests on the way to six digits.
const query = refDebounced(search, 250)
const sort = ref<LibrarySort>('updated')

const sortChoices = SORT_ORDER.map((value) => ({
  value,
  label: SORT_LABELS[value],
  hint: SORT_HINTS[value],
}))

const sortHint = computed(() => SORT_HINTS[sort.value])
const isEmpty = computed(() => !loading.value && !error.value && items.value.length === 0)
const isFiltered = computed(() => query.value.trim().length > 0)

function describe(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.isUnauthorized) signedOut.value = true
    return err.message
  }
  return fallback
}

/**
 * Bumped by every list request. A response whose token is stale belongs to a
 * search or sort the user has already moved on from, so it is dropped: without
 * this, a slow "load more" could append its page to a list that had since been
 * refiltered, and hand back the cursor that went with the old query.
 */
let listToken = 0

async function load() {
  const token = ++listToken
  loading.value = true
  error.value = null
  signedOut.value = false
  try {
    const page = await api.get<PaletteListResponse>('/palettes', {
      query: { q: query.value.trim(), sort: sort.value },
    })
    if (token !== listToken) return
    items.value = page.items
    nextCursor.value = page.nextCursor
  } catch (err) {
    if (token !== listToken) return
    items.value = []
    nextCursor.value = null
    error.value = describe(err, 'The library could not be reached. The rest of the app works offline.')
  } finally {
    if (token === listToken) loading.value = false
  }
}

async function loadMore() {
  if (!nextCursor.value || loadingMore.value) return
  const token = ++listToken
  const cursor = nextCursor.value
  loadingMore.value = true
  try {
    const page = await api.get<PaletteListResponse>('/palettes', {
      query: { q: query.value.trim(), sort: sort.value, cursor },
    })
    if (token !== listToken) return
    items.value = [...items.value, ...page.items]
    nextCursor.value = page.nextCursor
  } catch (err) {
    if (token !== listToken) return
    // Keep the cursor. Clearing it would make the grid claim the list is
    // complete when all that happened is one page failed to arrive.
    toast.error(describe(err, 'Could not load more palettes.'))
  } finally {
    if (token === listToken) loadingMore.value = false
  }
}

watch([query, sort], () => void load())
onMounted(() => void load())

/** Replace one item in place, keeping the current sort order. */
function replace(updated: PaletteSummary) {
  items.value = items.value.map((item) => (item.uuid === updated.uuid ? updated : item))
}

async function saveCurrent() {
  // The button is disabled while this runs, but only from the next render —
  // the flag is set here and the attribute lands a tick later. Clicks that
  // arrive inside that window get through, and each one creates a palette. A
  // guard in the function is the one that cannot be outrun.
  if (creating.value) return
  if (!palette.count) {
    toast.error('The generator has no colors to save yet')
    return
  }
  creating.value = true
  try {
    const created = await api.post<PaletteSummary>('/palettes', {
      title: palette.title.trim(),
      doc: docFromState(palette.toState()),
      visibility: 'private',
    })
    items.value = [created, ...items.value]
    palette.paletteUuid = created.uuid
    palette.title = created.title
    palette.dirty = false
    toast.success('Saved to your library', {
      description: 'Private until you say otherwise.',
    })
  } catch (err) {
    toast.error(describe(err, 'That palette could not be saved.'))
  } finally {
    creating.value = false
  }
}

async function patch(
  item: PaletteSummary,
  changes: Record<string, unknown>,
  failure: string,
  { busy = true } = {},
): Promise<boolean> {
  if (busy) busyUuid.value = item.uuid
  try {
    replace(await api.patch<PaletteSummary>(`/palettes/${item.uuid}`, changes))
    return true
  } catch (err) {
    toast.error(describe(err, failure))
    return false
  } finally {
    if (busy) busyUuid.value = null
  }
}

function rename(item: PaletteSummary, title: string) {
  // Deliberately not busy. A rename is committed on blur, so the click that
  // moved focus away — onto Delete, or Open, or the visibility select — lands
  // while the request is still in flight, and disabling the card would eat it.
  // The card shows the new title optimistically and a failure still raises a
  // toast, so there is nothing here worth disabling the controls for.
  void patch(item, { title }, 'The new title could not be saved.', { busy: false })
}

async function setVisibility(item: PaletteSummary, visibility: PaletteVisibility) {
  // Only interpret the result if the write actually happened — otherwise the
  // unchanged value looks exactly like a moderation downgrade, and a failure
  // was being reported as "Queued for review".
  if (!(await patch(item, { visibility }, 'The visibility could not be changed.'))) return
  // Moderation can downgrade a request to publish, so report what actually
  // happened rather than what was asked for.
  const applied = items.value.find((entry) => entry.uuid === item.uuid)?.visibility
  if (applied && applied !== visibility && visibility === 'public') {
    toast.info('Queued for review', {
      description: 'This site reviews palettes before they appear in Explore. Yours is unlisted until then.',
    })
  }
}

async function remove(item: PaletteSummary) {
  busyUuid.value = item.uuid
  try {
    await api.delete(`/palettes/${item.uuid}`)
    items.value = items.value.filter((entry) => entry.uuid !== item.uuid)
    if (palette.paletteUuid === item.uuid) palette.paletteUuid = null
    toast.success('Deleted')
  } catch (err) {
    toast.error(describe(err, 'That palette could not be deleted.'))
  } finally {
    busyUuid.value = null
  }
}

async function openInGenerator(item: PaletteSummary) {
  const encoded = await encodeForGenerator(item)
  if (!encoded) {
    toast.error('That palette has no readable colors')
    return
  }
  palette.title = item.title
  palette.paletteUuid = item.uuid
  await router.push({ name: 'shared', params: { state: encoded } })
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <LayoutGrid class="size-5 text-muted-foreground" aria-hidden="true" />
          My palettes
        </h1>
        <p class="mt-1 text-sm text-muted-foreground">
          {{ session.user?.displayName ? `Signed in as ${session.user.displayName}.` : '' }}
          Saved palettes sync across your devices. Everything here also works as a share link.
        </p>
      </div>
      <Button :disabled="creating || !palette.count" @click="saveCurrent">
        <Plus /> New from current palette
      </Button>
    </header>

    <!-- Toolbar -->
    <div class="flex flex-wrap items-center gap-2">
      <div class="relative min-w-56 flex-1">
        <Search
          class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          v-model="search"
          class="pl-8"
          type="search"
          placeholder="Search titles or a hex value"
          aria-label="Search your palettes"
        />
      </div>

      <div class="flex items-center gap-2">
        <Label class="text-xs text-muted-foreground">Sort</Label>
        <Select v-model="sort">
          <SelectTrigger size="sm" class="w-40" aria-label="Sort palettes">
            <SelectValue>{{ SORT_LABELS[sort] }}</SelectValue>
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem
              v-for="choice in sortChoices"
              :key="choice.value"
              :value="choice.value"
              :label="choice.label"
              :description="choice.hint"
            />
          </SelectContent>
        </Select>
        <InfoHint title="Sort order" wide :text="sortHint" />
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      <div v-for="n in 6" :key="n" class="overflow-hidden rounded-xl border bg-card">
        <Skeleton class="h-24 w-full rounded-none sm:h-28" />
        <div class="flex flex-col gap-2 p-3">
          <Skeleton class="h-4 w-2/3" />
          <Skeleton class="h-3 w-1/2" />
          <Skeleton class="h-8 w-full" />
        </div>
      </div>
    </div>

    <!-- Error -->
    <div
      v-else-if="error"
      class="rounded-lg border border-destructive/40 bg-card p-4 text-sm text-destructive"
      role="alert"
    >
      <p>{{ error }}</p>
      <div class="mt-3 flex gap-2">
        <Button v-if="signedOut" as-child size="sm" variant="outline">
          <RouterLink :to="{ name: 'login' }">Sign in</RouterLink>
        </Button>
        <Button size="sm" variant="outline" @click="load">Try again</Button>
      </div>
    </div>

    <!-- Empty -->
    <div
      v-else-if="isEmpty"
      class="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card/40 px-6 py-14 text-center"
    >
      <Sparkles class="size-6 text-muted-foreground" aria-hidden="true" />
      <template v-if="isFiltered">
        <p class="text-sm font-medium">Nothing matches “{{ query }}”</p>
        <p class="max-w-md text-sm text-muted-foreground">
          Search covers titles and hex values. Try three digits of a color, or clear the box.
        </p>
        <Button size="sm" variant="outline" @click="search = ''">Clear search</Button>
      </template>
      <template v-else>
        <p class="text-sm font-medium">No saved palettes yet</p>
        <p class="max-w-md text-sm leading-relaxed text-muted-foreground">
          You do not need an account to use DevColorz — every palette lives in its own URL, and
          copying that link is a complete backup. An account adds one thing: the same palettes on
          every device, under names you chose, without a bookmark folder.
        </p>
        <div class="mt-1 flex flex-wrap justify-center gap-2">
          <Button as-child size="sm" variant="outline">
            <RouterLink :to="{ name: 'studio' }">Open the generator</RouterLink>
          </Button>
          <Button size="sm" :disabled="creating || !palette.count" @click="saveCurrent">
            <Plus /> Save the current palette
          </Button>
        </div>
      </template>
    </div>

    <!-- Grid -->
    <template v-else>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        <PaletteCard
          v-for="item in items"
          :key="item.uuid"
          :palette="item"
          owned
          :busy="busyUuid === item.uuid"
          @open="openInGenerator(item)"
          @rename="rename(item, $event)"
          @visibility="setVisibility(item, $event)"
          @remove="remove(item)"
        />
      </div>

      <div v-if="nextCursor" class="flex justify-center">
        <Button variant="outline" :disabled="loadingMore" @click="loadMore">
          {{ loadingMore ? 'Loading…' : 'Load more' }}
        </Button>
      </div>
    </template>
  </div>
</template>
