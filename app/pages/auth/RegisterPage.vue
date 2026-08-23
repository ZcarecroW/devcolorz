<script setup lang="ts">
/**
 * Create an account.
 *
 * Whether an invitation code is needed is the administrator's choice, so the
 * field follows `features.inviteOnly` from `/meta` rather than being a fixture
 * of the form. It is stated on the field rather than discovered after a
 * rejected submit, because the alternative is people filling in four inputs to
 * be told they were never eligible — and, before this followed the setting, an
 * open instance still demanded a code nobody could supply.
 *
 * The strength meter measures length first and character classes second, which
 * is the opposite of the usual "must contain a symbol" rule and matches how
 * cracking actually works. Paste is never intercepted — blocking it is what
 * pushes people off password managers and onto passwords they can type.
 */
import { computed, ref } from 'vue'
import { scorePassword } from '@/lib/auth/password'
import { RouterLink } from 'vue-router'
import { CircleAlert, CircleCheck, Eye, EyeOff, LoaderCircle, UserRoundPlus } from '@lucide/vue'
import AuthShell from '@/components/auth/AuthShell.vue'
import HCaptchaField from '@/components/auth/HCaptchaField.vue'
import InfoHint from '@/components/common/InfoHint.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError, api } from '@/lib/api'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()

/** Follows the instance setting; see the block comment above. */
const inviteRequired = computed(() => session.inviteRequired)

const displayName = ref('')
const email = ref('')
const password = ref('')
const inviteToken = ref('')
const revealed = ref(false)

const captchaToken = ref('')
const captcha = ref<InstanceType<typeof HCaptchaField> | null>(null)

const submitting = ref(false)
const submitted = ref(false)
const formError = ref('')
const fieldErrors = ref<Record<string, string>>({})

/**
 * The minimum comes from the server, not from this file: an administrator can
 * raise `auth.minPasswordLength`, and a meter that still called twelve
 * characters acceptable would send the form off to be rejected.
 *
 * The address and the display name go in as `context` because a password built
 * out of something already on this screen is not a secret, and it is the
 * mistake people make while filling a form in a hurry.
 */
const strength = computed(() =>
  scorePassword(password.value, {
    minLength: session.minPasswordLength,
    context: [email.value, displayName.value],
  }),
)

const meterClass = computed(() => {
  if (strength.value.score <= 1) return 'bg-destructive'
  if (strength.value.score === 2) return 'bg-muted-foreground'
  if (strength.value.score === 3) return 'bg-primary/60'
  return 'bg-primary'
})

const blocked = computed(
  () =>
    submitting.value ||
    !displayName.value.trim() ||
    !email.value.trim() ||
    (inviteRequired.value && !inviteToken.value.trim()) ||
    !strength.value.acceptable,
)

