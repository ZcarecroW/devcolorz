<script setup lang="ts">
/**
 * A published palette at its own address.
 *
 * This page has to be worth landing on cold, so it carries the two exports
 * people actually paste — CSS custom properties and a Tailwind v4 `@theme`
 * block — generated through the same `buildGraph` the studio uses, rather than
 * a second string-building path that would drift from it. Dark counterparts,
 * scales and alpha ladders are deliberately left off here: they triple the
 * length of the snippet, and the export panel in the studio is where you tune
 * that.
 */
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Check, Copy, Eye, Heart, Link2, Wand2 } from '@lucide/vue'
import { toast } from 'vue-sonner'
import InfoHint from '@/components/common/InfoHint.vue'
import { bandsFor, encodeForGenerator, relativeTime } from '@/lib/palette/document'
import { rememberLink } from '@/lib/palette/identity'
import type { PaletteBand, PaletteDetail } from '@/lib/palette/document'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ApiError, api } from '@/lib/api'
import { formatColor, parseColor } from '@/lib/color/convert'
import { describeColor, nearestName } from '@/lib/color/name'
import type { Oklch, Swatch } from '@/lib/color/types'
import { DEFAULT_EXPORT_CONFIG } from '@/lib/export/config'
import { EMITTERS_BY_ID } from '@/lib/export/emitters'
import { buildGraph } from '@/lib/export/graph'

const SNIPPET_TABS = [
  { id: 'css', label: 'CSS' },
  { id: 'tailwind4', label: 'Tailwind v4' },
] as const

const route = useRoute()
const router = useRouter()

const detail = ref<PaletteDetail | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const missing = ref(false)
const liked = ref(false)
const likes = ref(0)
const copied = ref<string | null>(null)
const snippetId = ref<string>('css')

/**
 * Colors are raw objects, so they live in a `shallowRef` and are replaced
 * wholesale rather than being wrapped in a deep proxy.
 */
const colors = shallowRef<Oklch[]>([])
const storedNames = ref<string[]>([])
/** Curated names arrive from a lazily loaded index, so they land later. */
const curatedNames = ref<string[]>([])

const slug = computed(() => String(route.params.slug ?? ''))
const bands = computed<PaletteBand[]>(() => bandsFor(detail.value?.colors ?? []))

const ownerName = computed(() => detail.value?.owner?.displayName ?? 'Anonymous')
const createdLabel = computed(() =>
  detail.value ? new Date(detail.value.createdAt * 1000).toLocaleDateString() : '',
)
const updatedLabel = computed(() =>
  detail.value ? relativeTime(detail.value.updatedAt) : '',
)

/** The public URL for this page, including the hash route. */
const shareUrl = computed(
  () => `${location.origin}${location.pathname}#/s/${encodeURIComponent(slug.value)}`,
)

const entries = computed(() =>
  colors.value.map((color, index) => ({
    key: `c${index}`,
    color,
    hex: formatColor(color, 'hex'),
    oklch: formatColor(color, 'oklch'),
    name: storedNames.value[index] || curatedNames.value[index] || describeColor(color),
  })),
)

/**
 * Swatches for the export graph. Ids are positional so the generated variable
 * names are stable for anyone who copies the snippet twice.
 */
const swatches = computed<Swatch[]>(() =>
  entries.value.map((entry, index) => ({
    id: `p${index}`,
    color: entry.color,
    name: storedNames.value[index] || curatedNames.value[index] || '',
    locked: false,
  })),
)

const snippets = computed<Record<string, string>>(() => {
  if (!swatches.value.length) return { css: '', tailwind4: '' }
  const config = {
    ...DEFAULT_EXPORT_CONFIG,
    format: 'oklch' as const,
    emitDark: false,
    emitScales: false,
    emitAlpha: false,
  }
  try {
    const graph = buildGraph(swatches.value, config, detail.value?.title || 'Palette')
    return {
      css: EMITTERS_BY_ID.css.emit(graph),
      tailwind4: EMITTERS_BY_ID.tailwind4.emit(graph),
    }
  } catch {
    // A malformed stored palette must not take the whole page down.
    return { css: '', tailwind4: '' }
  }
})

const activeSnippet = computed(() => snippets.value[snippetId.value] ?? '')
const snippetHint = computed(() => EMITTERS_BY_ID[snippetId.value]?.hint ?? '')

