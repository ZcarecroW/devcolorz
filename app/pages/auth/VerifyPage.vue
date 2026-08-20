<script setup lang="ts">
/**
 * Confirm an email address.
 *
 * The page verifies automatically when it arrives with a token in the URL, but
 * it also keeps a manual field. Mail clients wrap, truncate and rewrite long
 * links often enough that "paste the code from the email" is a real recovery
 * path rather than a defensive nicety.
 */
import { onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { CircleAlert, CircleCheck, LoaderCircle, MailCheck } from '@lucide/vue'
import AuthShell from '@/components/auth/AuthShell.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError, api, type UserResponse } from '@/lib/api'
import { useSessionStore } from '@/stores/session'

type Phase = 'asking' | 'working' | 'done' | 'failed'

const session = useSessionStore()
const route = useRoute()

const token = ref(typeof route.query.token === 'string' ? route.query.token : '')
const phase = ref<Phase>('asking')
const failure = ref('')
const verifiedEmail = ref('')

async function verify() {
  const value = token.value.trim()
  if (!value || phase.value === 'working') return
  phase.value = 'working'
  failure.value = ''
  try {
    const result = await api.post<{ user: UserResponse }>('/auth/verify', { token: value })
    verifiedEmail.value = result.user?.email ?? ''
    // The server may have opened a session as part of confirming; ask rather
    // than assume, so the header and the guards agree with each other.
    await session.refresh()
    phase.value = 'done'
  } catch (error) {
    phase.value = 'failed'
    if (!(error instanceof ApiError)) {
      failure.value = 'Could not reach the server. Check your connection and try again.'
    } else if (error.status === 404 || error.status === 410 || error.isValidation) {
      failure.value =
        'That link is no longer valid. Confirmation links expire after 24 hours and can only be used once.'
    } else {
      failure.value = error.message
    }
  }
}

onMounted(() => {
  if (token.value) void verify()
})
</script>

<template>
  <AuthShell
    title="Confirm your email"
    :subtitle="
      phase === 'done'
        ? 'The address is confirmed and the account is active.'
        : 'Confirming proves the address reaches you, which is what makes password recovery possible later.'
    "
  >
    <div v-if="phase === 'working'" class="flex items-center gap-2 text-sm text-muted-foreground">
      <LoaderCircle class="size-4 animate-spin" />
      Checking the link
    </div>

    <p
      v-else-if="phase === 'done'"
      class="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground"
    >
      <CircleCheck class="mt-0.5 size-4 shrink-0 text-primary" />
      <span>
        <template v-if="verifiedEmail">
          <strong class="text-foreground">{{ verifiedEmail }}</strong> is confirmed.
        </template>
        <template v-else>Your address is confirmed.</template>
        {{
          session.isAuthenticated
            ? 'You are signed in and everything is available.'
            : 'Sign in and everything is available.'
        }}
      </span>
    </p>

    <template v-else>
      <p
        v-if="failure"
        class="flex items-start gap-2 rounded-md border border-destructive/40 px-3 py-2 text-xs leading-relaxed text-destructive"
        role="alert"
      >
        <CircleAlert class="mt-px size-3.5 shrink-0" />
        <span>{{ failure }}</span>
      </p>

      <form class="flex flex-col gap-3" novalidate @submit.prevent="verify">
        <div class="flex flex-col gap-1.5">
          <Label for="verify-token">Confirmation code</Label>
          <Input
            id="verify-token"
            v-model="token"
            autocomplete="one-time-code"
            spellcheck="false"
            class="font-mono text-sm"
            placeholder="Paste the code from the email"
            aria-describedby="verify-token-help"
          />
          <p id="verify-token-help" class="text-[11px] leading-relaxed text-muted-foreground">
            Normally the link in the email fills this in. Paste it by hand if your mail client
            broke the link across two lines.
          </p>
        </div>
        <Button type="submit" :disabled="!token.trim()">
          <MailCheck />
          Confirm
        </Button>
      </form>
    </template>

    <template #footer>
      <Button v-if="phase === 'done'" as-child>
        <RouterLink :to="session.isAuthenticated ? { name: 'studio' } : { name: 'login' }">
          {{ session.isAuthenticated ? 'Open the generator' : 'Sign in' }}
        </RouterLink>
      </Button>
      <Button v-else as-child variant="outline">
        <RouterLink :to="{ name: 'login' }">Back to sign in</RouterLink>
      </Button>
    </template>
  </AuthShell>
</template>