async function submit() {
  if (blocked.value) return
  submitting.value = true
  formError.value = ''
  fieldErrors.value = {}
  try {
    await api.post('/auth/register', {
      email: email.value.trim(),
      password: password.value,
      displayName: displayName.value.trim(),
      ...(inviteRequired.value ? { inviteToken: inviteToken.value.trim() } : {}),
      captchaToken: captchaToken.value,
    })
    submitted.value = true
  } catch (error) {
    // The answer is spent whether or not the server liked the rest of the form.
    captchaToken.value = ''
    captcha.value?.reset()

    if (!(error instanceof ApiError)) {
      formError.value = 'Could not reach the server. Check your connection and try again.'
    } else if (error.isRateLimited) {
      const wait = error.problem.retryAfter ?? 60
      formError.value = `Too many attempts. Try again in about ${Math.ceil(wait / 60)} minute(s).`
    } else if (error.isValidation && error.problem.errors) {
      fieldErrors.value = error.problem.errors
      if (!Object.keys(error.problem.errors).length) formError.value = error.message
    } else {
      formError.value = error.message
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AuthShell
    v-if="submitted"
    :title="session.emailVerificationRequired ? 'Check your email' : 'Account created'"
    :subtitle="
      session.emailVerificationRequired
        ? 'The account exists but is not usable yet.'
        : 'The account is active and ready to sign in.'
    "
  >
    <p class="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
      <CircleCheck class="mt-0.5 size-4 shrink-0 text-primary" />
      <span v-if="session.emailVerificationRequired">
        A confirmation link is on its way to <strong class="text-foreground">{{ email }}</strong>.
        Open it and the account becomes active. The link is good for 24 hours; after that, request
        a new one from the sign-in page.
      </span>
      <span v-else>
        <strong class="text-foreground">{{ email }}</strong> can sign in now — this instance does
        not ask new accounts to confirm their address.
      </span>
    </p>
    <template #footer>
      <Button as-child variant="outline">
        <RouterLink :to="{ name: 'login' }">Back to sign in</RouterLink>
      </Button>
    </template>
  </AuthShell>

  <AuthShell
    v-else
    wide
    title="Create an account"
    subtitle="An account stores palettes on the server and lets you share them by link. The generator works without one."
  >
    <form class="flex flex-col gap-4" novalidate @submit.prevent="submit">
      <div class="flex flex-col gap-1.5">
        <Label for="register-name">Display name</Label>
        <Input
          id="register-name"
          v-model="displayName"
          autocomplete="nickname"
          placeholder="Ada Lovelace"
          :aria-invalid="Boolean(fieldErrors.displayName)"
          :aria-describedby="fieldErrors.displayName ? 'register-name-error' : undefined"
        />
        <p v-if="fieldErrors.displayName" id="register-name-error" class="text-xs text-destructive">
          {{ fieldErrors.displayName }}
        </p>
      </div>

      <div class="flex flex-col gap-1.5">
        <Label for="register-email">Email</Label>
        <Input
          id="register-email"
          v-model="email"
          type="email"
          autocomplete="email"
          inputmode="email"
          placeholder="you@example.com"
          :aria-invalid="Boolean(fieldErrors.email)"
          :aria-describedby="fieldErrors.email ? 'register-email-error' : undefined"
        />
        <p v-if="fieldErrors.email" id="register-email-error" class="text-xs text-destructive">
          {{ fieldErrors.email }}
        </p>
      </div>

      <div v-if="inviteRequired" class="flex flex-col gap-1.5">
        <Label for="register-invite" class="gap-1.5">
          Invitation code
          <InfoHint
            title="Invitation code"
            wide
            text="This instance does not take open sign-ups. An administrator generates a code and sends it to you; the server checks it before it will create anything. Codes are usually tied to one address and expire, so ask for a fresh one rather than reusing an old email."
          />
        </Label>
        <Input
          id="register-invite"
          v-model="inviteToken"
          autocomplete="off"
          spellcheck="false"
          class="font-mono text-sm"
          placeholder="INV-XXXX-XXXX"
          :aria-invalid="Boolean(fieldErrors.inviteToken)"
          :aria-describedby="
            fieldErrors.inviteToken ? 'register-invite-error' : 'register-invite-help'
          "
        />
        <p id="register-invite-help" class="text-[11px] leading-relaxed text-muted-foreground">
          An administrator issues this. Without one, registration is refused.
        </p>
        <p v-if="fieldErrors.inviteToken" id="register-invite-error" class="text-xs text-destructive">
          {{ fieldErrors.inviteToken }}
        </p>
      </div>

      <div class="flex flex-col gap-1.5">
        <Label for="register-password" class="gap-1.5">
          Password
          <InfoHint
            title="What the meter measures"
            wide
:text="`Length first, character classes second, and a check against the passwords every cracking list starts with. That order matches how guessing actually works: a 16-character phrase of ordinary words survives far longer than an eight-character one with a symbol bolted on. The minimum on this instance is ${session.minPasswordLength} characters, and pasting from a password manager is never blocked.`"
          />
        </Label>
        <div class="relative">
          <Input
            id="register-password"
            v-model="password"
            :type="revealed ? 'text' : 'password'"
            autocomplete="new-password"
            class="pr-10"
            :aria-invalid="Boolean(fieldErrors.password)"
            :aria-describedby="
              fieldErrors.password
                ? 'register-password-error register-password-meter'
                : 'register-password-meter'
            "
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            class="absolute top-1/2 right-0.5 -translate-y-1/2 text-muted-foreground"
            :aria-label="revealed ? 'Hide password' : 'Show password'"
            :aria-pressed="revealed"
            @click="revealed = !revealed"
          >
            <EyeOff v-if="revealed" />
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
          id="register-password-meter"
          role="status"
          class="text-[11px] leading-relaxed text-muted-foreground"
        >
          {{ strength.advice }}
        </p>
        <p
          v-if="fieldErrors.password"
          id="register-password-error"
          role="alert"
          class="text-xs text-destructive"
        >
          {{ fieldErrors.password }}
        </p>
      </div>

      <HCaptchaField ref="captcha" v-model="captchaToken" />

      <p
        v-if="formError"
        class="flex items-start gap-2 rounded-md border border-destructive/40 px-3 py-2 text-xs leading-relaxed text-destructive"
        role="alert"
      >
        <CircleAlert class="mt-px size-3.5 shrink-0" />
        <span>{{ formError }}</span>
      </p>

      <Button type="submit" :disabled="blocked">
        <LoaderCircle v-if="submitting" class="animate-spin" />
        <UserRoundPlus v-else />
        Create account
      </Button>
    </form>

    <template #footer>
      <p class="text-center text-sm text-muted-foreground">
        Already have an account?
        <RouterLink
          :to="{ name: 'login' }"
          class="rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          Sign in
        </RouterLink>
      </p>
    </template>

    <template v-if="session.ready && !session.canRegister" #aside>
      Registration is currently closed on this instance. A code will not be accepted until an
      administrator reopens it.
    </template>
  </AuthShell>
</template>
