<script setup lang="ts">
/**
 * Moderation for saved palettes.
 *
 * Each row shows the actual colors rather than a title, because a palette named
 * "untitled 4" tells you nothing and the strip tells you everything. Those
 * swatches are the one place on this page painted from user data, so they are
 * inline styles; every other surface stays on the theme tokens.
 */
import { computed, onMounted, ref } from 'vue'
import { EyeOff, Search, Star, TriangleAlert } from '@lucide/vue'
import { watchDebounced } from '@vueuse/core'
import { toast } from 'vue-sonner'
import { RouterLink } from 'vue-router'
import InfoHint from '@/components/common/InfoHint.vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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

type Visibility = 'private' | 'unlisted' | 'public'

interface AdminPalette {
  uuid: string
  slug: string
  title: string
  colors: string[]
  colorCount: number
  visibility: Visibility
  featured: boolean
  likes: number
  views: number
  createdAt: number
  updatedAt: number
  owner?: { displayName: string }
}

interface PalettesResponse {
  items: AdminPalette[]
  nextCursor: string | null
}

const ANY = 'any'

const query = ref('')
const visibility = ref<string>(ANY)

const items = ref<AdminPalette[]>([])
const cursor = ref<string | null>(null)
const loading = ref(false)
const loadingMore = ref(false)
const error = ref<string | null>(null)
const busy = ref<string | null>(null)

function describe(err: unknown): string {
  if (err instanceof ApiError) return err.message
  return 'The API did not answer. The backend may be offline or not installed yet.'
}

