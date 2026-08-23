<script setup lang="ts">
/**
 * Account settings.
 *
 * One column of independent cards, each with its own submit and its own error
 * state. Grouping every field behind a single Save button would mean a rejected
 * password reverts an unrelated display-name edit, and it would force the
 * server to accept a change of email and a change of password in one request —
 * two operations with very different confirmation requirements.
 *
 * Preferences are applied to the studio store the moment they change and pushed
 * to the server afterwards, so the setting takes effect even if the network
 * call fails. The server copy is what a fresh device inherits.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { scorePassword } from '@/lib/auth/password'
import { RouterLink, useRouter } from 'vue-router'
import {
  CircleAlert,
  CircleCheck,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LogOut,
  Mail,
  Save,
  Trash2,
  TriangleAlert,
  UserRound,
} from '@lucide/vue'
import { toast } from 'vue-sonner'
import InfoHint from '@/components/common/InfoHint.vue'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PREVIEW_TEMPLATES } from '@/components/preview/registry'
import { ApiError, api, request, type UserResponse } from '@/lib/api'
import { METRIC_HINTS, METRIC_LABELS, type ContrastMetric } from '@/lib/color/contrast'
import { FORMAT_HINTS, FORMAT_LABELS } from '@/lib/color/convert'
import type { ColorFormat } from '@/lib/color/types'
import { useSessionStore } from '@/stores/session'
import { useStudioStore } from '@/stores/studio'


/**
 * The preview templates the studio can default to. This mirrors the preview
 * registry; when `@/components/preview` exports a manifest, import that instead
 * so the two lists cannot drift.
 */

const FORMAT_IDS = Object.keys(FORMAT_LABELS) as ColorFormat[]
const METRIC_IDS = Object.keys(METRIC_LABELS) as ContrastMetric[]

const session = useSessionStore()
const studio = useStudioStore()
const router = useRouter()

/* ---------------- profile ---------------- */

const displayName = ref('')
const savingProfile = ref(false)
const profileError = ref('')
const profileFieldErrors = ref<Record<string, string>>({})

const initials = computed(() => {
  const source = displayName.value.trim() || session.user?.email || ''
  const parts = source.split(/[\s._@-]+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return source.slice(0, 2).toUpperCase() || '?'
})

/**
 * Other parts of the app may store their own keys under `prefs`, so every write
 * carries the current object forward rather than replacing it.
 */
function prefsPayload(): Record<string, unknown> {
  return {
    ...(session.user?.prefs ?? {}),
    format: studio.format,
    previewTemplate: studio.previewTemplate,
    metric: studio.metric,
  }
}

function describeFailure(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) {
    return 'Could not reach the server. Check your connection and try again.'
  }
  if (error.isRateLimited) {
    const wait = Math.ceil((error.problem.retryAfter ?? 60) / 60)
    return `Too many attempts. Try again in about ${wait} minute(s).`
  }
  return error.message || fallback
}

async function saveProfile() {
  if (savingProfile.value || !displayName.value.trim()) return
  savingProfile.value = true
  profileError.value = ''
  profileFieldErrors.value = {}
  try {
    const result = await api.patch<{ user: UserResponse }>('/auth/me', {
      displayName: displayName.value.trim(),
      prefs: prefsPayload(),
    })
    session.patchUser(result.user)
    toast.success('Profile saved')
  } catch (error) {
    if (error instanceof ApiError && error.isValidation && error.problem.errors) {
      profileFieldErrors.value = error.problem.errors
    }
    profileError.value = describeFailure(error, 'The profile could not be saved.')
  } finally {
    savingProfile.value = false
  }
}

/* ---------------- email ---------------- */

const newEmail = ref('')
const emailPassword = ref('')
const savingEmail = ref(false)
const emailSent = ref(false)
const emailError = ref('')
const emailFieldErrors = ref<Record<string, string>>({})

const emailBlocked = computed(
  () =>
    savingEmail.value ||
    !newEmail.value.trim() ||
    !emailPassword.value ||
    newEmail.value.trim().toLowerCase() === (session.user?.email ?? '').toLowerCase(),
)

