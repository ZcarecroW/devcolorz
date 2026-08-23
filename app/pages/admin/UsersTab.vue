<script setup lang="ts">
/**
 * The user list and the things you can do to a user.
 *
 * Role and status are edited in place because those are the two changes an
 * administrator actually makes; everything destructive or irreversible sits
 * behind the row menu, and deletion behind a confirmation that names the
 * account. The server revokes sessions on any role or status change, so the
 * list reloads nothing and simply merges the row it gets back.
 */
import { computed, onMounted, ref } from 'vue'
import {
  BadgeCheck,
  KeyRound,
  Ellipsis,
  Search,
  ShieldX,
  Trash2,
  TriangleAlert,
  UserCog,
} from '@lucide/vue'
import { watchDebounced } from '@vueuse/core'
import { toast } from 'vue-sonner'
import InfoHint from '@/components/common/InfoHint.vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ApiError, api } from '@/lib/api'
import { useSessionStore } from '@/stores/session'

type Role = 'user' | 'admin'
type Status = 'pending' | 'active' | 'suspended'

interface AdminUser {
  id: number
  uuid: string
  email: string
  displayName: string
  role: Role
  status: Status
  emailVerified: boolean
  createdAt: number
  lastLoginAt?: number | null
  palettes?: number
}

interface UsersResponse {
  items: AdminUser[]
  nextCursor: string | null
}

const emit = defineEmits<{
  /** Something changed that the overview strip counts. */
  (e: 'changed'): void
}>()

const session = useSessionStore()

/** 'any' rather than '' because a select item cannot carry an empty value. */
const ANY = 'any'

const query = ref('')
const status = ref<string>(ANY)
const role = ref<string>(ANY)

const items = ref<AdminUser[]>([])
const cursor = ref<string | null>(null)
const loading = ref(false)
const loadingMore = ref(false)
const error = ref<string | null>(null)
const busyId = ref<number | null>(null)
/**
 * Who the confirmation dialog is about, and whether it is open.
 *
 * Two refs, deliberately. `AlertDialogAction` is reka's `DialogClose`, so it
 * closes the dialog from its own click handler — and Vue runs a child's own
 * handler before the one that falls through from the parent. Deriving the
 * dialog's open state from `pendingDelete` therefore meant the close had
 * already set it to null by the time `confirmDelete` read it: the dialog shut,
 * nothing was requested, no error was shown, and the account stayed on the
 * list. Keeping the payload separate from the visibility removes the ordering
 * dependency entirely.
 */
const pendingDelete = ref<AdminUser | null>(null)
const deleteOpen = ref(false)

function askDelete(user: AdminUser) {
  pendingDelete.value = user
  deleteOpen.value = true
}

function describe(err: unknown): string {
  if (err instanceof ApiError) return err.message
  return 'The API did not answer. The backend may be offline or not installed yet.'
}

/** Bumped per request, so a stale page cannot land on a newer filter. */
let listToken = 0

async function load(more = false) {
  const token = ++listToken
  if (more) loadingMore.value = true
  else loading.value = true
  error.value = null
  try {
    const response = await api.get<UsersResponse>('/admin/users', {
      query: {
        q: query.value || undefined,
        status: status.value === ANY ? undefined : status.value,
        role: role.value === ANY ? undefined : role.value,
        cursor: more ? cursor.value ?? undefined : undefined,
      },
    })
    if (token !== listToken) return
    items.value = more ? [...items.value, ...response.items] : response.items
    cursor.value = response.nextCursor
  } catch (err) {
    if (token !== listToken) return
    error.value = describe(err)
    if (!more) items.value = []
  } finally {
    // Only the flag this call set. Clearing both meant a finishing "load more"
    // re-enabled a search that was still in flight, and a finishing search
    // re-enabled the Load more button mid-request — which appended the same
    // page twice.
    if (token === listToken) {
      if (more) loadingMore.value = false
      else loading.value = false
    }
  }
}

onMounted(() => void load())

// Debounced so typing a search term does not issue a request per keystroke.
watchDebounced([query, status, role], () => void load(), { debounce: 250 })