async function load() {
  loading.value = true
  error.value = null
  missing.value = false
  try {
    const result = await api.get<PaletteDetail>(`/explore/${encodeURIComponent(slug.value)}`)
    detail.value = result
    liked.value = result.liked
    likes.value = result.likes

    /*
     * The stored document is preferred, the flat hex list is the fallback.
     *
     * `doc` is whatever was written through the API, which is not necessarily
     * what this app writes — a document whose colors are bare strings rather
     * than objects yielded nothing here and the page showed "could not be
     * loaded" for a palette the server had returned perfectly well. The flat
     * `colors` list is derived server-side and is always the right shape, so
     * it is what an unreadable document falls back to.
     */
    const readColors = (source: ReadonlyArray<{ hex?: string; name?: string } | string>) => {
      const out: { color: Oklch; name: string }[] = []
      for (const entry of source) {
        const hex = typeof entry === 'string' ? entry : entry?.hex
        const color = parseColor(hex as string)
        if (!color) continue
        out.push({ color, name: (typeof entry === 'string' ? '' : entry?.name) ?? '' })
      }
      return out
    }

    const entries = readColors(result.doc?.colors ?? [])
    const usable = entries.length ? entries : readColors(result.colors ?? [])
    const parsed = usable.map((e) => e.color)
    const names = usable.map((e) => e.name)
    colors.value = parsed
    storedNames.value = names
    curatedNames.value = []
    void loadCuratedNames(parsed)
  } catch (err) {
    detail.value = null
    colors.value = []
    if (err instanceof ApiError && err.status === 404) {
      missing.value = true
    } else {
      error.value =
        err instanceof ApiError ? err.message : 'That palette could not be loaded right now.'
    }
  } finally {
    loading.value = false
  }
}

/** Upgrade the structural descriptions to curated names once the index loads. */
async function loadCuratedNames(list: Oklch[]) {
  const token = slug.value
  const resolved = await Promise.all(list.map((color) => nearestName(color)))
  if (token !== slug.value) return
  curatedNames.value = resolved.map((entry) => entry.name)
}

onMounted(() => void load())
watch(slug, () => void load())

async function copy(text: string, key: string, message: string) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = key
    window.setTimeout(() => {
      if (copied.value === key) copied.value = null
    }, 1600)
    toast.success(message)
  } catch {
    toast.error('Could not reach the clipboard')
  }
}

/** The endpoint toggles, so a second click while the first is in flight must wait. */
let likeBusy = false

async function toggleLike() {
  const item = detail.value
  if (!item || likeBusy) return
  likeBusy = true
  const wasLiked = liked.value
  const previous = likes.value
  liked.value = !wasLiked
  likes.value = Math.max(0, previous + (wasLiked ? -1 : 1))
  try {
    const result = await api.post<{ likes: number; liked: boolean }>(
      `/palettes/${item.uuid}/like`,
    )
    liked.value = result.liked
    likes.value = result.likes
  } catch (err) {
    liked.value = wasLiked
    likes.value = previous
    toast.error(err instanceof ApiError ? err.message : 'That like did not go through.')
  } finally {
    likeBusy = false
  }
}

