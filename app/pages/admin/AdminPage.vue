<script setup lang="ts">
/**
 * The admin console shell and its overview strip.
 *
 * The strip leads with what is broken rather than what is fine. On a
 * self-hosted install the two failures that matter — a storage directory the
 * web server will happily serve, and a cron job that quietly stopped running —
 * announce themselves nowhere else, so they get a full-width warning with the
 * consequence spelled out instead of a red dot on a chart.
 */
import { computed, onMounted, ref, watch } from 'vue'
import type { Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Clock,
  Database,
  FileText,
  Inbox,
  Mail,
  Palette,
  RefreshCw,
  Settings as SettingsIcon,
  Server,
  ShieldAlert,
  ShieldOff,
  TriangleAlert,
  Users,
} from '@lucide/vue'
import InfoHint from '@/components/common/InfoHint.vue'
import SettingsTab from '@/pages/admin/SettingsTab.vue'
import UsersTab from '@/pages/admin/UsersTab.vue'
import ContentTab from '@/pages/admin/ContentTab.vue'
import SystemTab from '@/pages/admin/SystemTab.vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ApiError, api } from '@/lib/api'
import { useSessionStore } from '@/stores/session'

interface CronJob {
  job: string
  lastRunAt: number
  lastOk: boolean
  note: string
}

interface AdminStats {
  users: { total: number; active: number; pending: number; suspended: number }
  palettes: { total: number; public: number; trashed?: number }
  db: { bytes: number; wal: boolean; pageCount: number; sqliteVersion?: string }
  cron: { lastRunAt: number | null; lastOk: boolean; jobs: CronJob[] }
  outbox: { queued: number; failed: number; sent24h: number }
  storageExposed: boolean | null
  storageCheckedAt?: number | null
  sessions?: number
}

const session = useSessionStore()
const route = useRoute()
const router = useRouter()

const TAB_IDS = ['settings', 'users', 'content', 'system'] as const
type TabId = (typeof TAB_IDS)[number]

const TABS: Array<{ id: TabId; label: string; icon: Component }> = [
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'content', label: 'Content', icon: FileText },
  { id: 'system', label: 'System', icon: Server },
]

function tabFromQuery(): TabId {
  const raw = Array.isArray(route.query.tab) ? route.query.tab[0] : route.query.tab
  return TAB_IDS.includes(raw as TabId) ? (raw as TabId) : 'settings'
}

const tab = ref<TabId>(tabFromQuery())

// The tab lives in the URL so a link to "the outbox" survives a reload and can
// be pasted to whoever else administers the install.
watch(tab, (value) => {
  void router.replace({ query: { ...route.query, tab: value } })
})

const stats = ref<AdminStats | null>(null)
const statsError = ref<string | null>(null)
const loading = ref(false)

/** Seconds since the epoch at the moment the stats arrived. */
const fetchedAt = ref(0)

async function loadStats() {
  loading.value = true
  statsError.value = null
  try {
    stats.value = await api.get<AdminStats>('/admin/stats')
    fetchedAt.value = Math.floor(Date.now() / 1000)
  } catch (error) {
    statsError.value =
      error instanceof ApiError
        ? error.message
        : 'The API did not answer. The backend may be offline or not installed yet.'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (session.isAdmin) void loadStats()
})

// Session bootstrap is async, so the page may mount before the role is known.
watch(
  () => session.isAdmin,
  (isAdmin) => {
    if (isAdmin && !stats.value) void loadStats()
  },
)

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

function ago(ts: number | null | undefined): string {
  if (!ts) return 'never'
  const delta = Math.max(0, Math.floor(Date.now() / 1000) - ts)
  if (delta < 60) return `${delta}s ago`
  if (delta < 3600) return `${Math.floor(delta / 60)} min ago`
  if (delta < 86400) return `${Math.floor(delta / 3600)} h ago`
  return `${Math.floor(delta / 86400)} d ago`
}

const CRON_STALE_SECONDS = 1800

const cronStale = computed(() => {
  const cron = stats.value?.cron
  if (!cron) return false
  if (cron.lastRunAt === null) return true
  return fetchedAt.value - cron.lastRunAt > CRON_STALE_SECONDS
})

interface Warning {
  id: string
  title: string
  body: string
  critical: boolean
}