async function patchUser(user: AdminUser, changes: Partial<Record<string, unknown>>, note: string) {
  busyId.value = user.id
  error.value = null
  try {
    const updated = await api.patch<Partial<AdminUser>>(`/admin/users/${user.id}`, changes)
    // The response is the public shape, which drops the numeric id and the
    // counts this table shows — merge rather than replace.
    items.value = items.value.map((row) => (row.id === user.id ? { ...row, ...updated } : row))
    emit('changed')
    toast.success(note)
  } catch (err) {
    // The select snaps back on its own, which on a long list looks like the
    // click missed. The server's reason — "that is the only administrator" —
    // is the useful part, so it goes where the change was made as well as in
    // the banner at the top.
    error.value = describe(err)
    toast.error('That change was refused', { description: error.value })
  } finally {
    busyId.value = null
  }
}

async function act(user: AdminUser, path: string, note: string) {
  busyId.value = user.id
  error.value = null
  try {
    await api.post(`/admin/users/${user.id}/${path}`)
    toast.success(note)
  } catch (err) {
    error.value = describe(err)
  } finally {
    busyId.value = null
  }
}

async function confirmDelete() {
  const user = pendingDelete.value
  if (!user) return
  deleteOpen.value = false
  busyId.value = user.id
  error.value = null
  try {
    await api.delete(`/admin/users/${user.id}`)
    items.value = items.value.filter((row) => row.id !== user.id)
    emit('changed')
    toast.success(`Deleted ${user.email}`)
  } catch (err) {
    // The error belongs next to the action that failed, and a destructive one
    // that fails silently is the worst of both worlds.
    error.value = describe(err)
    toast.error(`Could not delete ${user.email}`, { description: error.value })
  } finally {
    pendingDelete.value = null
    busyId.value = null
  }
}

function ago(ts: number | null | undefined): string {
  if (!ts) return 'never'
  const delta = Math.max(0, Math.floor(Date.now() / 1000) - ts)
  if (delta < 60) return 'just now'
  if (delta < 3600) return `${Math.floor(delta / 60)} min ago`
  if (delta < 86400) return `${Math.floor(delta / 3600)} h ago`
  return `${Math.floor(delta / 86400)} d ago`
}

function absolute(ts: number | null | undefined): string {
  return ts ? new Date(ts * 1000).toLocaleString() : ''
}

const isSelf = (user: AdminUser) => user.uuid === session.user?.uuid

