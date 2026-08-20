<script setup lang="ts">
/**
 * Sign in.
 *
 * The captcha is hidden until the server asks for it. Putting one in front of
 * every first attempt taxes everyone for the behaviour of a few, so the backend
 * flags an address only once it has seen enough failures and this page reveals
 * the widget on that signal. Rate limits are shown as a live countdown rather
 * than a bare 429: "try again later" without a number is what makes people mash
 * the button.
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { CircleAlert, Eye, EyeOff, LoaderCircle, LogIn } from '@lucide/vue'
import { toast } from 'vue-sonner'
import AuthShell from '@/components/auth/AuthShell.vue'
import HCaptchaField from '@/components/auth/HCaptchaField.vue'
import InfoHint from '@/components/common/InfoHint.vue'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError } from '@/lib/api'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const route = useRoute()
const router = useRouter()

const email = ref('')
const password = ref('')
const remember = ref(true)
const revealed = ref(false)

const captchaToken = ref('')
const captchaRequired = ref(false)
const captcha = ref<InstanceType<typeof HCaptchaField> | null>(null)

const submitting = ref(false)
const formError = ref('')
const fieldErrors = ref<Record<string, string>>({})

const cooldown = ref(0)
let cooldownTimer: number | undefined

function startCooldown(seconds: number) {
  cooldown.value = Math.max(1, Math.ceil(seconds))
  window.clearInterval(cooldownTimer)
  cooldownTimer = window.setInterval(() => {
    cooldown.value -= 1
    if (cooldown.value <= 0) window.clearInterval(cooldownTimer)
  }, 1000)
}

onBeforeUnmount(() => window.clearInterval(cooldownTimer))

const backendMissing = computed(() => session.ready && !session.meta?.installed)

const blocked = computed(
  () => submitting.value || cooldown.value > 0 || !email.value.trim() || !password.value,
)

function failed(error: unknown) {
  // Every attempt spends the captcha answer, so the widget resets before the
  // message appears. Re-sending a used token fails exactly like sending none.
  captchaToken.value = ''
  captcha.value?.reset()

  if (!(error instanceof ApiError)) {
    formError.value = 'Could not reach the server. Check your connection and try again.'
    return
  }
  if (error.isRateLimited) {
    startCooldown(error.problem.retryAfter ?? 60)
    formError.value = 'Too many attempts from this address.'
    return
  }
  if (error.needsCaptcha) {
    captchaRequired.value = true
    formError.value = 'Solve the check below, then sign in again.'
    return
  }
  if (error.isValidation && error.problem.errors) {
    fieldErrors.value = error.problem.errors
    if (!Object.keys(error.problem.errors).length) formError.value = error.message
    return
  }
  formError.value = error.message
}

async function submit() {
  if (blocked.value) return
  submitting.value = true
  formError.value = ''
  fieldErrors.value = {}
  try {
    await session.login({
      email: email.value.trim(),
      password: password.value,
      captchaToken: captchaRequired.value ? captchaToken.value : undefined,
      remember: remember.value,
    })
    toast.success('Signed in')
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : ''
    await router.replace(redirect || { name: 'studio' })
  } catch (error) {
    failed(error)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AuthShell
    title="Sign in"
    subtitle="Signing in stores your palettes on the server. The generator itself works without an account."
  >
    <div
      v-if="backendMissing"
      class="rounded-lg border border-dashed px-3 py-2.5 text-xs leading-relaxed text-muted-foreground"
    >
      This copy of DevColorz has no backend reachable, so accounts are unavailable. Everything in
      the generator, theme editor and export still works — palettes live in the URL.
    </div>

    <form class="flex flex-col gap-4" novalidate @submit.prevent="submit">
      <div class="flex flex-col gap-1.5">
        <Label for="login-email">Email</Label>
        <Input
          id="login-email"
          v-model="email"
          type="email"
          autocomplete="username"
          inputmode="email"
          placeholder="you@example.com"
          :aria-invalid="Boolean(fieldErrors.email)"
          :aria-describedby="fieldErrors.email ? 'login-email-error' : undefined"
        />
        <p v-if="fieldErrors.email" id="login-email-error" class="text-xs text-destructive">
          {{ fieldErrors.email }}
        </p>
      </div>

      <div class="flex flex-col gap-1.5">
        <div class="flex items-baseline justify-between gap-2">
          <Label for="login-password">Password</Label>
          <RouterLink
            :to="{ name: 'forgot' }"
            class="rounded-sm text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            Forgot it?
          </RouterLink>
        </div>
        <div class="relative">
          <Input
            id="login-password"
            v-model="password"
            :type="revealed ? 'text' : 'password'"
            autocomplete="current-password"
            class="pr-10"
            :aria-invalid="Boolean(fieldErrors.password)"
            :aria-describedby="fieldErrors.password ? 'login-password-error' : undefined"
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
        <p v-if="fieldErrors.password" id="login-password-error" class="text-xs text-destructive">
          {{ fieldErrors.password }}
        </p>
      </div>

      <div class="flex items-center gap-2">
        <Checkbox id="login-remember" v-model="remember" />
        <Label for="login-remember" class="text-sm font-normal">Keep me signed in</Label>
        <InfoHint
          title="Keep me signed in"
          wide
          text="On, the session cookie survives closing the browser for 30 days. Off, it disappears when the browser does. The cookie is the only credential this app holds — nothing is written to local storage — so leaving this on is the difference between one shared machine and one stolen laptop having access to your palettes."
        />
      </div>

      <HCaptchaField v-if="captchaRequired" ref="captcha" v-model="captchaToken" />

      <p
        v-if="formError"
        class="flex items-start gap-2 rounded-md border border-destructive/40 px-3 py-2 text-xs leading-relaxed text-destructive"
        role="alert"
      >
        <CircleAlert class="mt-px size-3.5 shrink-0" />
        <span>
          {{ formError }}
          <template v-if="cooldown > 0"> Try again in {{ cooldown }}s.</template>
        </span>
      </p>

      <Button type="submit" :disabled="blocked">
        <LoaderCircle v-if="submitting" class="animate-spin" />
        <LogIn v-else />
        <template v-if="cooldown > 0">Wait {{ cooldown }}s</template>
        <template v-else>Sign in</template>
      </Button>
    </form>

    <template #footer>
      <p v-if="session.canRegister" class="text-center text-sm text-muted-foreground">
        No account yet?
        <RouterLink
          :to="{ name: 'register' }"
          class="rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          Create one
        </RouterLink>
      </p>
      <p v-else class="text-center text-xs leading-relaxed text-muted-foreground">
        Registration is closed on this instance. An administrator can issue you an invitation code.
      </p>
    </template>
  </AuthShell>
</template>