async function changeEmail() {
  if (emailBlocked.value) return
  savingEmail.value = true
  emailError.value = ''
  emailFieldErrors.value = {}
  try {
    await api.post('/auth/change-email', {
      email: newEmail.value.trim(),
      password: emailPassword.value,
    })
    emailSent.value = true
    emailPassword.value = ''
  } catch (error) {
    if (error instanceof ApiError && error.isValidation && error.problem.errors) {
      emailFieldErrors.value = error.problem.errors
    }
    emailError.value = describeFailure(error, 'The address could not be changed.')
  } finally {
    savingEmail.value = false
  }
}

/* ---------------- password ---------------- */

const currentPassword = ref('')
const newPassword = ref('')
const revealNew = ref(false)
const savingPassword = ref(false)
const passwordError = ref('')
const passwordFieldErrors = ref<Record<string, string>>({})

const strength = computed(() =>
  scorePassword(newPassword.value, {
    minLength: session.minPasswordLength,
    context: [session.user?.email ?? "", session.user?.displayName ?? ""],
  }),
)

const meterClass = computed(() => {
  if (strength.value.score <= 1) return 'bg-destructive'
  if (strength.value.score === 2) return 'bg-muted-foreground'
  if (strength.value.score === 3) return 'bg-primary/60'
  return 'bg-primary'
})

const passwordBlocked = computed(
  () =>
    savingPassword.value ||
    !currentPassword.value ||
    !strength.value.acceptable ||
    newPassword.value === currentPassword.value,
)

async function changePassword() {
  if (passwordBlocked.value) return
  savingPassword.value = true
  passwordError.value = ''
  passwordFieldErrors.value = {}
  try {
    await api.post('/auth/change-password', {
      currentPassword: currentPassword.value,
      newPassword: newPassword.value,
    })
    currentPassword.value = ''
    newPassword.value = ''
    // The server revokes every other session on a password change, and the
    // confirmation email says so. The toast used to say the opposite.
    toast.success('Password changed. Every other signed-in session was ended.')
  } catch (error) {
    if (error instanceof ApiError && error.isValidation && error.problem.errors) {
      passwordFieldErrors.value = error.problem.errors
    }
    passwordError.value = describeFailure(error, 'The password could not be changed.')
  } finally {
    savingPassword.value = false
  }
}

/* ---------------- sessions ---------------- */

const signingOutAll = ref(false)
const sessionsError = ref('')

async function signOutEverywhere() {
  if (signingOutAll.value) return
  signingOutAll.value = true
  sessionsError.value = ''
  try {
    await api.post('/auth/logout-all')
    // The current session is among the ones just revoked, so clear the local
    // copy rather than leaving the header claiming we are still signed in.
    try {
      await session.logout()
    } catch {
      // The server already invalidated it; the store state is what matters.
    }
    toast.success('Signed out on every device')
    await router.replace({ name: 'login' })
  } catch (error) {
    sessionsError.value = describeFailure(error, 'The sessions could not be revoked.')
  } finally {
    signingOutAll.value = false
  }
}

/* ---------------- data ---------------- */

const exporting = ref(false)
const dataError = ref('')