const summary = computed(() =>
  loading.value
    ? 'Loading'
    : `${items.value.length} shown${cursor.value ? ', more available' : ''}`,
)
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- Filters -->
    <div class="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3">
      <div class="flex min-w-56 flex-1 flex-col gap-1">
        <Label for="user-search" class="text-xs">
          Search
          <InfoHint
            title="What is matched"
            wide
            text="Matches the email address and the display name, anywhere in the string. It does not search palettes or notes, so a user you cannot find by address is a user who does not exist on this install."
          />
        </Label>
        <div class="relative">
          <Search
            class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="user-search"
            v-model="query"
            class="h-8 pl-8 text-sm"
            placeholder="email or name"
          />
        </div>
      </div>

      <div class="flex flex-col gap-1">
        <Label for="user-status" class="text-xs">
          Status
          <InfoHint
            title="Account states"
            wide
            text="Pending accounts have not confirmed their address and cannot sign in while verification is required. Suspended accounts keep their data but are refused at sign-in, which is the reversible alternative to deleting someone."
          />
        </Label>
        <Select v-model="status">
          <SelectTrigger id="user-status" size="sm" class="w-40" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="ANY">Any status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div class="flex flex-col gap-1">
        <Label for="user-role" class="text-xs">Role</Label>
        <Select v-model="role">
          <SelectTrigger id="user-role" size="sm" class="w-36" aria-label="Filter by role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="ANY">Any role</SelectItem>
            <SelectItem value="user">User</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
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
      <Skeleton v-for="n in 6" :key="n" class="h-12" />
    </div>

    <div v-else class="overflow-hidden rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Account</TableHead>
            <TableHead class="w-36">Role</TableHead>
            <TableHead class="w-40">Status</TableHead>
            <TableHead class="w-24 text-right">Palettes</TableHead>
            <TableHead class="w-32">Last seen</TableHead>
            <TableHead class="w-32">Joined</TableHead>
            <TableHead class="w-12"><span class="sr-only">Actions</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableEmpty v-if="!items.length" :colspan="7">
            <span class="text-sm text-muted-foreground">
              No accounts match these filters.
            </span>
          </TableEmpty>

          <TableRow
            v-for="user in items"
            :key="user.id"
            :class="busyId === user.id ? 'opacity-60' : ''"
          >
            <TableCell class="max-w-0">
              <div class="flex flex-col">
                <span class="flex items-center gap-1.5 truncate text-sm font-medium">
                  {{ user.displayName || '—' }}
                  <BadgeCheck
                    v-if="user.emailVerified"
                    class="size-3.5 shrink-0 text-muted-foreground"
                    aria-label="Email verified"
                  />
                  <Badge v-if="isSelf(user)" variant="outline" class="text-[10px]">you</Badge>
                </span>
                <span class="truncate font-mono text-[11px] text-muted-foreground">
                  {{ user.email }}
                </span>
              </div>
            </TableCell>

            <TableCell>
              <Select
                :model-value="user.role"
                :disabled="busyId === user.id"
                @update:model-value="patchUser(user, { role: String($event) }, 'Role changed')"
              >
                <SelectTrigger size="sm" class="w-full" :aria-label="`Role for ${user.email}`">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </TableCell>

            <TableCell>
              <div class="flex items-center gap-1.5">
                <Select
                  :model-value="user.status"
                  :disabled="busyId === user.id"
                  @update:model-value="patchUser(user, { status: String($event) }, 'Status changed')"
                >
                  <SelectTrigger size="sm" class="w-full" :aria-label="`Status for ${user.email}`">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </TableCell>

            <TableCell class="text-right tabular-nums">{{ user.palettes ?? 0 }}</TableCell>
            <TableCell class="text-xs text-muted-foreground" :title="absolute(user.lastLoginAt)">
              {{ ago(user.lastLoginAt) }}
            </TableCell>
            <TableCell class="text-xs text-muted-foreground" :title="absolute(user.createdAt)">
              {{ ago(user.createdAt) }}
            </TableCell>

            <TableCell>
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    :disabled="busyId === user.id"
                    :aria-label="`Actions for ${user.email}`"
                  >
                    <Ellipsis />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" class="w-56">
                  <DropdownMenuItem
                    v-if="!user.emailVerified"
                    @click="patchUser(user, { emailVerified: true }, 'Address marked verified')"
                  >
                    <BadgeCheck /> Mark address verified
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    @click="act(user, 'reset-password', `Reset link sent to ${user.email}`)"
                  >
                    <KeyRound /> Send a password reset
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    @click="act(user, 'revoke-sessions', 'Signed out everywhere')"
                  >
                    <ShieldX /> Revoke every session
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    :disabled="isSelf(user)"
                    @click="askDelete(user)"
                  >
                    <Trash2 /> Delete account
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>

    <div class="flex items-center gap-3">
      <Button
        v-if="cursor"
        variant="outline"
        size="sm"
        :disabled="loadingMore"
        @click="load(true)"
      >
        {{ loadingMore ? 'Loading…' : 'Load more' }}
      </Button>
      <p class="flex items-center gap-1.5 text-xs text-muted-foreground">
        <UserCog class="size-3.5" />
        Changing a role or status signs that person out of every browser immediately.
        <InfoHint
          title="Why sessions are dropped"
          wide
          text="A demotion or a suspension that only takes effect when the existing session happens to expire is not a demotion. Both changes revoke every session the account holds, so the person is refused on their next request rather than up to a month later."
        />
      </p>
    </div>

    <AlertDialog v-model:open="deleteOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {{ pendingDelete?.email }}?</AlertDialogTitle>
          <AlertDialogDescription>
            The account and every palette it owns are removed from the database. There is no trash
            for this and no undo. If you only want to stop the person signing in, set their status
            to suspended instead — that is reversible and keeps their work.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep the account</AlertDialogCancel>
          <AlertDialogAction
            class="bg-destructive text-white hover:bg-destructive/90"
            @click="confirmDelete()"
          >
            Delete permanently
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
