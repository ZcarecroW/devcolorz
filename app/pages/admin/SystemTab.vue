<script setup lang="ts">
/**
 * Maintenance, the self-test, the mail outbox and the audit log.
 *
 * Every action here reports what it actually did rather than a toast that says
 * "done": the whole point of a maintenance button is the sentence it returns.
 * Each of the four sections loads independently, so a backend that answers the
 * self-test but not the audit log still gives you three working panels and one
 * inline error.
 */
import { computed, onMounted, ref } from 'vue'
import type { Component } from 'vue'
import {
  Check,
  Clock,
  Copy,
  Database,
  HardDrive,
  Download,
  LoaderCircle,
  Mail,
  Play,
  RefreshCw,
  ScrollText,
  Send,
  Stethoscope,
  Trash2,
  TriangleAlert,
  Undo2,
  Wrench,
  X,
} from '@lucide/vue'
import { useIntersectionObserver } from '@vueuse/core'
import { toast } from 'vue-sonner'
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

const emit = defineEmits<{
  /** Something changed that the overview strip counts. */
  (e: 'changed'): void
}>()

const session = useSessionStore()

function describe(err: unknown): string {
  if (err instanceof ApiError) return err.message
  return 'The API did not answer. The backend may be offline or not installed yet.'
}

function ago(ts: number): string {
  const delta = Math.max(0, Math.floor(Date.now() / 1000) - ts)
  if (delta < 60) return `${delta}s ago`
  if (delta < 3600) return `${Math.floor(delta / 60)} min ago`
  if (delta < 86400) return `${Math.floor(delta / 3600)} h ago`
  return `${Math.floor(delta / 86400)} d ago`
}

function absolute(ts: number): string {
  return new Date(ts * 1000).toLocaleString()
}

/* ------------------------------------------------------------------ *
 * Maintenance
 * ------------------------------------------------------------------ */

type MaintenanceId = 'vacuum' | 'checkpoint' | 'optimize' | 'integrity' | 'prune'

interface MaintenanceAction {
  id: MaintenanceId
  label: string
  icon: Component
  hintTitle: string
  hint: string
}

const MAINTENANCE: MaintenanceAction[] = [
  {
    id: 'vacuum',
    label: 'Back up now',
    icon: HardDrive,
    hintTitle: 'Consistent copy',
    hint: 'Writes a compacted copy of the database into storage/backups using SQLite’s own backup API, so it is safe to run while people are using the site. Compaction is also the only way this install returns space that deleted rows left behind. Nothing removes old backups for you — they will accumulate until you do.',
  },
  {
    id: 'checkpoint',
    label: 'Checkpoint WAL',
    icon: Database,
    hintTitle: 'Fold the log back in',
    hint: 'Merges the write-ahead log into the main database file and truncates it. Worth doing when the -wal file has grown larger than the database itself, which happens when a long-running reader keeps the log pinned. It blocks writers for the duration, which is normally milliseconds.',
  },
  {
    id: 'optimize',
    label: 'Optimize',
    icon: Wrench,
    hintTitle: 'Planner statistics',
    hint: 'Refreshes the statistics SQLite uses to choose between indexes. Cheap and safe, and occasionally the difference between a fast list and a slow one once the tables have changed shape.',
  },
  {
    id: 'integrity',
    label: 'Check integrity',
    icon: Stethoscope,
    hintTitle: 'Look for corruption',
    hint: 'Reads every page and verifies the internal structure. It is the only way to catch the silent corruption a failing disk or an interrupted write leaves behind. It gets slower as the database grows, so expect it to take a moment on a large install.',
  },
  {
    id: 'prune',
    label: 'Prune expired rows',
    icon: Trash2,
    hintTitle: 'Housekeeping',
    hint: 'Deletes expired sessions, spent tokens, stale rate-limit counters, sent mail, palettes past their trash window and audit entries older than 180 days. Cron does this on a schedule; run it by hand after cron has been down, or when you want the counts on the overview to reflect reality right now.',
  },
]

interface MaintenanceResult {
  ok: boolean
  detail: string
}

const running = ref<string | null>(null)
const lastResult = ref<{ label: string; ok: boolean; detail: string } | null>(null)
const maintenanceError = ref<string | null>(null)

