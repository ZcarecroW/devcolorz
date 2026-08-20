<script setup lang="ts">
/**
 * The first-run wizard.
 *
 * Two decisions shape it. First, the check list is gating rather than
 * advisory: an install that proceeds past a failing writability or PHP check
 * produces a site that half-works and a support thread nobody can debug, so
 * the form stays disabled until the server says every check passes. Second,
 * the cron token and the invitation code are shown exactly once, because they
 * are bearer credentials — the server keeps only hashes, and there is no
 * "show it again" to build.
 */
import { computed, onMounted, ref } from 'vue'
import { scorePassword } from '@/lib/auth/password'
import { RouterLink } from 'vue-router'
import {
  Check,
  CircleCheck,
  CircleX,
  Copy,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from '@lucide/vue'
import { toast } from 'vue-sonner'
import InfoHint from '@/components/common/InfoHint.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError, api } from '@/lib/api'
import { useSessionStore } from '@/stores/session'

interface SetupCheck {
  id: string
  label: string
  ok: boolean
  /**
   * Whether a failure blocks installation.
   *
   * Only four things genuinely cannot work: an old PHP, a missing pdo_sqlite,
   * an ancient SQLite, and an unwritable document root. Everything else is a
   * judgement call the operator is allowed to make — most importantly HTTPS,
   * which reads as failed whenever TLS is terminated at a reverse proxy,
   * because `$_SERVER['HTTPS']` is then unset. Blocking on it would make an
   * ordinary deployment impossible to install.
   */
  required?: boolean
  detail: string
}

interface SetupStatus {
  installed: boolean
  checks: SetupCheck[]
}

interface InstallResult {
  cronToken: string
  inviteToken: string
}

/**
 * Password rules, held here until the auth pages ship a shared module.
 *
 * Length is weighted far above character classes on purpose: a twenty-
 * character passphrase beats "P@ssw0rd!" by every measure that matters, and
 * demanding symbols mostly teaches people to append an exclamation mark.
 */
const MIN_PASSWORD = 12

const session = useSessionStore()

const status = ref<SetupStatus | null>(null)
const loading = ref(true)
const checking = ref(false)
const statusError = ref<string | null>(null)

const email = ref('')
const displayName = ref('')
const password = ref('')
const siteName = ref('DevColorz')
const submitting = ref(false)
const formError = ref<string | null>(null)
const fieldErrors = ref<Record<string, string>>({})
const result = ref<InstallResult | null>(null)
const copied = ref<string | null>(null)

const checks = computed(() => status.value?.checks ?? [])
const failedChecks = computed(() => checks.value.filter((check) => !check.ok))
const blockingChecks = computed(() => failedChecks.value.filter((check) => check.required))
const warningChecks = computed(() => failedChecks.value.filter((check) => !check.required))
const allPassed = computed(() => checks.value.length > 0 && blockingChecks.value.length === 0)
const alreadyInstalled = computed(() => status.value?.installed === true)

const verdict = computed(() => scorePassword(password.value, { context: [email.value, siteName.value] }))
const passwordOk = computed(
  () => password.value.length >= MIN_PASSWORD && verdict.value.score > 0,
)
const emailOk = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()))
const canSubmit = computed(
  () =>
    allPassed.value &&
    !submitting.value &&
    emailOk.value &&
    displayName.value.trim().length > 0 &&
    siteName.value.trim().length > 0 &&
    passwordOk.value,
)

/**
 * The cron URL for this deployment, derived from where the SPA is served.
 * Hard-coding a path would be wrong for the many installs that live in a
 * subdirectory.
 */