async function exportData() {
  if (exporting.value) return
  exporting.value = true
  dataError.value = ''
  try {
    const payload = await api.get<unknown>('/account/export')
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `devcolorz-account-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    // Revoking in the same tick cancels the download in Safari and Firefox.
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
  } catch (error) {
    dataError.value = describeFailure(error, 'The export could not be produced.')
  } finally {
    exporting.value = false
  }
}

const deleteOpen = ref(false)
const deleteConfirm = ref('')
const deletePassword = ref('')
const deleting = ref(false)
const deleteError = ref('')

const deleteBlocked = computed(
  () => deleting.value || deleteConfirm.value !== 'DELETE' || !deletePassword.value,
)

async function deleteAccount() {
  if (deleteBlocked.value) return
  deleting.value = true
  deleteError.value = ''
  try {
    // `api.delete` takes no body, and this endpoint needs the password in one.
    await request<void>('/auth/account', {
      method: 'DELETE',
      body: { password: deletePassword.value },
    })
    try {
      await session.logout()
    } catch {
      // The account is gone, so a failing logout call is expected.
    }
    deleteOpen.value = false
    toast.success('Account deleted')
    await router.replace({ name: 'studio' })
  } catch (error) {
    deleteError.value = describeFailure(error, 'The account could not be deleted.')
  } finally {
    deleting.value = false
  }
}

/* ---------------- preferences ---------------- */

const savingPrefs = ref(false)
const prefsError = ref('')

async function savePrefs() {
  savingPrefs.value = true
  prefsError.value = ''
  try {
    const result = await api.patch<{ user: UserResponse }>('/auth/me', {
      displayName: (displayName.value.trim() || session.user?.displayName) ?? '',
      prefs: prefsPayload(),
    })
    session.patchUser(result.user)
  } catch (error) {
    prefsError.value = describeFailure(error, 'The preference was not saved to the server.')
  } finally {
    savingPrefs.value = false
  }
}

function setFormat(value: ColorFormat) {
  studio.format = value
  void savePrefs()
}

function setTemplate(value: string) {
  studio.previewTemplate = value
  void savePrefs()
}

function setMetric(value: ContrastMetric) {
  studio.metric = value
  void savePrefs()
}

/* ---------------- hydration ---------------- */

let adopted = false

/**
 * The server copy wins on first load: signing in on a new machine should bring
 * your defaults with you rather than inheriting whatever that browser had.
 */
function adoptPrefs(prefs: Record<string, unknown>) {
  const format = prefs.format
  if (typeof format === 'string' && (FORMAT_IDS as string[]).includes(format)) {
    studio.format = format as ColorFormat
  }
  const template = prefs.previewTemplate
  if (typeof template === 'string' && PREVIEW_TEMPLATES.some((t) => t.id === template)) {
    studio.previewTemplate = template
  }
  const metric = prefs.metric
  if (typeof metric === 'string' && (METRIC_IDS as string[]).includes(metric)) {
    studio.metric = metric as ContrastMetric
  }
}

watch(
  () => session.user,
  (user) => {
    if (!user) return
    displayName.value = user.displayName
    if (!adopted) {
      adopted = true
      adoptPrefs(user.prefs ?? {})
    }
  },
  { immediate: true },
)

onMounted(() => {
  // A hard refresh lands here before `/auth/me` has answered.
  if (!session.ready) void session.bootstrap()
})
</script>

<template>
  <div class="mx-auto w-full max-w-3xl flex-1 px-4 py-8 md:py-10">
    <div v-if="!session.ready" class="flex items-center gap-2 text-sm text-muted-foreground">
      <LoaderCircle class="size-4 animate-spin" />
      Loading your account
    </div>

    <Card v-else-if="!session.isAuthenticated">
      <CardHeader>
        <CardTitle>Sign in to manage your account</CardTitle>
        <CardDescription>
          Account settings need a session. The generator, theme editor and export all work without
          one.
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Button as-child>
          <RouterLink :to="{ name: 'login' }">Sign in</RouterLink>
        </Button>
      </CardFooter>
    </Card>

    <div v-else class="flex flex-col gap-6">
      <header class="flex flex-col gap-1">
        <h1 class="text-xl font-semibold tracking-tight">Account</h1>
        <p class="text-sm text-muted-foreground">
          Signed in as {{ session.user?.email }} · member since
          {{ new Date((session.user?.createdAt ?? 0) * 1000).toLocaleDateString() }}
        </p>
      </header>

      <!-- Profile -->
      <!--
        A real form, not a card with a button in it.

        Two things depend on it. Enter is how people submit a password field,
        and without a form it did nothing at all here while working on every
        other form in the app. And a password manager only offers to update a
        stored credential when it sees a form submit — without one, changing
        your password here left the manager holding the old one.
      -->
      <form novalidate @submit.prevent="saveProfile">
      <Card>
        <CardHeader>
          <CardTitle class="text-base">Profile</CardTitle>
          <CardDescription>
            Your display name appears on palettes you publish. It is the only part of your profile
            other people ever see.
          </CardDescription>
        </CardHeader>
        <CardContent class="flex flex-col gap-4">
          <div class="flex items-center gap-4">
            <Avatar class="size-12">
              <AvatarFallback class="bg-primary text-sm font-semibold text-primary-foreground">
                {{ initials }}
              </AvatarFallback>
            </Avatar>
            <div class="flex flex-1 flex-col gap-1.5">
              <Label for="account-name" class="gap-1.5">
                Display name
                <InfoHint
                  title="Initials, not uploads"
                  wide
                  text="The avatar is drawn from the first letters of your display name, so it updates as you type and never needs an upload. That keeps user-supplied images out of the app entirely — an image host is a moderation problem, a storage bill and an attack surface, none of which a color tool needs."
                />
              </Label>
              <Input
                id="account-name"
                v-model="displayName"
                autocomplete="nickname"
                :aria-invalid="Boolean(profileFieldErrors.displayName)"
              />
              <p v-if="profileFieldErrors.displayName" class="text-xs text-destructive">
                {{ profileFieldErrors.displayName }}
              </p>
            </div>
          </div>

          <p
            v-if="profileError"
            class="flex items-start gap-2 text-xs leading-relaxed text-destructive"
            role="alert"
          >
            <CircleAlert class="mt-px size-3.5 shrink-0" />
            <span>{{ profileError }}</span>
          </p>
        </CardContent>
        <CardFooter class="justify-end border-t">
          <Button
            :disabled="savingProfile || !displayName.trim()"
            @click="saveProfile"
          >
            <LoaderCircle v-if="savingProfile" class="animate-spin" />
            <Save v-else />
            Save profile
          </Button>
        </CardFooter>
      </Card>
      </form>

      <!-- Email -->
      <form novalidate @submit.prevent="changeEmail">
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2 text-base">
            Email
            <Badge v-if="session.user?.emailVerified" variant="secondary" class="font-normal">
              Confirmed
            </Badge>
            <Badge v-else variant="destructive" class="font-normal">Unconfirmed</Badge>
          </CardTitle>
          <CardDescription>
            Currently <strong class="text-foreground">{{ session.user?.email }}</strong>. This is
            the address password recovery goes to.
          </CardDescription>
        </CardHeader>
        <CardContent class="flex flex-col gap-4">
          <p
            v-if="emailSent"
            class="flex items-start gap-2 rounded-md border px-3 py-2 text-xs leading-relaxed text-muted-foreground"
          >
            <CircleCheck class="mt-px size-3.5 shrink-0 text-primary" />
            <span>
              A confirmation link is on its way to the new address. Nothing changes until it is
              opened — until then the old address stays in charge of the account.
            </span>
          </p>

          <div class="flex flex-col gap-1.5">
            <Label for="account-new-email" class="gap-1.5">
              New address
              <InfoHint
                title="Why this takes two steps"
                wide
                text="The confirmation link goes to the new address, not the old one, so the change only completes if you can actually read mail there. A typo therefore costs you nothing: the account keeps the address it has. The old address is notified as well, which is what turns a stolen session into something you find out about instead of something you lose the account to."
              />
            </Label>
            <Input
              id="account-new-email"
              v-model="newEmail"
              type="email"
              autocomplete="email"
              inputmode="email"
              placeholder="new@example.com"
              :aria-invalid="Boolean(emailFieldErrors.email)"
            />
            <p v-if="emailFieldErrors.email" class="text-xs text-destructive">
              {{ emailFieldErrors.email }}
            </p>
          </div>

          <div class="flex flex-col gap-1.5">
            <Label for="account-email-password">Current password</Label>
            <Input
              id="account-email-password"
              v-model="emailPassword"
              type="password"
              autocomplete="current-password"
              :aria-invalid="Boolean(emailFieldErrors.password)"
            />
            <p v-if="emailFieldErrors.password" class="text-xs text-destructive">
              {{ emailFieldErrors.password }}
            </p>
          </div>

          <p
            v-if="emailError"
            class="flex items-start gap-2 text-xs leading-relaxed text-destructive"
            role="alert"
          >
            <CircleAlert class="mt-px size-3.5 shrink-0" />
            <span>{{ emailError }}</span>
          </p>
        </CardContent>
        <CardFooter class="justify-end border-t">
          <Button variant="outline" :disabled="emailBlocked" @click="changeEmail">
            <LoaderCircle v-if="savingEmail" class="animate-spin" />
            <Mail v-else />
            Send confirmation
          </Button>
        </CardFooter>
      </Card>
      </form>

      <!-- Password -->
      <form novalidate @submit.prevent="changePassword">
      <Card>
        <CardHeader>
          <CardTitle class="text-base">Password</CardTitle>
          <CardDescription>
            At least {{ session.minPasswordLength }} characters. Pasting from a password manager is never blocked.
          </CardDescription>
        </CardHeader>
        <CardContent class="flex flex-col gap-4">
          <div class="flex flex-col gap-1.5">
            <Label for="account-current-password">Current password</Label>
            <Input
              id="account-current-password"
              v-model="currentPassword"
              type="password"
              autocomplete="current-password"
              :aria-invalid="Boolean(passwordFieldErrors.currentPassword)"
            />
            <p v-if="passwordFieldErrors.currentPassword" class="text-xs text-destructive">
              {{ passwordFieldErrors.currentPassword }}
            </p>
          </div>

          <div class="flex flex-col gap-1.5">
            <Label for="account-new-password" class="gap-1.5">
              New password
              <InfoHint
                title="What the meter measures"
                wide
                text="Length first, character classes second, and a check against the passwords every cracking list starts with. That order matches how guessing actually works: a 16-character phrase of ordinary words survives far longer than an eight-character one with a symbol bolted on. The bar fills as those conditions are met; it is a guide, not a gate."
              />
            </Label>
            <div class="relative">
              <Input
                id="account-new-password"
                v-model="newPassword"
                :type="revealNew ? 'text' : 'password'"
                autocomplete="new-password"
                class="pr-10"
                :aria-invalid="Boolean(passwordFieldErrors.newPassword)"
                aria-describedby="account-password-meter"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                class="absolute top-1/2 right-0.5 -translate-y-1/2 text-muted-foreground"
                :aria-label="revealNew ? 'Hide password' : 'Show password'"
                :aria-pressed="revealNew"
                @click="revealNew = !revealNew"
              >
                <EyeOff v-if="revealNew" />
                <Eye v-else />
              </Button>
            </div>

            <div class="flex items-center gap-2">
              <div class="flex h-1.5 flex-1 gap-1" aria-hidden="true">
                <span
                  v-for="segment in 4"
                  :key="segment"
                  class="flex-1 rounded-full transition-colors"
                  :class="segment <= strength.score ? meterClass : 'bg-muted'"
                />
              </div>
              <span class="w-16 shrink-0 text-right text-[11px] text-muted-foreground">
                {{ strength.label }}
              </span>
            </div>
            <p
              id="account-password-meter"
              role="status"
              class="text-[11px] leading-relaxed text-muted-foreground"
            >
              {{ strength.advice }}
            </p>
            <p v-if="passwordFieldErrors.newPassword" class="text-xs text-destructive">
              {{ passwordFieldErrors.newPassword }}
            </p>
          </div>

          <p
            v-if="passwordError"
            class="flex items-start gap-2 text-xs leading-relaxed text-destructive"
            role="alert"
          >
            <CircleAlert class="mt-px size-3.5 shrink-0" />
            <span>{{ passwordError }}</span>
          </p>
        </CardContent>
        <CardFooter class="justify-end border-t">
          <Button variant="outline" :disabled="passwordBlocked" @click="changePassword">
            <LoaderCircle v-if="savingPassword" class="animate-spin" />
            <KeyRound v-else />
            Change password
          </Button>
        </CardFooter>
      </Card>
      </form>

      <!-- Sessions -->
      <Card>
        <CardHeader>
          <CardTitle class="text-base">Sessions</CardTitle>
          <CardDescription>
            Sessions are cookies, one per browser. There is no device list to read because the
            server keeps no fingerprint of them beyond what it needs to expire them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p
            v-if="sessionsError"
            class="flex items-start gap-2 text-xs leading-relaxed text-destructive"
            role="alert"
          >
            <CircleAlert class="mt-px size-3.5 shrink-0" />
            <span>{{ sessionsError }}</span>
          </p>
          <p v-else class="text-sm leading-relaxed text-muted-foreground">
            Revoking every session is the right move after using a shared machine, or if a "keep me
            signed in" cookie went somewhere you did not intend.
          </p>
        </CardContent>
        <CardFooter class="items-center justify-between gap-3 border-t">
          <span class="flex items-center gap-1.5 text-xs text-muted-foreground">
            This signs you out here too
            <InfoHint
              title="Sign out everywhere"
              wide
              text="Every session cookie for this account is invalidated at once, including the one this browser is using, so you will land back on the sign-in page. Changing your password already ends every other session; use this when you want to sign out here as well."
            />
          </span>
          <Button variant="outline" :disabled="signingOutAll" @click="signOutEverywhere">
            <LoaderCircle v-if="signingOutAll" class="animate-spin" />
            <LogOut v-else />
            Sign out everywhere
          </Button>
        </CardFooter>
      </Card>

      <!-- Preferences -->
      <Card>
        <CardHeader>
          <CardTitle class="text-base">Preferences</CardTitle>
          <CardDescription>
            The defaults the studio opens with. They apply immediately here and follow you to any
            browser you sign in from.
          </CardDescription>
        </CardHeader>
        <CardContent class="flex flex-col gap-4">
          <div class="flex flex-col gap-1.5">
            <Label class="gap-1.5">
              Default notation
              <InfoHint
                title="Default color notation"
                wide
                :text="FORMAT_HINTS[studio.format]"
              />
            </Label>
            <Select
              :model-value="studio.format"
              @update:model-value="setFormat($event as ColorFormat)"
            >
              <SelectTrigger class="w-full" aria-label="Default color notation">
                <SelectValue />
              </SelectTrigger>
              <SelectContent class="max-h-96">
                <SelectItem
                  v-for="id in FORMAT_IDS"
                  :key="id"
                  :value="id"
                  :label="FORMAT_LABELS[id]"
                  :description="FORMAT_HINTS[id]"
                />
              </SelectContent>
            </Select>
          </div>

          <div class="flex flex-col gap-1.5">
            <Label class="gap-1.5">
              Default preview template
              <InfoHint
                title="Default preview"
                wide
                text="Which mock-up the preview pane opens on. Pick the one closest to what you actually build: a palette that looks convincing as a wordmark grid can fall apart the moment it has to carry a dashboard's worth of surfaces, borders and disabled states."
              />
            </Label>
            <Select
              :model-value="studio.previewTemplate"
              @update:model-value="setTemplate($event as string)"
            >
              <SelectTrigger class="w-full" aria-label="Default preview template">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="template in PREVIEW_TEMPLATES"
                  :key="template.id"
                  :value="template.id"
                >
                  {{ template.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="flex flex-col gap-1.5">
            <Label class="gap-1.5">
              Default contrast metric
              <InfoHint
                title="Contrast metric"
                wide
                :text="METRIC_HINTS[studio.metric]"
              />
            </Label>
            <Select
              :model-value="studio.metric"
              @update:model-value="setMetric($event as ContrastMetric)"
            >
              <SelectTrigger class="w-full" aria-label="Default contrast metric">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="id in METRIC_IDS"
                  :key="id"
                  :value="id"
                  :label="METRIC_LABELS[id]"
                  :description="METRIC_HINTS[id]"
                />
              </SelectContent>
            </Select>
          </div>

          <p v-if="prefsError" class="text-xs leading-relaxed text-destructive" role="alert">
            {{ prefsError }} The setting is active in this browser regardless.
          </p>
          <p v-else-if="savingPrefs" class="text-[11px] text-muted-foreground">Saving</p>
        </CardContent>
      </Card>

      <!-- Data -->
      <Card class="border-destructive/40">
        <CardHeader>
          <CardTitle class="text-base">Your data</CardTitle>
          <CardDescription>
            Everything the server holds about you, in one file — and the way to remove all of it.
          </CardDescription>
        </CardHeader>
        <CardContent class="flex flex-col gap-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex max-w-md flex-col gap-0.5">
              <span class="flex items-center gap-1.5 text-sm font-medium">
                Export as JSON
                <InfoHint
                  title="What the export contains"
                  wide
                  text="Your profile, preferences and every palette with its colors, names and timestamps, as a single JSON file. It is a portability format, not a backup you can re-upload: colors go back in through the import field, which reads hex lists and CSS as happily as it reads this."
                />
              </span>
              <span class="text-xs text-muted-foreground">
                Downloads immediately. Nothing is emailed.
              </span>
            </div>
            <Button variant="outline" :disabled="exporting" @click="exportData">
              <LoaderCircle v-if="exporting" class="animate-spin" />
              <Download v-else />
              Export
            </Button>
          </div>

          <p
            v-if="dataError"
            class="flex items-start gap-2 text-xs leading-relaxed text-destructive"
            role="alert"
          >
            <CircleAlert class="mt-px size-3.5 shrink-0" />
            <span>{{ dataError }}</span>
          </p>

          <div class="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div class="flex max-w-md flex-col gap-0.5">
              <span class="text-sm font-medium">Delete account</span>
              <span class="text-xs leading-relaxed text-muted-foreground">
                Removes the account, every palette on it and every public link pointing at one.
                There is no recovery window — export first if you want any of it.
              </span>
            </div>

            <AlertDialog v-model:open="deleteOpen">
              <AlertDialogTrigger as-child>
                <Button variant="destructive">
                  <Trash2 />
                  Delete account
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle class="flex items-center gap-2">
                    <TriangleAlert class="size-4 text-destructive" />
                    Delete this account permanently
                  </AlertDialogTitle>
                  <AlertDialogDescription class="leading-relaxed">
                    Every palette, share link and preference on
                    <strong class="text-foreground">{{ session.user?.email }}</strong> is deleted
                    right away. Links you have given other people will stop resolving. This cannot
                    be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>

                <div class="flex flex-col gap-3">
                  <div class="flex flex-col gap-1.5">
                    <Label for="delete-password">Your password</Label>
                    <Input
                      id="delete-password"
                      v-model="deletePassword"
                      type="password"
                      autocomplete="current-password"
                    />
                  </div>
                  <div class="flex flex-col gap-1.5">
                    <Label for="delete-confirm">
                      Type DELETE to confirm
                    </Label>
                    <Input
                      id="delete-confirm"
                      v-model="deleteConfirm"
                      autocomplete="off"
                      spellcheck="false"
                      class="font-mono"
                      placeholder="DELETE"
                      aria-describedby="delete-confirm-help"
                    />
                    <p id="delete-confirm-help" class="text-[11px] leading-relaxed text-muted-foreground">
                      Typing the word is deliberate friction. It is the difference between an
                      irreversible action and a mis-aimed click.
                    </p>
                  </div>
                  <p
                    v-if="deleteError"
                    class="flex items-start gap-2 text-xs leading-relaxed text-destructive"
                    role="alert"
                  >
                    <CircleAlert class="mt-px size-3.5 shrink-0" />
                    <span>{{ deleteError }}</span>
                  </p>
                </div>

                <AlertDialogFooter>
                  <AlertDialogCancel>Keep my account</AlertDialogCancel>
                  <Button variant="destructive" :disabled="deleteBlocked" @click="deleteAccount">
                    <LoaderCircle v-if="deleting" class="animate-spin" />
                    <Trash2 v-else />
                    Delete permanently
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      <p class="flex items-center justify-center gap-1.5 pb-4 text-xs text-muted-foreground">
        <UserRound class="size-3.5" />
        Signed in as {{ session.user?.displayName || session.user?.email }}
      </p>
    </div>
  </div>
</template>