async function openInGenerator() {
  const item = detail.value
  if (!item) return
  const encoded = await encodeForGenerator(item)
  if (!encoded) {
    toast.error('That palette has no readable colors')
    return
  }
  // Somebody else's record: the studio gets its title and no saved record, so
  // opening it cannot claim their uuid and Save there makes a copy of your own.
  rememberLink(encoded, { uuid: null, title: item.title, dirty: false })
  await router.push({ name: 'shared', params: { state: encoded } })
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
    <Button as-child variant="ghost" size="sm" class="-ml-2 self-start text-muted-foreground">
      <RouterLink :to="{ name: 'explore' }"><ArrowLeft /> Back to Explore</RouterLink>
    </Button>

    <!-- Loading -->
    <template v-if="loading">
      <Skeleton class="h-52 w-full rounded-xl md:h-64" />
      <Skeleton class="h-6 w-64" />
      <Skeleton class="h-32 w-full" />
    </template>

    <!-- Missing -->
    <div
      v-else-if="missing"
      class="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card/40 px-6 py-14 text-center"
    >
      <p class="text-sm font-medium">No palette at this address</p>
      <p class="max-w-md text-sm text-muted-foreground">
        It was deleted, or its owner set it back to private. Published palettes keep their address
        for as long as they stay published.
      </p>
      <div class="flex gap-2">
        <Button as-child size="sm" variant="outline">
          <RouterLink :to="{ name: 'explore' }">Browse Explore</RouterLink>
        </Button>
        <Button as-child size="sm">
          <RouterLink :to="{ name: 'studio' }">Open the generator</RouterLink>
        </Button>
      </div>
    </div>

    <!-- Error -->
    <div
      v-else-if="error"
      class="rounded-lg border border-destructive/40 bg-card p-4 text-sm text-destructive"
      role="alert"
    >
      <p>{{ error }}</p>
      <Button size="sm" variant="outline" class="mt-3" @click="load">Try again</Button>
    </div>

    <template v-else-if="detail">
      <!-- The palette itself, painted from its own colors. -->
      <div class="flex h-52 w-full overflow-hidden rounded-xl border md:h-64">
        <div
          v-for="(band, index) in bands"
          :key="band.hex"
          class="flex flex-1 flex-col items-center justify-end gap-0.5 pb-3"
          :style="{ background: band.css }"
        >
          <span class="font-mono text-[11px] font-medium" :style="{ color: band.text }">
            {{ band.hex }}
          </span>
          <span
            class="max-w-full truncate px-1 text-[10px] opacity-80"
            :style="{ color: band.text }"
          >
            {{ entries[index]?.name }}
          </span>
        </div>
      </div>

      <!-- Identity and actions -->
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <h1 class="text-xl font-semibold tracking-tight">
            {{ detail.title || 'Untitled palette' }}
          </h1>
          <p class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span>by {{ ownerName }}</span>
            <span aria-hidden="true">·</span>
            <span :title="`Updated ${updatedLabel}`">{{ createdLabel }}</span>
            <span aria-hidden="true">·</span>
            <span>{{ detail.colorCount }} colors</span>
            <span class="inline-flex items-center gap-1">
              <Eye class="size-3.5" aria-hidden="true" />
              <span class="tabular-nums">{{ detail.views }}</span>
              <span class="sr-only">views</span>
            </span>
          </p>
          <p v-if="detail.description" class="mt-2 max-w-prose text-sm leading-relaxed">
            {{ detail.description }}
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <Button
            :variant="liked ? 'default' : 'outline'"
            :aria-pressed="liked"
            :aria-label="liked ? 'Remove your like' : 'Like this palette'"
            @click="toggleLike"
          >
            <Heart :class="liked && 'fill-current'" />
            <span class="tabular-nums">{{ likes }}</span>
          </Button>
          <Button variant="outline" @click="copy(shareUrl, 'link', 'Link copied')">
            <Check v-if="copied === 'link'" /><Link2 v-else />
            Copy link
          </Button>
          <Button @click="openInGenerator"><Wand2 /> Open in generator</Button>
        </div>
      </div>

      <!-- Colors -->
      <section class="flex flex-col gap-2">
        <h2 class="text-sm font-semibold tracking-tight">Colors</h2>
        <ul class="grid gap-2 sm:grid-cols-2">
          <li
            v-for="entry in entries"
            :key="entry.key"
            class="flex items-center gap-3 rounded-lg border bg-card p-2"
          >
            <span
              class="size-10 shrink-0 rounded-md border"
              :style="{ background: entry.oklch }"
              aria-hidden="true"
            />
            <span class="flex min-w-0 flex-col">
              <span class="truncate text-sm font-medium">{{ entry.name }}</span>
              <span class="font-mono text-xs text-muted-foreground">{{ entry.oklch }}</span>
            </span>
            <span class="flex-1" />
            <Button
              variant="ghost"
              size="sm"
              class="font-mono text-xs"
              :aria-label="`Copy ${entry.hex}`"
              @click="copy(entry.hex, entry.key, `Copied ${entry.hex}`)"
            >
              <Check v-if="copied === entry.key" /><Copy v-else />
              {{ entry.hex }}
            </Button>
          </li>
        </ul>
      </section>

      <!-- Export snippets -->
      <section class="flex flex-col gap-2">
        <div class="flex items-center gap-2">
          <h2 class="text-sm font-semibold tracking-tight">Copy into your project</h2>
          <InfoHint
            title="What is in these snippets"
            wide
            text="Base tokens only, in oklch() notation, one variable per color. Dark-mode counterparts, tonal scales and transparent variants are left out on purpose — they would make this three times as long, and the export panel in the generator lets you turn each of them on and see the result before you copy it."
          />
        </div>

        <Tabs v-model="snippetId">
          <div class="flex items-center gap-2">
            <TabsList>
              <TabsTrigger v-for="tab in SNIPPET_TABS" :key="tab.id" :value="tab.id">
                {{ tab.label }}
              </TabsTrigger>
            </TabsList>
            <InfoHint title="Format" wide :text="snippetHint" />
            <span class="flex-1" />
            <Button
              variant="outline"
              size="sm"
              :disabled="!activeSnippet"
              @click="copy(activeSnippet, `snippet-${snippetId}`, 'Snippet copied')"
            >
              <Check v-if="copied === `snippet-${snippetId}`" /><Copy v-else />
              Copy
            </Button>
          </div>

          <TabsContent v-for="tab in SNIPPET_TABS" :key="tab.id" :value="tab.id" class="mt-2">
            <pre
              class="scroll-slim max-h-96 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed"
            ><code>{{ snippets[tab.id] }}</code></pre>
          </TabsContent>
        </Tabs>
      </section>
    </template>
  </div>
</template>
