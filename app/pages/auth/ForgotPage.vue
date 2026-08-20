<script setup lang="ts">
/**
 * Request a password reset link.
 *
 * The server answers 204 whether or not the address exists, and this page says
 * the same thing either way. That is the point: a form that reports "no such
 * account" is a free membership oracle for anyone with a list of addresses. The
 * copy explains the trade-off rather than leaving people wondering whether the
 * mail was actually sent.
 */
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { CircleAlert, LoaderCircle, MailCheck, Send } from '@lucide/vue'
import AuthShell from '@/components/auth/AuthShell.vue'
import HCaptchaField from '@/components/auth/HCaptchaField.vue'
import InfoHint from '@/components/common/InfoHint.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError, api } from '@/lib/api'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()

const email = ref('')
const captchaToken = ref('')
const captcha = ref<InstanceType<typeof HCaptchaField> | null>(null)

const submitting = ref(false)
const sent = ref(false)
const formError = ref('')
const fieldErrors = ref<Record<string, string>>({})

const captchaPending = computed(() => Boolean(session.captchaSitekey) && !captchaToken.value)
const blocked = computed(() => submitting.value || !email.value.trim() || captchaPending.value)

async function submit() {
  if (blocked.value) return
  submitting.value = true
  formError.value = ''
  fieldErrors.value = {}
  try {
    await api.post('/auth/forgot', {
      email: email.value.trim(),
      captchaToken: captchaToken.value,
    })
    sent.value = true
  } catch (error) {
    // A rejected attempt spends the captcha answer, so ask for a fresh one.
    captchaToken.value = ''
    captcha.value?.reset()

    if (!(error instanceof ApiError)) {
      formError.value = 'Could not reach the server. Check your connection and try again.'
    } else if (error.isRateLimited) {
      const wait = Math.ceil((error.problem.retryAfter ?? 60) / 60)
      formError.value = `Too many requests for this address. Try again in about ${wait} minute(s).`
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
    v-if="sent"
    title="Check your email"
    subtitle="If that address has an account, a reset link is on its way."
  >
    <p class="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
      <MailCheck class="mt-0.5 size-4 shrink-0 text-primary" />
      <span>
        The link is good for one hour and can be used once. Nothing about the account has changed
        yet — the old password keeps working until a new one is set.
      </span>
    </p>
    <p class="text-xs leading-relaxed text-muted-foreground">
      No mail after a few minutes usually means the address has no account here, or it went to the
      spam folder. This page says the same thing either way on purpose.
    </p>
    <template #footer>
      <Button as-child variant="outline">
        <RouterLink :to="{ name: 'login' }">Back to sign in</RouterLink>
      </Button>
    </template>
  </AuthShell>

  <AuthShell
    v-else
    title="Reset your password"
    subtitle="Give us the address on the account and we will send a link that sets a new password."
  >
    <form class="flex flex-col gap-4" novalidate @submit.prevent="submit">
      <div class="flex flex-col gap-1.5">
        <Label for="forgot-email" class="gap-1.5">
          Email
          <InfoHint
            title="Why the answer is always the same"
            wide
            text="This form reports success whether or not the address has an account. Telling you that an address is unknown would also tell anyone with a list of addresses which of them are members here, which is exactly the reconnaissance step before a credential-stuffing run. The cost is that a typo looks identical to a hit, so check the spelling before you assume the mail was lost."
          />
        </Label>
        <Input
          id="forgot-email"
          v-model="email"
          type="email"
          autocomplete="email"
          inputmode="email"
          placeholder="you@example.com"
          :aria-invalid="Boolean(fieldErrors.email)"
          :aria-describedby="fieldErrors.email ? 'forgot-email-error' : undefined"
        />
        <p v-if="fieldErrors.email" id="forgot-email-error" class="text-xs text-destructive">
          {{ fieldErrors.email }}
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
        <Send v-else />
        Send the link
      </Button>
    </form>

    <template #footer>
      <p class="text-center text-sm text-muted-foreground">
        Remembered it?
        <RouterLink
          :to="{ name: 'login' }"
          class="rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          Sign in
        </RouterLink>
      </p>
    </template>
  </AuthShell>
</template>
