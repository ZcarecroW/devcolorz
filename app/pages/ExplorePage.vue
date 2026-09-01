<script setup lang="ts">
/**
 * The public gallery.
 *
 * Likes are optimistic and revert on failure: the server keys anonymous likes
 * by a salted hash of the address, so a like can legitimately be refused
 * (rate limit, moderation, a palette going private a second ago) and the UI
 * has to be able to take it back without a reload. Paging is an
 * IntersectionObserver on a sentinel that is always in the DOM, so the
 * observer never has to be re-attached as the grid grows.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { Clock, Compass, Flame, Heart, Search } from '@lucide/vue'
import { refDebounced } from '@vueuse/core'
import { toast } from 'vue-sonner'
import InfoHint from '@/components/common/InfoHint.vue'
import PaletteCard from '@/components/palette/PaletteCard.vue'
import { encodeForGenerator } from '@/lib/palette/document'
import type { PaletteListResponse, PaletteSummary } from '@/lib/palette/document'
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ApiError, api } from '@/lib/api'
import { usePaletteStore } from '@/stores/palette'

type ExploreSort = 'trending' | 'new' | 'likes'

const SORT_TABS: Array<{ value: ExploreSort; label: string; icon: typeof Flame }> = [
  { value: 'trending', label: 'Trending', icon: Flame },
  { value: 'new', label: 'New', icon: Clock },
  { value: 'likes', label: 'Most liked', icon: Heart },
]

const SORT_HINTS: Record<ExploreSort, string> = {
  trending: 'Likes weighted against age, so a palette from this morning can outrank one that has been collecting likes for a year. Featured palettes sit on top. This is the view worth browsing.',
  new: 'Newest first, unfiltered. Shows you what people are actually making right now, including the half of it that is not very good.',
  likes: 'Raw like count, all time. Stable and slow-moving — effectively the gallery’s greatest hits, and the same first page for months.',
}

/** Palette sizes worth filtering by; beyond ten, counts get sparse. */
const COUNT_OPTIONS = [3, 4, 5, 6, 7, 8, 9, 10]

const router = useRouter()
const palette = usePaletteStore()

const items = ref<PaletteSummary[]>([])
const nextCursor = ref<string | null>(null)
const loading = ref(true)
const loadingMore = ref(false)
const error = ref<string | null>(null)

const search = ref('')
const query = refDebounced(search, 250)
const sort = ref<ExploreSort>('trending')
/** 'any' rather than 0, so the selector has a real value to display. */
const colorCount = ref<string>('any')

/** Liked state is per session: the feed endpoint does not report it. */
const liked = ref<Record<string, boolean>>({})

const sentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

const sortHint = computed(() => SORT_HINTS[sort.value])
const isEmpty = computed(() => !loading.value && !error.value && items.value.length === 0)

function queryParams(cursor?: string | null) {
  return {
    sort: sort.value,
    q: query.value.trim(),
    count: colorCount.value === 'any' ? '' : colorCount.value,
    cursor: cursor ?? '',
  }
}

function describe(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback
}

/**
 * Re-observe the sentinel after a page lands.
 *
 * IntersectionObserver only fires on a *change*, so a first page too short to
 * push the sentinel below the fold would otherwise never trigger the next one.
 * Re-observing replays the current state, and the chain stops on its own as
 * soon as the grid grows past the viewport or the cursor runs out.
 */
function nudgeObserver() {
  requestAnimationFrame(() => {
    const element = sentinel.value
    if (!observer || !element) return
    observer.unobserve(element)
    observer.observe(element)
  })
}

/**
 * Bumped by every list request. The gallery refilters on three watched inputs
 * and pages from an intersection observer, so an in-flight page can easily
 * outlive the query that asked for it; a response holding a stale token is
 * dropped rather than appended to a list it does not belong to.
 */
let listToken = 0

async function load() {
  const token = ++listToken
  loading.value = true
  error.value = null
  try {
    const page = await api.get<PaletteListResponse>('/explore', { query: queryParams() })
    if (token !== listToken) return
    items.value = page.items
    nextCursor.value = page.nextCursor
  } catch (err) {
    if (token !== listToken) return
    items.value = []
    nextCursor.value = null
    error.value = describe(err, 'The gallery could not be reached. The generator works without it.')
  } finally {
    if (token === listToken) {
      loading.value = false
      nudgeObserver()
    }
  }
}

async function loadMore() {
  if (!nextCursor.value || loadingMore.value || loading.value) return
  const token = ++listToken
  const cursor = nextCursor.value
  loadingMore.value = true
  try {
    const page = await api.get<PaletteListResponse>('/explore', {
      query: queryParams(cursor),
    })
    if (token !== listToken) return
    // Guard against a duplicate page: offset paging can repeat an item when
    // something is published between two requests.
    const seen = new Set(items.value.map((item) => item.uuid))
    items.value = [...items.value, ...page.items.filter((item) => !seen.has(item.uuid))]
    nextCursor.value = page.nextCursor
  } catch (err) {
    if (token !== listToken) return
    // Keep the cursor: dropping it turns "one page failed" into "you have
    // reached the end of the gallery", which is a different and wrong claim.
    toast.error(describe(err, 'Could not load more palettes.'))
  } finally {
    if (token === listToken) {
      loadingMore.value = false
      nudgeObserver()
    }
  }
}

watch([query, sort, colorCount], () => void load())

