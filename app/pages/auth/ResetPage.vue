<script setup lang="ts">
/**
 * Set a new password from a reset link.
 *
 * The token arrives in the URL and stays there rather than being copied into a
 * field: it is single-use and short-lived, so the cheapest correct behaviour is
 * to spend it immediately and tell the user plainly when it has expired. Every
 * other outcome sends them back to the request form rather than leaving them on
 * a dead page.
 */
import { computed, ref } from 'vue'
import { scorePassword } from '@/lib/auth/password'
import { RouterLink, useRoute } from 'vue-router'
import { CircleAlert, CircleCheck, Eye, EyeOff, KeyRound, LoaderCircle } from '@lucide/vue'
import AuthShell from '@/components/auth/AuthShell.vue'
import InfoHint from '@/components/common/InfoHint.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError, api } from '@/lib/api'

  'password passw0rd password1 letmein welcome qwerty qwertyuiop azerty 123456 1234567 12345678 123456789 1234567890 111111 000000 abc123 monkey dragon sunshine princess football baseball iloveyou admin administrator root login master shadow superman batman starwars trustno1 whatever freedom hunter ninja passwort'.split(
    ' ',
  )

const route = useRoute()

const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))
const password = ref('')
const revealed = ref(false)

const submitting = ref(false)
const done = ref(false)
const formError = ref('')
const fieldErrors = ref<Record<string, string>>({})

const strength = computed(() => scorePassword(password.value))

const meterClass = computed(() => {
  if (strength.value.score <= 1) return 'bg-destructive'
  if (strength.value.score === 2) return 'bg-muted-foreground'
  if (strength.value.score === 3) return 'bg-primary/60'
  return 'bg-primary'
})

const blocked = computed(() => submitting.value || !token.value || !strength.value.acceptable)

async function submit() {
  if (blocked.value) return
  submitting.value = true
  formError.value = ''
  fieldErrors.value = {}
  try {
    await api.post('/auth/reset', { token: token.value, password: password.value })
    done.value = true
  } catch (error) {
    if (!(error instanceof ApiError)) {
      formError.value = 'Could not reach the server. Check your connection and try again.'
    } else if (error.status === 404 || error.status === 410) {
      formError.value =
        'That link has expired or has already been used. Request a new one and try again.'
    } else if (error.isRateLimited) {
      const wait = Math.ceil((error.problem.retryAfter ?? 60) / 60)
      formError.value = `Too many attempts. Try again in about ${wait} minute(s).`
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
    v-if="done"
    title="Password changed"
    subtitle="The new password is live and the reset link is now dead."
  >
    <p class="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
      <CircleCheck class="mt-0.5 size-4 shrink-0 text-primary" />
      <span>
        Sessions on other devices were signed out as part of the change, which is the point of a
        reset: if someone else had the old password, they no longer have anything.
      </span>
    </p>
    <template #footer>
      <Button as-child>
        <RouterLink :to="{ name: 'login' }">Sign in</RouterLink>
      </Button>
    </template>
  </AuthShell>

  <AuthShell
    v-else-if="!token"
    title="This link is incomplete"
    subtitle="The reset code is missing from the address."
  >
    <p class="text-sm leading-relaxed text-muted-foreground">
      Mail clients sometimes break long links across two lines, which drops the code. Open the link
      from the email again, or ask for a fresh one — the old link may already have expired anyway.
    </p>
    <template #footer>
      <Button as-child>
        <RouterLink :to="{ name: 'forgot' }">Request a new link</RouterLink>
      </Button>
    </template>
  </AuthShell>

  <AuthShell
    v-else
    title="Choose a new password"
    subtitle="This link works once. After the change you will need to sign in again everywhere."
  >
    <form class="flex flex-col gap-4" novalidate @submit.prevent="submit">
      <div class="flex flex-col gap-1.5">
        <Label for="reset-password" class="gap-1.5">
          New password
          <InfoHint
            title="What the meter measures"
            wide
            text="Length first, character classes second, and a check against the passwords every cracking list starts with. That order matches how guessing actually works: a 16-character phrase of ordinary words survives far longer than an eight-character one with a symbol bolted on. The minimum is 12 characters, and pasting from a password manager is never blocked."
          />
        </Label>
        <div class="relative">
          <Input
            id="reset-password"
            v-model="password"
            :type="revealed ? 'text' : 'password'"
            autocomplete="new-password"
            class="pr-10"
            :aria-invalid="Boolean(fieldErrors.password)"
            aria-describedby="reset-password-meter"
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
          id="reset-password-meter"
          role="status"
          class="text-[11px] leading-relaxed text-muted-foreground"
        >
          {{ strength.advice }}
        </p>
        <p v-if="fieldErrors.password" class="text-xs text-destructive">{{ fieldErrors.password }}</p>
      </div>

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
        <KeyRound v-else />
        Set the new password
      </Button>
    </form>

    <template #footer>
      <p class="text-center text-sm text-muted-foreground">
        Link stopped working?
        <RouterLink
          :to="{ name: 'forgot' }"
          class="rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          Request a new one
        </RouterLink>
      </p>
    </template>
  </AuthShell>
</template>