async function load(more = false) {
  if (more) loadingMore.value = true
  else loading.value = true
  error.value = null
  try {
    const response = await api.get<PalettesResponse>('/admin/palettes', {
      query: {
        q: query.value || undefined,
        visibility: visibility.value === ANY ? undefined : visibility.value,
        cursor: more ? cursor.value ?? undefined : undefined,
      },
    })
    items.value = more ? [...items.value, ...response.items] : response.items
    cursor.value = response.nextCursor
  } catch (err) {
    error.value = describe(err)
    if (!more) items.value = []
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

onMounted(() => void load())

watchDebounced([query, visibility], () => void load(), { debounce: 250 })

async function patchPalette(
  palette: AdminPalette,
  changes: Record<string, unknown>,
  note: string,
) {
  busy.value = palette.uuid
  error.value = null
  try {
    const updated = await api.patch<AdminPalette>(`/admin/palettes/${palette.uuid}`, changes)
    items.value = items.value.map((row) =>
      row.uuid === palette.uuid ? { ...row, ...updated } : row,
    )
    toast.success(note)
  } catch (err) {
    error.value = describe(err)
  } finally {
    busy.value = null
  }
}

function ago(ts: number): string {
  const delta = Math.max(0, Math.floor(Date.now() / 1000) - ts)
  if (delta < 3600) return `${Math.max(1, Math.floor(delta / 60))} min ago`
  if (delta < 86400) return `${Math.floor(delta / 3600)} h ago`
  return `${Math.floor(delta / 86400)} d ago`
}

const summary = computed(() =>
  loading.value ? 'Loading' : `${items.value.length} shown${cursor.value ? ', more available' : ''}`,
)
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3">
      <div class="flex min-w-56 flex-1 flex-col gap-1">
        <Label for="palette-search" class="text-xs">
          Search
          <InfoHint
            title="Title or hex"
            wide
            text="Matches the title and the stored hex list, so pasting a color finds every palette that contains it. That is the fastest way to answer a takedown request that arrives with a screenshot and no name."
          />
        </Label>
        <div class="relative">
          <Search
            class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="palette-search"
            v-model="query"
            class="h-8 pl-8 text-sm"
            placeholder="title or #hex"
          />
        </div>
      </div>

      <div class="flex flex-col gap-1">
        <Label for="palette-visibility" class="text-xs">
          Visibility
          <InfoHint
            title="Three states"
            wide
            text="Private is visible only to its owner. Unlisted is reachable by anyone holding the link but appears in no listing and is excluded from the gallery. Public is listed and indexable. Moving something down this ladder does not change its URL, so old links keep working for unlisted and stop working for private."
          />
        </Label>
        <Select v-model="visibility">
          <SelectTrigger
            id="palette-visibility"
            size="sm"
            class="w-40"
            aria-label="Filter by visibility"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="ANY">Any visibility</SelectItem>
            <SelectItem value="public">Public</SelectItem>
            <SelectItem value="unlisted">Unlisted</SelectItem>
            <SelectItem value="private">Private</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <span class="ml-auto text-xs text-muted-foreground">{{ summary }}</span>
    </div>

    <Alert v-if="error" variant="destructive">
      <TriangleAlert />
      <AlertTitle>That did not work</AlertTitle>
      <AlertDescription>
        <p>{{ error }}</p>
        <Button variant="outline" size="sm" class="mt-2" @click="load()">Reload the list</Button>
      </AlertDescription>
    </Alert>

    <div v-if="loading" class="flex flex-col gap-2">
      <Skeleton v-for="n in 6" :key="n" class="h-20" />
    </div>

    <p
      v-else-if="!items.length"
      class="rounded-xl border bg-card px-4 py-10 text-center text-sm text-muted-foreground"
    >
      No palettes match these filters.
    </p>

    <ul v-else class="flex flex-col gap-2">
      <li
        v-for="palette in items"
        :key="palette.uuid"
        class="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3"
        :class="busy === palette.uuid ? 'opacity-60' : ''"
      >
        <!-- Painted from the user's palette, so inline styles rather than tokens. -->
        <div
          class="flex h-10 w-28 shrink-0 overflow-hidden rounded-md border"
          role="img"
          :aria-label="`${palette.colorCount} colors: ${palette.colors.join(', ')}`"
        >
          <span
            v-for="(color, index) in palette.colors"
            :key="index"
            class="h-full flex-1"
            :style="{ background: color }"
          />
        </div>

        <div class="flex min-w-40 flex-1 flex-col">
          <span class="truncate text-sm font-medium">{{ palette.title || 'Untitled' }}</span>
          <span class="truncate text-xs text-muted-foreground">
            {{ palette.owner?.displayName || 'anonymous' }} ·
            {{ palette.colorCount }} colors ·
            {{ palette.views }} views ·
            {{ palette.likes }} likes ·
            updated {{ ago(palette.updatedAt) }}
          </span>
        </div>

        <Select
          :model-value="palette.visibility"
          :disabled="busy === palette.uuid"
          @update:model-value="
            patchPalette(palette, { visibility: String($event) }, 'Visibility changed')
          "
        >
          <SelectTrigger size="sm" class="w-32" :aria-label="`Visibility of ${palette.title}`">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="public">Public</SelectItem>
            <SelectItem value="unlisted">Unlisted</SelectItem>
            <SelectItem value="private">Private</SelectItem>
          </SelectContent>
        </Select>

        <Button
          :variant="palette.featured ? 'default' : 'outline'"
          size="sm"
          :disabled="busy === palette.uuid"
          :aria-pressed="palette.featured"
          :aria-label="`${palette.featured ? 'Unfeature' : 'Feature'} ${palette.title}`"
          @click="
            patchPalette(
              palette,
              { featured: !palette.featured },
              palette.featured ? 'Removed from the gallery front' : 'Featured',
            )
          "
        >
          <Star /> {{ palette.featured ? 'Featured' : 'Feature' }}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          class="text-destructive hover:text-destructive"
          :disabled="busy === palette.uuid || palette.visibility === 'private'"
          :aria-label="`Take down ${palette.title}`"
          @click="patchPalette(palette, { takedown: true }, 'Taken down')"
        >
          <EyeOff /> Take down
        </Button>

        <RouterLink
          v-if="palette.visibility !== 'private'"
          :to="{ name: 'public-palette', params: { slug: palette.slug } }"
          class="text-xs text-primary underline-offset-4 hover:underline"
        >
          Open
        </RouterLink>
      </li>
    </ul>

    <div class="flex flex-wrap items-center gap-3">
      <Button v-if="cursor" variant="outline" size="sm" :disabled="loadingMore" @click="load(true)">
        {{ loadingMore ? 'Loading…' : 'Load more' }}
      </Button>
      <p class="flex items-center gap-1.5 text-xs text-muted-foreground">
        Taking a palette down makes it private and unfeatures it in one step.
        <InfoHint
          title="What a takedown does"
          wide
          text="It sets the palette to private and clears its featured flag, which removes it from the gallery and from any link that was shared. Nothing is deleted and the owner keeps their copy, so it is the reversible response to a complaint you have not finished investigating."
        />
      </p>
    </div>
  </div>
</template>