async function runMaintenance(action: MaintenanceAction) {
  running.value = action.id
  maintenanceError.value = null
  try {
    const result = await api.post<MaintenanceResult>('/admin/maintenance', { action: action.id })
    lastResult.value = { label: action.label, ok: result.ok, detail: result.detail }
    emit('changed')
  } catch (err) {
    maintenanceError.value = describe(err)
  } finally {
    running.value = null
  }
}

async function runCron() {
  running.value = 'cron'
  maintenanceError.value = null
  try {
    const result = await api.post<{ ok: boolean; detail: unknown }>('/admin/cron/run', {})
    lastResult.value = {
      label: 'Scheduled jobs',
      ok: result.ok,
      detail:
        typeof result.detail === 'string' ? result.detail : JSON.stringify(result.detail ?? {}),
    }
    emit('changed')
    void loadOutbox()
  } catch (err) {
    maintenanceError.value = describe(err)
  } finally {
    running.value = null
  }
}

/* ------------------------------------------------------------------ *
 * Self-test
 * ------------------------------------------------------------------ */

interface SelfTestCheck {
  id: string
  label: string
  ok: boolean
  detail: string
}

const checks = ref<SelfTestCheck[]>([])
const checksLoading = ref(false)
const checksError = ref<string | null>(null)

async function loadChecks() {
  checksLoading.value = true
  checksError.value = null
  try {
    const result = await api.get<{ checks: SelfTestCheck[] }>('/admin/selftest')
    checks.value = result.checks
  } catch (err) {
    checksError.value = describe(err)
    checks.value = []
  } finally {
    checksLoading.value = false
  }
}

const failedChecks = computed(() => checks.value.filter((check) => !check.ok).length)

/* ------------------------------------------------------------------ *
 * Outbox
 * ------------------------------------------------------------------ */

interface OutboxItem {
  id: number
  to: string
  subject: string
  status: string
  attempts: number
  lastError: string
  createdAt: number
  sentAt?: number | null
}

const ANY = 'any'
const outboxFilter = ref<string>(ANY)
const outbox = ref<OutboxItem[]>([])
const outboxLoading = ref(false)
const outboxError = ref<string | null>(null)
const outboxBusy = ref<number | null>(null)

/**
 * Which request is allowed to fill the list.
 *
 * The filter, a retry, a delete and a test send each reload the outbox, and
 * two of those can be in flight at once — so the older answer could land last
 * and show rows for a status the dropdown no longer says. The same guard every
 * other list in the console uses.
 */
let outboxToken = 0

async function loadOutbox() {
  const token = ++outboxToken
  outboxLoading.value = true
  outboxError.value = null
  try {
    const result = await api.get<{ items: OutboxItem[] }>('/admin/outbox', {
      query: { status: outboxFilter.value === ANY ? undefined : outboxFilter.value },
    })
    if (token !== outboxToken) return
    outbox.value = result.items
  } catch (err) {
    if (token !== outboxToken) return
    outboxError.value = describe(err)
    outbox.value = []
  } finally {
    if (token === outboxToken) outboxLoading.value = false
  }
}

async function retryMessage(item: OutboxItem) {
  outboxBusy.value = item.id
  outboxError.value = null
  try {
    await api.post(`/admin/outbox/${item.id}/retry`)
    toast.success('Requeued and flushed')
    await loadOutbox()
    emit('changed')
  } catch (err) {
    outboxError.value = describe(err)
  } finally {
    outboxBusy.value = null
  }
}

async function deleteMessage(item: OutboxItem) {
  outboxBusy.value = item.id
  outboxError.value = null
  try {
    await api.delete(`/admin/outbox/${item.id}`)
    outbox.value = outbox.value.filter((row) => row.id !== item.id)
    emit('changed')
  } catch (err) {
    outboxError.value = describe(err)
  } finally {
    outboxBusy.value = null
  }
}

interface MailTestResult {
  sent: boolean
  error: string
  envelope: {
    from: string
    fromName: string
    bounce: string
    forced: string
    available: boolean
  }
}

const testAddress = ref('')
const testSending = ref(false)
const testError = ref<string | null>(null)
const testResult = ref<MailTestResult | null>(null)

/**
 * The envelope is shown after every test, success or not.
 *
 * A `true` from `mail()` means the local transport accepted the message, which
 * is a much weaker claim than "it arrived". When the two disagree the reason is
 * nearly always the From address: a domain this server is not authorised to
 * send for fails SPF and DMARC at the receiving end and is dropped without a
 * bounce. Printing the address the test actually used is what turns that from a
 * mystery into a DNS record.
 */