const warnings = computed<Warning[]>(() => {
  const current = stats.value
  if (!current) return []
  const list: Warning[] = []

  if (current.storageExposed === true) {
    list.push({
      id: 'storage',
      critical: true,
      title: 'The storage directory answers to the public web',
      body:
        'A request from outside reached storage/, which holds the SQLite database, the backups and the mail queue. ' +
        'Anyone who guesses the path can download every account, password hash and private palette in one file. ' +
        'Fix it at the web server: deny the directory in .htaccess, or move storage above the document root and point the config at the new path. ' +
        'Re-run the self-test on the System tab once you have.',
    })
  }

  // `null` is "we do not know", which is not the same as "safe" and is the
  // more dangerous of the two to render as silence.
  if (current.storageExposed === null) {
    list.push({
      id: 'storage-unknown',
      critical: false,
      title: 'Nobody has checked whether storage/ is downloadable',
      body:
        'The check asks this server for storage/, config.php and the database file from the outside, and it has not completed. ' +
        'Until it does, there is no evidence either way that the database is protected. ' +
        'Run it from the System tab, or fetch those paths in a browser yourself — none of them should return a file.',
    })
  }

  if (cronStale.value) {
    list.push({
      id: 'cron',
      critical: true,
      title:
        current.cron.lastRunAt === null
          ? 'Scheduled jobs have never run'
          : `Scheduled jobs last ran ${ago(current.cron.lastRunAt)}`,
      body:
        'Cron drives the mail queue, session expiry, token cleanup and the purge of deleted palettes. ' +
        'While it is stopped, verification and password-reset messages sit in the outbox unsent, and expired sessions stay valid until something else prunes them. ' +
        'Check that the host is calling cron.php with the current token, or run the jobs by hand from the System tab.',
    })
  }

  if (!current.db.wal) {
    list.push({
      id: 'wal',
      critical: false,
      title: 'The database is not in WAL mode',
      body:
        'Without the write-ahead log, a single write blocks every reader for its duration, so the site stalls under concurrent use and returns "database is locked" errors. ' +
        'WAL also survives an interrupted write far better. It is usually off because the filesystem is a network mount that does not support the shared memory WAL needs — check whether storage/ sits on NFS.',
    })
  }

  if (current.outbox.failed > 0) {
    list.push({
      id: 'outbox',
      critical: false,
      title: `${current.outbox.failed} message${current.outbox.failed === 1 ? '' : 's'} gave up`,
      body:
        'These exhausted their retries and will not be sent again. Users waiting on them cannot confirm an address or reset a password. ' +
        'Open the outbox on the System tab to read the error, then send a test message to check whether the host still accepts mail at all.',
    })
  }

  return list
})

interface StatCard {
  id: string
  label: string
  value: string
  sub: string
  icon: Component
  hintTitle: string
  hint: string
}

const cards = computed<StatCard[]>(() => {
  const current = stats.value
  if (!current) return []
  return [
    {
      id: 'users',
      label: 'Users',
      value: String(current.users.total),
      sub: `${current.users.active} active · ${current.users.pending} pending · ${current.users.suspended} suspended`,
      icon: Users,
      hintTitle: 'Account states',
      hint: 'Pending means the address has not been confirmed yet. Those accounts can sign in only if email verification is off, so a pile of them usually means mail is not being delivered rather than that people lost interest.',
    },
    {
      id: 'palettes',
      label: 'Palettes',
      value: String(current.palettes.total),
      sub: `${current.palettes.public} public${current.palettes.trashed ? ` · ${current.palettes.trashed} in trash` : ''}`,
      icon: Palette,
      hintTitle: 'Stored palettes',
      hint: 'Counts everything not soft-deleted, across all accounts. Trashed palettes still occupy the database until the prune job removes them, which is one reason a stopped cron shows up as growth here.',
    },
    {
      id: 'db',
      label: 'Database',
      value: formatBytes(current.db.bytes),
      sub: `${current.db.pageCount.toLocaleString()} pages · ${current.db.wal ? 'WAL' : 'rollback journal'}${current.db.sqliteVersion ? ` · SQLite ${current.db.sqliteVersion}` : ''}`,
      icon: Database,
      hintTitle: 'File size',
      hint: 'SQLite does not return space to the filesystem when rows are deleted, so this number goes up and rarely down. Run the backup action on the System tab if you want a compacted copy.',
    },
    {
      id: 'cron',
      label: 'Scheduled jobs',
      value: ago(current.cron.lastRunAt),
      sub: current.cron.lastRunAt === null ? 'no run recorded' : current.cron.lastOk ? 'last run succeeded' : 'last run reported a failure',
      icon: Clock,
      hintTitle: 'Cron health',
      hint: 'Anything older than half an hour is treated as stopped, because every job here is scheduled to run more often than that. The token in the cron URL is what authenticates the call, so a rotated token with an unchanged scheduler entry looks exactly like this.',
    },
    {
      id: 'outbox',
      label: 'Mail queue',
      value: String(current.outbox.queued),
      sub: `${current.outbox.sent24h} sent in 24 h · ${current.outbox.failed} failed`,
      icon: Mail,
      hintTitle: 'Queued messages',
      hint: 'Mail is queued rather than sent inline so a slow or unreachable SMTP host cannot hold up a sign-up request. A queue that never drains means cron is not running or the host rejects outgoing mail.',
    },
    {
      id: 'sessions',
      label: 'Sessions',
      value: String(current.sessions ?? 0),
      sub: 'signed-in browsers',
      icon: Inbox,
      hintTitle: 'Live sessions',
      hint: 'One row per browser that is currently signed in, not one per person. Revoking a user’s sessions on the Users tab drops all of theirs at once and forces a fresh sign-in.',
    },
  ]
})
</script>