onMounted(() => {
  void load()
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore()
    },
    // Start fetching before the sentinel is visible, so the grid rarely
    // actually stops.
    { rootMargin: '600px 0px' },
  )
  if (sentinel.value) observer.observe(sentinel.value)
})

onUnmounted(() => observer?.disconnect())

function patchItem(uuid: string, changes: Partial<PaletteSummary>) {
  items.value = items.value.map((item) => (item.uuid === uuid ? { ...item, ...changes } : item))
}

/** Palettes with a like request in flight: the endpoint toggles, so a second click must wait. */
const likeBusy = new Set<string>()

async function toggleLike(item: PaletteSummary) {
  if (likeBusy.has(item.uuid)) return
  likeBusy.add(item.uuid)
  const wasLiked = liked.value[item.uuid] ?? false
  const previousLikes = item.likes

  liked.value = { ...liked.value, [item.uuid]: !wasLiked }
  patchItem(item.uuid, { likes: Math.max(0, previousLikes + (wasLiked ? -1 : 1)) })

  try {
    const result = await api.post<{ likes: number; liked: boolean }>(
      `/palettes/${item.uuid}/like`,
    )
    liked.value = { ...liked.value, [item.uuid]: result.liked }
    patchItem(item.uuid, { likes: result.likes })
  } catch (err) {
    liked.value = { ...liked.value, [item.uuid]: wasLiked }
    patchItem(item.uuid, { likes: previousLikes })
    toast.error(describe(err, 'That like did not go through.'))
  } finally {
    likeBusy.delete(item.uuid)
  }
}

async function openInGenerator(item: PaletteSummary) {
  const encoded = await encodeForGenerator(item)
  if (!encoded) {
    toast.error('That palette has no readable colors')
    return
  }
  palette.title = item.title
  // Someone else's palette: opening it must not claim their saved record.
  palette.paletteUuid = null
  await router.push({ name: 'shared', params: { state: encoded } })
}

function clearFilters() {
  search.value = ''
  colorCount.value = 'any'
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
    <header>
      <h1 class="flex items-center gap-2 text-xl font-semibold tracking-tight">
        <Compass class="size-5 text-muted-foreground" aria-hidden="true" />
        Explore
      </h1>
      <p class="mt-1 text-sm text-muted-foreground">
        Palettes people chose to publish. Open any of them in the generator and it becomes yours to
        edit — nothing is copied to your account until you save it.
      </p>
    </header>

    <!-- Filters -->
    <div class="flex flex-wrap items-center gap-3">
      <Tabs v-model="sort">
        <TabsList>
          <TabsTrigger v-for="tab in SORT_TABS" :key="tab.value" :value="tab.value" class="gap-1.5">
            <component :is="tab.icon" class="size-3.5" aria-hidden="true" />
            {{ tab.label }}
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <InfoHint title="Sort order" wide :text="sortHint" />

      <div class="relative min-w-52 flex-1">
        <Search
          class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          v-model="search"
          class="pl-8"
          type="search"
          placeholder="Search titles or a hex value"
          aria-label="Search the gallery"
        />
      </div>

      <div class="flex items-center gap-2">
        <Label class="text-xs whitespace-nowrap text-muted-foreground">Colors</Label>
        <Select v-model="colorCount">
          <SelectTrigger size="sm" class="w-24" aria-label="Filter by number of colors">
            <SelectValue>{{ colorCount === 'any' ? 'Any' : colorCount }}</SelectValue>
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="any">Any</SelectItem>
            <SelectItem v-for="n in COUNT_OPTIONS" :key="n" :value="String(n)">
              {{ n }} colors
            </SelectItem>
          </SelectContent>
        </Select>
        <InfoHint
          title="Colors per palette"
          wide
          text="Matches the palette size exactly, not a minimum. Five is the house default and by far the most common, so filtering to four or six is a quick way to get past it. A palette that was saved with locks and names still counts every color it holds."
        />
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      <div v-for="n in 8" :key="n" class="overflow-hidden rounded-xl border bg-card">
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
        <Button size="sm" variant="outline" @click="load">Try again</Button>
        <Button as-child size="sm" variant="outline">
          <RouterLink :to="{ name: 'studio' }">Open the generator</RouterLink>
        </Button>
      </div>
    </div>

    <!-- Empty -->
    <div
      v-else-if="isEmpty"
      class="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card/40 px-6 py-14 text-center"
    >
      <Compass class="size-6 text-muted-foreground" aria-hidden="true" />
      <p class="text-sm font-medium">Nothing published matches that</p>
      <p class="max-w-md text-sm text-muted-foreground">
        Search covers titles and hex values, and the color filter is an exact match. Widening either
        one usually finds something.
      </p>
      <Button size="sm" variant="outline" @click="clearFilters">Clear filters</Button>
    </div>

    <!-- Grid -->
    <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      <PaletteCard
        v-for="item in items"
        :key="item.uuid"
        :palette="item"
        :to="{ name: 'public-palette', params: { slug: item.slug } }"
        show-owner
        likeable
        :liked="liked[item.uuid] ?? false"
        @open="openInGenerator(item)"
        @like="toggleLike(item)"
      />
    </div>

    <!-- Paging sentinel. Always mounted, so the observer is attached once. -->
    <div ref="sentinel" class="h-px w-full" aria-hidden="true" />

    <p v-if="loadingMore" class="text-center text-sm text-muted-foreground">Loading more…</p>
    <p
      v-else-if="!loading && !error && items.length && !nextCursor"
      class="text-center text-sm text-muted-foreground"
    >
      That is everything.
    </p>
  </div>
</template>