async function sendTest() {
  // Re-entrancy guard, not just the disabled attribute: that only applies from
  // the next render, and every extra call here is another real email.
  if (testSending.value) return
  testSending.value = true
  testError.value = null
  testResult.value = null
  try {
    const result = await api.post<MailTestResult>('/admin/mail/test', { to: testAddress.value })
    testResult.value = result
    if (result.sent) toast.success(`Handed a test message to the mail transport agent`)
    else toast.error('The host refused the message')
    await loadOutbox()
  } catch (err) {
    testError.value =
      err instanceof ApiError && err.problem.errors?.to ? err.problem.errors.to : describe(err)
  } finally {
    testSending.value = false
  }
}

/* ------------------------------------------------------------------ *
 * Audit log
 * ------------------------------------------------------------------ */

interface AuditEntry {
  id: number
  ts: number
  actor: string
  action: string
  target: string
  ip: string
  meta: Record<string, unknown>
}

const audit = ref<AuditEntry[]>([])
const auditCursor = ref<string | null>(null)
const auditLoading = ref(false)
const auditError = ref<string | null>(null)
const auditDone = ref(false)
const sentinel = ref<HTMLElement | null>(null)

async function loadAudit(more = false) {
  if (auditLoading.value) return
  if (more && (auditDone.value || auditCursor.value === null)) return
  auditLoading.value = true
  auditError.value = null
  try {
    const result = await api.get<{ items: AuditEntry[]; nextCursor: string | null }>(
      '/admin/audit',
      { query: { cursor: more ? auditCursor.value ?? undefined : undefined } },
    )
    audit.value = more ? [...audit.value, ...result.items] : result.items
    auditCursor.value = result.nextCursor
    auditDone.value = result.nextCursor === null
  } catch (err) {
    auditError.value = describe(err)
    // Stop the observer from retrying a failing request on every scroll tick.
    auditDone.value = true
  } finally {
    auditLoading.value = false
  }
}

// The sentinel sits at the bottom of the scroll box; reaching it fetches the
// next page, which is the only paging control this list needs.
useIntersectionObserver(sentinel, ([entry]) => {
  if (entry?.isIntersecting) void loadAudit(true)
})

function metaOf(entry: AuditEntry): string {
  const keys = Object.keys(entry.meta ?? {})
  return keys.length ? JSON.stringify(entry.meta) : ''
}

async function copyAudit() {
  try {
    await navigator.clipboard.writeText(JSON.stringify(audit.value, null, 2))
    toast.success(`Copied ${audit.value.length} entries`)
  } catch {
    toast.error('The browser refused clipboard access.')
  }
}

/* ---------------- updates ---------------- */

interface UpdateStatus {
  current: string
  projectUrl: string
  repository: string
  lastCheckedAt: number
  latest: { version: string; tag: string; name: string; notes: string; url: string; assetName: string | null } | null
  available: { version: string; name: string; notes: string; url: string } | null
  lastResult: { ok: boolean; detail: string; from: string; to: string; backup: string | null; at: number } | null
  capabilities: { ok: boolean; canCheck: boolean; canInstall: boolean; problems: string[] }
  backups: { name: string; at: number }[]
  settings: { checkEnabled: boolean; checkHour: number; autoInstall: boolean }
}

const update = ref<UpdateStatus | null>(null)
const updateError = ref<string | null>(null)
const updateBusy = ref<'' | 'check' | 'install' | 'rollback'>('')

async function loadUpdate() {
  updateError.value = null
  try {
    update.value = await api.get<UpdateStatus>('/admin/update')
  } catch (err) {
    updateError.value = describe(err)
  }
}

/**
 * Run one of the update actions and adopt the status it answers with.
 *
 * The response is built by the code that is about to be replaced, so it is the
 * last thing this version will ever say — worth showing verbatim rather than
 * reloading and hoping the new code says something similar.
 */
async function runUpdate(action: 'check' | 'install' | 'rollback') {
  updateBusy.value = action
  updateError.value = null
  try {
    const response = await api.post<{ result: { ok: boolean; detail: string }; status: UpdateStatus }>(
      `/admin/update/${action}`,
      {},
    )
    update.value = response.status
    if (response.result.ok) {
      toast.success(response.result.detail)
      if (action !== 'check') emit('changed')
    } else {
      toast.error(response.result.detail)
    }
  } catch (err) {
    updateError.value = describe(err)
    toast.error(updateError.value)
  } finally {
    updateBusy.value = ''
  }
}