<template>
  <div class="mx-auto w-full max-w-7xl flex-1 px-3 py-5 md:px-6 md:py-7">
    <!-- Not an admin: say so plainly rather than redirecting somewhere confusing. -->
    <div v-if="!session.ready" class="flex flex-col gap-3">
      <Skeleton class="h-8 w-48" />
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton v-for="n in 6" :key="n" class="h-24" />
      </div>
    </div>

    <div
      v-else-if="!session.isAdmin"
      class="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-xl border bg-card px-6 py-14 text-center"
    >
      <ShieldOff class="size-8 text-muted-foreground" />
      <h1 class="text-lg font-semibold tracking-tight">Not authorized</h1>
      <p class="text-sm leading-relaxed text-muted-foreground">
        This console is limited to administrators. If you should have access, ask whoever runs this
        installation to change your role — it cannot be granted from your own account page.
      </p>
      <Button variant="outline" size="sm" @click="router.push({ name: 'studio' })">
        Back to the generator
      </Button>
    </div>

    <template v-else>
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <h1 class="text-xl font-semibold tracking-tight">Admin</h1>
        <span
          v-if="session.meta"
          class="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
        >
          {{ session.meta.appName }} {{ session.meta.version }}
        </span>
        <span class="flex-1" />
        <span v-if="fetchedAt" class="text-xs text-muted-foreground">
          Updated {{ ago(fetchedAt) }}
        </span>
        <Button
          variant="outline"
          size="sm"
          :disabled="loading"
          aria-label="Refresh the overview"
          @click="loadStats()"
        >
          <RefreshCw :class="loading ? 'animate-spin' : ''" /> Refresh
        </Button>
      </div>

      <!-- Warnings first. Everything here costs the operator something real. -->
      <div v-if="warnings.length" class="mb-4 flex flex-col gap-2.5">
        <Alert
          v-for="warning in warnings"
          :key="warning.id"
          :variant="warning.critical ? 'destructive' : 'default'"
          :class="warning.critical ? 'border-destructive/40' : 'border-border'"
        >
          <ShieldAlert v-if="warning.critical" />
          <TriangleAlert v-else />
          <AlertTitle>{{ warning.title }}</AlertTitle>
          <AlertDescription>
            <p class="leading-relaxed">{{ warning.body }}</p>
          </AlertDescription>
        </Alert>
      </div>

      <Alert v-if="statsError" variant="destructive" class="mb-4">
        <TriangleAlert />
        <AlertTitle>The overview could not be loaded</AlertTitle>
        <AlertDescription>
          <p>{{ statsError }}</p>
          <Button variant="outline" size="sm" class="mt-2" @click="loadStats()">Try again</Button>
        </AlertDescription>
      </Alert>

      <!-- Overview strip -->
      <div v-if="loading && !stats" class="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton v-for="n in 6" :key="n" class="h-24" />
      </div>
      <div v-else-if="stats" class="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="card in cards"
          :key="card.id"
          class="flex flex-col gap-1 rounded-xl border bg-card p-3.5"
        >
          <div class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <component :is="card.icon" class="size-3.5" />
            {{ card.label }}
            <InfoHint :title="card.hintTitle" :text="card.hint" wide />
          </div>
          <div class="text-2xl font-semibold tracking-tight tabular-nums">{{ card.value }}</div>
          <div class="text-xs text-muted-foreground">{{ card.sub }}</div>
        </div>
      </div>

      <!-- Per-job cron detail, free with the stats call and the fastest way to
           see which single job is the one failing. -->
      <div
        v-if="stats && stats.cron.jobs.length"
        class="mb-5 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border bg-card/50 px-3 py-2 text-xs"
      >
        <span class="flex items-center gap-1.5 font-medium text-muted-foreground">
          Jobs
          <InfoHint
            title="Individual jobs"
            wide
            text="Each scheduled job records its own last run and outcome. A single failing job with the others healthy points at that job's dependency — usually the mail transport — rather than at cron itself."
          />
        </span>
        <span
          v-for="job in stats.cron.jobs"
          :key="job.job"
          class="flex items-center gap-1.5"
          :title="job.note"
        >
          <span
            class="size-1.5 rounded-full"
            :class="job.lastOk ? 'bg-primary' : 'bg-destructive'"
            aria-hidden="true"
          />
          <span class="font-mono">{{ job.job }}</span>
          <span class="text-muted-foreground">{{ ago(job.lastRunAt) }}</span>
          <span class="sr-only">{{ job.lastOk ? 'succeeded' : 'failed' }}</span>
        </span>
      </div>

      <Tabs :model-value="tab" class="gap-4" @update:model-value="tab = $event as TabId">
        <TabsList class="w-full max-w-md">
          <TabsTrigger v-for="entry in TABS" :key="entry.id" :value="entry.id">
            <component :is="entry.icon" />
            {{ entry.label }}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings">
          <SettingsTab />
        </TabsContent>
        <TabsContent value="users">
          <UsersTab @changed="loadStats()" />
        </TabsContent>
        <TabsContent value="content">
          <ContentTab @changed="loadStats()" />
        </TabsContent>
        <TabsContent value="system">
          <SystemTab @changed="loadStats()" />
        </TabsContent>
      </Tabs>
    </template>
  </div>
</template>