const cronUrl = computed(() => {
  const base = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}`
  return `${base}cron.php?k=${result.value?.cronToken ?? 'TOKEN'}`
})

const cronLine = computed(() => `*/5 * * * * curl -fsS "${cronUrl.value}" > /dev/null`)

async function loadStatus() {
  checking.value = status.value !== null
  statusError.value = null
  try {
    status.value = await api.get<SetupStatus>('/setup/status')
  } catch (err) {
    status.value = null
    statusError.value =
      err instanceof ApiError
        ? err.message
        : 'The setup endpoint could not be reached. Check that the server files were uploaded and that PHP is running.'
  } finally {
    loading.value = false
    checking.value = false
  }
}

onMounted(() => void loadStatus())

async function install() {
  if (!canSubmit.value) return
  submitting.value = true
  formError.value = null
  fieldErrors.value = {}
  try {
    result.value = await api.post<InstallResult>(
      '/setup/install',
      {
        email: email.value.trim(),
        password: password.value,
        displayName: displayName.value.trim(),
        siteName: siteName.value.trim(),
      },
      // Before the install there is no session to protect and the pre-install
      // router may not even serve /api/csrf, so asking for a token first would
      // fail the request outright. If the server does want one it answers 419
      // and the client's own refresh-and-retry handles it.
      { skipCsrf: true },
    )
    password.value = ''
    // The rest of the app decides what to show from `meta`, so refresh it
    // before the user navigates anywhere.
    void session.loadMeta()
    toast.success('DevColorz is installed')
  } catch (err) {
    if (err instanceof ApiError) {
      fieldErrors.value = err.problem.errors ?? {}
      formError.value = err.message
    } else {
      formError.value = 'The install request did not reach the server.'
    }
  } finally {
    submitting.value = false
  }
}

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
</script>

<template>
  <div class="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 md:px-6 md:py-12">
    <header>
      <h1 class="flex items-center gap-2 text-xl font-semibold tracking-tight">
        <ShieldCheck class="size-5 text-muted-foreground" aria-hidden="true" />
        Set up DevColorz
      </h1>
      <p class="mt-1 text-sm text-muted-foreground">
        One administrator account, one set of credentials, and the server checks that have to pass
        before any of it will work.
      </p>
    </header>

    <!-- Loading -->
    <div v-if="loading" class="flex flex-col gap-3">
      <Skeleton class="h-6 w-48" />
      <Skeleton class="h-40 w-full" />
    </div>

    <!-- Status unreachable -->
    <div
      v-else-if="statusError"
      class="rounded-lg border border-destructive/40 bg-card p-4 text-sm text-destructive"
      role="alert"
    >
      <p>{{ statusError }}</p>
      <Button size="sm" variant="outline" class="mt-3" @click="loadStatus">
        <RefreshCw /> Check again
      </Button>
    </div>

    <!-- Already installed -->
    <div v-else-if="alreadyInstalled && !result" class="rounded-lg border bg-card p-4 text-sm">
      <p class="font-medium">This installation is already set up.</p>
      <p class="mt-1 text-muted-foreground">
        The wizard runs once and then locks itself out, so nobody can claim an administrator account
        on a live site. Sign in, or ask whoever installed it for an invitation.
      </p>
      <div class="mt-3 flex flex-wrap gap-2">
        <Button as-child size="sm">
          <RouterLink :to="{ name: 'login' }">Sign in</RouterLink>
        </Button>
        <Button as-child size="sm" variant="outline">
          <RouterLink :to="{ name: 'studio' }">Open the generator</RouterLink>
        </Button>
      </div>
    </div>

    <template v-else>
      <!-- The credentials, shown once. -->
      <section v-if="result" class="flex flex-col gap-4">
        <div
          class="flex items-start gap-3 rounded-lg border border-destructive/40 bg-card p-4 text-sm"
        >
          <TriangleAlert class="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
          <p class="text-muted-foreground">
            <strong class="text-foreground">Copy these now.</strong> The server stores only hashes,
            so this page is the one and only time they exist in readable form. Losing the cron token
            means re-running a command on the server; losing the invitation code means generating a
            new one from the admin screen.
          </p>
        </div>

        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-2">
            <Label class="text-xs">Cron token</Label>
            <InfoHint
              title="What the cron token does"
              wide
              text="It authenticates the scheduled job that sends queued email, prunes expired sessions and rebuilds the trending scores. Without it those jobs never run: mail piles up in the outbox and Explore stops moving. It is a bearer credential, so treat the URL below like a password — anyone holding it can trigger the job."
            />
          </div>
          <div class="flex items-center gap-2">
            <code
              class="flex-1 overflow-x-auto rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs"
              >{{ result.cronToken }}</code
            >
            <Button
              variant="outline"
              size="icon"
              aria-label="Copy the cron token"
              @click="copy(result.cronToken, 'cron', 'Cron token copied')"
            >
              <Check v-if="copied === 'cron'" /><Copy v-else />
            </Button>
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-2">
            <Label class="text-xs">Invitation code</Label>
            <InfoHint
              title="What the invitation code does"
              wide
              text="It lets one more person create an account on an installation with open registration turned off — the usual configuration for a private instance. Hand it to the person, not to a group chat: the first person to use it consumes it."
            />
          </div>
          <div class="flex items-center gap-2">
            <code
              class="flex-1 overflow-x-auto rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs"
              >{{ result.inviteToken }}</code
            >
            <Button
              variant="outline"
              size="icon"
              aria-label="Copy the invitation code"
              @click="copy(result.inviteToken, 'invite', 'Invitation code copied')"
            >
              <Check v-if="copied === 'invite'" /><Copy v-else />
            </Button>
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-2">
            <Label class="text-xs">Scheduled job</Label>
            <InfoHint
              title="Every five minutes"
              wide
              text="Five minutes is the interval the queue is tuned for: mail goes out fast enough that a password reset feels immediate, and the job is cheap enough to run that often on shared hosting. If your host offers only a fifteen-minute or hourly cron, everything still works — verification emails simply arrive later."
            />
          </div>
          <p class="text-sm text-muted-foreground">
            Add this line to your crontab, or point your host's scheduler at the URL with a GET
            request every five minutes.
          </p>
          <div class="flex items-center gap-2">
            <code
              class="flex-1 overflow-x-auto rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs whitespace-pre"
              >{{ cronLine }}</code
            >
            <Button
              variant="outline"
              size="icon"
              aria-label="Copy the crontab line"
              @click="copy(cronLine, 'cronline', 'Crontab line copied')"
            >
              <Check v-if="copied === 'cronline'" /><Copy v-else />
            </Button>
          </div>
          <p class="text-xs text-muted-foreground">
            The URL alone, for schedulers that ask for one:
            <code class="font-mono break-all">{{ cronUrl }}</code>
          </p>
        </div>

        <div class="flex flex-wrap gap-2 border-t pt-4">
          <Button as-child>
            <RouterLink :to="{ name: 'login' }">Sign in as the administrator</RouterLink>
          </Button>
          <Button as-child variant="outline">
            <RouterLink :to="{ name: 'studio' }">Open the generator</RouterLink>
          </Button>
        </div>
      </section>

      <template v-else>
        <!-- Checks -->
        <section class="flex flex-col gap-2">
          <div class="flex items-center gap-2">
            <h2 class="text-sm font-semibold tracking-tight">Server checks</h2>
            <InfoHint
              title="Why these gate the install"
              wide
              text="Every check here is something the app cannot work around at runtime: a database directory it cannot write to, a PHP extension it cannot polyfill, a storage folder the web server would happily serve to the public. Installing anyway produces a site that appears to work until the first write fails, which is far harder to diagnose than a red row here."
            />
            <span class="flex-1" />
            <Button size="sm" variant="ghost" :disabled="checking" @click="loadStatus">
              <RefreshCw :class="checking && 'animate-spin'" /> Re-check
            </Button>
          </div>

          <ul class="flex flex-col gap-px overflow-hidden rounded-lg border bg-border">
            <li
              v-for="check in checks"
              :key="check.id"
              class="flex items-start gap-3 bg-card p-3 text-sm"
            >
              <CircleCheck
                v-if="check.ok"
                class="mt-0.5 size-4 shrink-0 text-primary"
                aria-hidden="true"
              />
              <CircleX v-else class="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
              <span class="flex min-w-0 flex-col gap-0.5">
                <span class="font-medium">
                  {{ check.label }}
                  <span class="sr-only">{{ check.ok ? 'passed' : 'failed' }}</span>
                </span>
                <span
                  class="text-xs leading-relaxed"
                  :class="check.ok ? 'text-muted-foreground' : 'text-destructive'"
                >
                  {{ check.detail }}
                </span>
              </span>
            </li>
          </ul>

          <p v-if="blockingChecks.length" class="text-xs text-destructive">
            {{ blockingChecks.length === 1 ? 'One check' : blockingChecks.length + ' checks' }}
            must pass before DevColorz can run at all. Fix
            {{ blockingChecks.length === 1 ? 'it' : 'them' }}, then re-check — the form below stays
            disabled until then.
          </p>
          <p v-else-if="warningChecks.length" class="text-xs text-muted-foreground">
            {{ warningChecks.length === 1 ? 'One check did' : warningChecks.length + ' checks did' }}
            not pass, but {{ warningChecks.length === 1 ? 'it does' : 'they do' }} not stop the
            installation. Read the detail above and decide.
            <template v-if="warningChecks.some((c) => c.id === 'https')">
              If TLS is terminated by a proxy in front of this server, the HTTPS check has no way to
              see it and will always read as failed.
            </template>
          </p>
        </section>

        <!-- Administrator -->
        <section class="flex flex-col gap-4">
          <div class="flex items-center gap-2">
            <h2 class="text-sm font-semibold tracking-tight">First administrator</h2>
            <InfoHint
              title="This account owns the installation"
              wide
              text="It is the only account that can reach the admin screens, change site settings and moderate published palettes. There is no password recovery until email is working, so use an address you can actually receive mail at."
            />
          </div>

          <form class="flex flex-col gap-4" novalidate @submit.prevent="install">
            <fieldset class="contents" :disabled="!allPassed || submitting">
              <div class="flex flex-col gap-1.5">
                <Label for="setup-site">Site name</Label>
                <Input
                  id="setup-site"
                  v-model="siteName"
                  maxlength="60"
                  autocomplete="off"
                  :aria-invalid="Boolean(fieldErrors.siteName)"
                />
                <p class="text-xs text-muted-foreground">
                  Shown in the header, in page titles and as the sender name on outgoing mail.
                </p>
                <p v-if="fieldErrors.siteName" class="text-xs text-destructive">
                  {{ fieldErrors.siteName }}
                </p>
              </div>

              <div class="flex flex-col gap-1.5">
                <Label for="setup-name">Your display name</Label>
                <Input
                  id="setup-name"
                  v-model="displayName"
                  maxlength="60"
                  autocomplete="name"
                  :aria-invalid="Boolean(fieldErrors.displayName)"
                />
                <p v-if="fieldErrors.displayName" class="text-xs text-destructive">
                  {{ fieldErrors.displayName }}
                </p>
              </div>

              <div class="flex flex-col gap-1.5">
                <Label for="setup-email">Email address</Label>
                <Input
                  id="setup-email"
                  v-model="email"
                  type="email"
                  autocomplete="email"
                  :aria-invalid="Boolean(fieldErrors.email)"
                />
                <p v-if="fieldErrors.email" class="text-xs text-destructive">
                  {{ fieldErrors.email }}
                </p>
              </div>

              <div class="flex flex-col gap-1.5">
                <div class="flex items-center gap-2">
                  <Label for="setup-password">Password</Label>
                  <InfoHint
                    title="Length beats complexity"
                    wide
                    text="The minimum here is twelve characters, and the strength meter weights length far above character classes. Four unrelated words are stronger than a short password with a symbol bolted on, and you will actually remember them. The only hard rules are the length floor, some variety, and not reusing your email address or the site name."
                  />
                </div>
                <Input
                  id="setup-password"
                  v-model="password"
                  type="password"
                  autocomplete="new-password"
                  :aria-invalid="Boolean(fieldErrors.password)"
                  aria-describedby="setup-password-strength"
                />
                <div id="setup-password-strength" class="flex flex-col gap-1.5">
                  <div class="flex items-center gap-2">
                    <Progress
                      :model-value="(verdict.score / 4) * 100"
                      class="h-1.5 flex-1"
                      :aria-label="`Password strength: ${verdict.label}`"
                    />
                    <span class="w-20 text-right text-xs text-muted-foreground">
                      {{ password ? verdict.label : '' }}
                    </span>
                  </div>
                  <ul v-if="password && verdict.problems.length" class="flex flex-col gap-0.5">
                    <li
                      v-for="problem in verdict.problems"
                      :key="problem"
                      class="text-xs"
                      :class="passwordOk ? 'text-muted-foreground' : 'text-destructive'"
                    >
                      {{ problem }}
                    </li>
                  </ul>
                </div>
                <p v-if="fieldErrors.password" class="text-xs text-destructive">
                  {{ fieldErrors.password }}
                </p>
              </div>

              <p v-if="formError" class="text-sm text-destructive" role="alert">{{ formError }}</p>

              <Button type="submit" :disabled="!canSubmit">
                <KeyRound />
                {{ submitting ? 'Installing…' : 'Create administrator and finish' }}
              </Button>
            </fieldset>
          </form>
        </section>
      </template>
    </template>
  </div>
</template>