const updateAgo = computed(() =>
  update.value?.lastCheckedAt ? ago(update.value.lastCheckedAt) : 'never',
)

onMounted(() => {
  void loadUpdate()
  testAddress.value = session.user?.email ?? ''
  void loadChecks()
  void loadOutbox()
  void loadAudit()
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Updates ----------------------------------------------------- -->
    <section class="overflow-hidden rounded-xl border bg-card">
      <header class="flex flex-col gap-0.5 border-b bg-muted/40 px-4 py-3">
        <h2 class="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <Download class="size-4 text-muted-foreground" />
          Updates
          <InfoHint
            title="Where updates come from"
            wide
            text="The GitHub repository this application was built from, which is compiled in and cannot be changed here. Checking asks for the newest release number; installing downloads that release and unpacks it over this installation, leaving config.php and storage/ alone and keeping a copy of everything it replaces."
          />
        </h2>
        <p class="text-xs text-muted-foreground">
          Whether the daily check runs, and what it does when it finds something, are on the
          Settings tab.
        </p>
      </header>

      <div v-if="!update && !updateError" class="p-4">
        <Skeleton class="h-20" />
      </div>

      <Alert v-else-if="updateError" variant="destructive" class="m-4 w-auto">
        <TriangleAlert />
        <AlertTitle>The update status could not be read</AlertTitle>
        <AlertDescription>{{ updateError }}</AlertDescription>
      </Alert>

      <div v-else-if="update" class="flex flex-col gap-4 p-4">
        <div class="flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm">
          <span class="flex items-baseline gap-2">
            <span class="text-muted-foreground">Installed</span>
            <span class="font-mono font-semibold">{{ update.current }}</span>
          </span>
          <span class="flex items-baseline gap-2">
            <span class="text-muted-foreground">Newest release</span>
            <span class="font-mono font-semibold">
              {{ update.latest?.version ?? 'not checked yet' }}
            </span>
          </span>
          <span class="flex items-baseline gap-2">
            <span class="text-muted-foreground">Last checked</span>
            <span>{{ updateAgo }}</span>
          </span>
          <a
            :href="update.projectUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="ml-auto font-mono text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            {{ update.repository }}
          </a>
        </div>

        <!-- What this host can and cannot do about updates. -->
        <Alert v-if="update.capabilities.problems.length" variant="destructive">
          <TriangleAlert />
          <AlertTitle>
            {{ update.capabilities.canCheck ? 'Updates cannot be installed here' : 'Updates cannot be checked here' }}
          </AlertTitle>
          <AlertDescription>
            <ul class="flex list-disc flex-col gap-1 pl-4">
              <li v-for="problem in update.capabilities.problems" :key="problem">{{ problem }}</li>
            </ul>
          </AlertDescription>
        </Alert>

        <div
          v-if="update.available"
          class="flex flex-col gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3"
        >
          <p class="text-sm font-medium">
            Version {{ update.available.version }} is available.
            <a
              :href="update.available.url"
              target="_blank"
              rel="noopener noreferrer"
              class="font-normal underline underline-offset-4"
            >
              Read the release notes
            </a>
          </p>
          <p v-if="update.available.notes" class="line-clamp-4 text-xs whitespace-pre-line text-muted-foreground">
            {{ update.available.notes }}
          </p>
        </div>
        <p v-else-if="update.latest" class="text-sm text-muted-foreground">
          This installation is running the newest release.
        </p>

        <p
          v-if="update.lastResult?.detail"
          class="text-xs"
          :class="update.lastResult.ok ? 'text-muted-foreground' : 'text-destructive'"
        >
          Last install attempt: {{ update.lastResult.detail }}
        </p>

        <div class="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            :disabled="updateBusy !== '' || !update.capabilities.canCheck"
            @click="runUpdate('check')"
          >
            <LoaderCircle v-if="updateBusy === 'check'" class="animate-spin" />
            <RefreshCw v-else />
            Check now
          </Button>

          <Button
            v-if="update.available"
            size="sm"
            :disabled="updateBusy !== '' || !update.capabilities.canInstall"
            @click="runUpdate('install')"
          >
            <LoaderCircle v-if="updateBusy === 'install'" class="animate-spin" />
            <Download v-else />
            Install {{ update.available.version }}
          </Button>

          <Button
            v-if="update.backups.length"
            variant="outline"
            size="sm"
            :disabled="updateBusy !== ''"
            @click="runUpdate('rollback')"
          >
            <LoaderCircle v-if="updateBusy === 'rollback'" class="animate-spin" />
            <Undo2 v-else />
            Undo the last update
          </Button>

          <span v-if="update.backups.length" class="text-xs text-muted-foreground">
            Restores {{ update.backups[0].name }}. The database is not part of an update and is
            left as it is.
          </span>
        </div>
      </div>
    </section>

    <!-- Maintenance ------------------------------------------------- -->
    <section class="overflow-hidden rounded-xl border bg-card">
      <header class="flex flex-col gap-0.5 border-b bg-muted/40 px-4 py-3">
        <h2 class="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <Wrench class="size-4 text-muted-foreground" />
          Maintenance
        </h2>
        <p class="text-xs leading-relaxed text-muted-foreground">
          All of these run inline and report what they did. None of them destroy data you have not
          already deleted.
        </p>
      </header>

      <div class="flex flex-col gap-3 p-4">
        <div class="flex flex-wrap gap-2">
          <div v-for="action in MAINTENANCE" :key="action.id" class="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              :disabled="running !== null"
              @click="runMaintenance(action)"
            >
              <component :is="action.icon" :class="running === action.id ? 'animate-pulse' : ''" />
              {{ action.label }}
            </Button>
            <InfoHint :title="action.hintTitle" :text="action.hint" wide />
          </div>

          <div class="flex items-center gap-1">
            <Button variant="secondary" size="sm" :disabled="running !== null" @click="runCron()">
              <Play :class="running === 'cron' ? 'animate-pulse' : ''" />
              Run scheduled jobs
            </Button>
            <InfoHint
              title="Running cron by hand"
              wide
              text="Runs the scheduled jobs immediately inside this request, with a fifteen-second budget. Use it to find out whether a job actually works before blaming the scheduler: if it succeeds here and never runs on its own, the problem is the cron entry or the token in its URL."
            />
          </div>
        </div>

        <p
          v-if="lastResult"
          class="rounded-lg border px-3 py-2 text-xs leading-relaxed"
          :class="lastResult.ok ? 'border-border bg-muted/50' : 'border-destructive/40 text-destructive'"
        >
          <span class="font-medium">{{ lastResult.label }}:</span> {{ lastResult.detail }}
        </p>
        <p v-if="maintenanceError" class="text-xs text-destructive">{{ maintenanceError }}</p>
      </div>
    </section>

    <!-- Self-test --------------------------------------------------- -->
    <section class="overflow-hidden rounded-xl border bg-card">
      <header class="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-3">
        <div class="flex min-w-40 flex-1 flex-col gap-0.5">
          <h2 class="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Stethoscope class="size-4 text-muted-foreground" />
            Self-test
            <InfoHint
              title="What is checked"
              wide
              text="The environment this install depends on — PHP version, SQLite build, writable paths, password hashing, outgoing mail — plus whether anything private is reachable from the public web. It re-runs on demand rather than on a schedule, because several of the checks make real requests."
            />
          </h2>
          <p class="text-xs text-muted-foreground">
            {{ failedChecks ? `${failedChecks} of ${checks.length} need attention` : `${checks.length} checks` }}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          :disabled="checksLoading"
          aria-label="Run the self-test again"
          @click="loadChecks()"
        >
          <RefreshCw :class="checksLoading ? 'animate-spin' : ''" /> Re-run
        </Button>
      </header>

      <div class="p-4">
        <Alert v-if="checksError" variant="destructive">
          <TriangleAlert />
          <AlertTitle>The self-test could not run</AlertTitle>
          <AlertDescription>{{ checksError }}</AlertDescription>
        </Alert>

        <div v-else-if="checksLoading && !checks.length" class="flex flex-col gap-2">
          <Skeleton v-for="n in 5" :key="n" class="h-10" />
        </div>

        <ul v-else class="flex flex-col divide-y">
          <li v-for="check in checks" :key="check.id" class="flex items-start gap-3 py-2.5">
            <span
              class="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full"
              :class="check.ok ? 'bg-primary/15 text-primary' : 'bg-destructive/15 text-destructive'"
            >
              <Check v-if="check.ok" class="size-3" />
              <X v-else class="size-3" />
            </span>
            <div class="flex min-w-0 flex-col">
              <span class="text-sm font-medium">{{ check.label }}</span>
              <span class="text-xs leading-relaxed text-muted-foreground">{{ check.detail }}</span>
            </div>
          </li>
        </ul>
      </div>
    </section>

    <!-- Outbox ------------------------------------------------------ -->
    <section class="overflow-hidden rounded-xl border bg-card">
      <header class="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-3">
        <div class="flex min-w-40 flex-1 flex-col gap-0.5">
          <h2 class="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Mail class="size-4 text-muted-foreground" />
            Mail outbox
            <InfoHint
              title="Why mail is queued"
              wide
              text="Messages are written to a queue and sent by cron rather than during the request that created them, so a slow or unreachable mail host cannot hold up a sign-up. The cost is that nothing leaves this queue while cron is stopped, which is why a full outbox and a stale cron warning always appear together."
            />
          </h2>
          <p class="text-xs text-muted-foreground">Newest first, capped at 200 rows.</p>
        </div>
        <Select v-model="outboxFilter" @update:model-value="loadOutbox()">
          <SelectTrigger size="sm" class="w-36" aria-label="Filter the outbox by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="ANY">Any status</SelectItem>
            <SelectItem value="queued">Queued</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="dead">Failed</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon-sm"
          :disabled="outboxLoading"
          aria-label="Reload the outbox"
          @click="loadOutbox()"
        >
          <RefreshCw :class="outboxLoading ? 'animate-spin' : ''" />
        </Button>
      </header>

      <!-- Test send. The fastest answer to "does mail work on this host". -->
      <form class="flex flex-wrap items-end gap-2 border-b px-4 py-3" @submit.prevent="sendTest()">
        <div class="flex min-w-56 flex-1 flex-col gap-1">
          <Label for="mail-test" class="text-xs">
            Send a test message
            <InfoHint
              title="What the test proves"
              wide
              text="It sends a real message straight through, bypassing the queue, so the result describes this message and nothing else. A success means the host accepted the mail — not that it arrived. Delivery still depends on SPF, DKIM and the receiving side's opinion of your domain, so check the destination inbox and its spam folder before declaring victory."
            />
          </Label>
          <Input
            id="mail-test"
            v-model="testAddress"
            type="email"
            class="h-8 max-w-sm text-sm"
            placeholder="you@example.com"
            autocomplete="off"
          />
        </div>
        <Button type="submit" size="sm" :disabled="testSending || !testAddress">
          <Send /> {{ testSending ? 'Sending…' : 'Send test' }}
        </Button>
        <p v-if="testError" class="w-full text-xs text-destructive">{{ testError }}</p>

        <div v-if="testResult" class="w-full rounded-md border bg-muted/40 p-3 text-xs leading-relaxed">
          <p :class="testResult.sent ? 'font-medium text-foreground' : 'font-medium text-destructive'">
            {{
              testResult.sent
                ? 'The host accepted the message. It has not necessarily been delivered.'
                : 'The host refused the message.'
            }}
          </p>
          <p v-if="testResult.error" class="mt-1 text-destructive">{{ testResult.error }}</p>
          <dl class="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-muted-foreground">
            <dt>From</dt>
            <dd class="font-mono break-all">{{ testResult.envelope.from }}</dd>
            <dt>Envelope sender</dt>
            <dd class="font-mono break-all">
              {{ testResult.envelope.forced || testResult.envelope.bounce
              }}<span v-if="testResult.envelope.forced"> (forced by the host)</span>
            </dd>
          </dl>
          <p v-if="testResult.sent" class="mt-2 text-muted-foreground">
            If nothing arrives, the From domain above is the first thing to check: the receiving
            server drops mail whose SPF record does not authorize this host, and it does so
            silently. A subdomain with no SPF record of its own is the usual culprit — set the
            address to a mailbox on a domain this server is allowed to send for.
          </p>
        </div>
      </form>

      <div class="px-1 pb-1">
        <p v-if="outboxError" class="px-3 py-3 text-xs text-destructive">{{ outboxError }}</p>
        <div v-else-if="outboxLoading && !outbox.length" class="flex flex-col gap-2 p-3">
          <Skeleton v-for="n in 4" :key="n" class="h-10" />
        </div>
        <Table v-else>
          <TableHeader>
            <TableRow>
              <TableHead>Recipient</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead class="w-28">Status</TableHead>
              <TableHead class="hidden w-28 md:table-cell">Queued</TableHead>
              <TableHead class="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableEmpty v-if="!outbox.length" :colspan="5">
              <span class="text-sm text-muted-foreground">
                Nothing in the queue. That is the normal state.
              </span>
            </TableEmpty>
            <TableRow
              v-for="item in outbox"
              :key="item.id"
              :class="outboxBusy === item.id ? 'opacity-60' : ''"
            >
              <TableCell class="max-w-0 truncate font-mono text-xs">{{ item.to }}</TableCell>
              <TableCell class="max-w-0 truncate text-xs">
                {{ item.subject }}
                <span v-if="item.lastError" class="block truncate text-destructive">
                  {{ item.lastError }}
                </span>
              </TableCell>
              <TableCell class="text-xs">
                <span :class="item.status === 'dead' ? 'text-destructive' : 'text-muted-foreground'">
                  {{ item.status }}
                </span>
                <span v-if="item.attempts" class="text-muted-foreground">
                  · {{ item.attempts }} tries
                </span>
              </TableCell>
              <TableCell class="text-xs text-muted-foreground" :title="absolute(item.createdAt)">
                {{ ago(item.createdAt) }}
              </TableCell>
              <TableCell class="text-right">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  :disabled="outboxBusy === item.id"
                  :aria-label="`Retry the message to ${item.to}`"
                  title="Requeue and try again now"
                  @click="retryMessage(item)"
                >
                  <RefreshCw />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  class="text-destructive hover:text-destructive"
                  :disabled="outboxBusy === item.id"
                  :aria-label="`Delete the message to ${item.to}`"
                  title="Drop it from the queue"
                  @click="deleteMessage(item)"
                >
                  <Trash2 />
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </section>

    <!-- Audit log --------------------------------------------------- -->
    <section class="overflow-hidden rounded-xl border bg-card">
      <header class="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-3">
        <div class="flex min-w-40 flex-1 flex-col gap-0.5">
          <h2 class="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <ScrollText class="size-4 text-muted-foreground" />
            Audit log
            <InfoHint
              title="What is recorded"
              wide
              text="Every administrative action and every security-relevant event: sign-ins, role changes, deletions, rotations, maintenance. It records who, what, when and from which address, and it is pruned after 180 days. It is the only record of an action once the thing it changed has been changed again."
            />
          </h2>
          <p class="text-xs text-muted-foreground">
            {{ audit.length }} loaded{{ auditDone ? '' : ', scroll for more' }}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          :disabled="!audit.length"
          aria-label="Copy the loaded audit entries as JSON"
          @click="copyAudit()"
        >
          <Copy /> Copy JSON
        </Button>
      </header>

      <p v-if="auditError" class="px-4 py-3 text-xs text-destructive">{{ auditError }}</p>

      <div v-else class="max-h-[28rem] overflow-y-auto">
        <ul class="divide-y">
          <li
            v-for="entry in audit"
            :key="entry.id"
            class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2 text-xs"
          >
            <span class="w-24 shrink-0 text-muted-foreground" :title="absolute(entry.ts)">
              {{ ago(entry.ts) }}
            </span>
            <span class="rounded-sm bg-muted px-1.5 py-0.5 font-mono">{{ entry.action }}</span>
            <span class="text-muted-foreground">{{ entry.actor || 'system' }}</span>
            <span v-if="entry.target" class="truncate font-mono text-muted-foreground">
              {{ entry.target }}
            </span>
            <span v-if="entry.ip" class="font-mono text-muted-foreground/70">{{ entry.ip }}</span>
            <span v-if="metaOf(entry)" class="min-w-0 truncate text-muted-foreground/70">
              {{ metaOf(entry) }}
            </span>
          </li>
          <li v-if="!audit.length && !auditLoading" class="px-4 py-8 text-center text-sm text-muted-foreground">
            Nothing recorded yet.
          </li>
        </ul>

        <!-- Sentinel: reaching it loads the next page. -->
        <div ref="sentinel" class="flex items-center justify-center py-3 text-xs text-muted-foreground">
          <span v-if="auditLoading" class="flex items-center gap-1.5">
            <Clock class="size-3.5 animate-pulse" /> Loading…
          </span>
          <span v-else-if="auditDone && audit.length">End of the log</span>
        </div>
      </div>
    </section>
  </div>
</template>
