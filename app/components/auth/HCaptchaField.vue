<script setup lang="ts">
/**
 * The hCaptcha widget.
 *
 * `api.js` installs a single global and throws if it is evaluated twice, and
 * several pages here can mount a widget in one session, so the script load is
 * held in a module-level promise and shared by every instance. The promise is
 * cleared on failure so a later attempt can retry rather than inheriting a
 * permanently rejected load.
 *
 * With no sitekey configured the component renders nothing and reports an empty
 * token. That is the normal state on installs that never turned captcha on, and
 * it keeps every form submittable instead of blocking on a widget that will
 * never appear.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useSessionStore } from '@/stores/session'
import { useThemeStore } from '@/stores/theme'

interface HCaptchaApi {
  render(container: HTMLElement, options: Record<string, unknown>): string
  reset(widgetId?: string): void
  remove(widgetId: string): void
}

type CaptchaWindow = Window & {
  hcaptcha?: HCaptchaApi
  devcolorzHcaptchaReady?: () => void
}

const SCRIPT_SRC = 'https://js.hcaptcha.com/1/api.js?render=explicit&onload=devcolorzHcaptchaReady'

let loader: Promise<HCaptchaApi> | null = null

function loadHCaptcha(): Promise<HCaptchaApi> {
  if (loader) return loader
  const win = window as CaptchaWindow
  loader = new Promise<HCaptchaApi>((resolve, reject) => {
    if (win.hcaptcha) {
      resolve(win.hcaptcha)
      return
    }
    win.devcolorzHcaptchaReady = () => {
      if (win.hcaptcha) resolve(win.hcaptcha)
      else reject(new Error('hCaptcha loaded without an API'))
    }
    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.defer = true
    script.onerror = () => reject(new Error('The captcha script could not be loaded'))
    document.head.appendChild(script)
  }).catch((error: unknown) => {
    loader = null
    throw error
  })
  return loader
}

const props = withDefaults(
  defineProps<{
    /** The solved token. Empty until the user passes the check. */
    modelValue: string
    size?: 'normal' | 'compact'
  }>(),
  { size: 'normal' },
)

const emit = defineEmits<{
  'update:modelValue': [token: string]
  /** Raised once when the widget cannot be shown at all. */
  unavailable: [reason: string]
}>()

const session = useSessionStore()
const theme = useThemeStore()

const host = ref<HTMLDivElement | null>(null)
const widgetId = ref<string | null>(null)
const failure = ref('')

const sitekey = computed(() => session.captchaSitekey)

async function mountWidget() {
  if (!sitekey.value || !host.value || widgetId.value) return
  try {
    const hcaptcha = await loadHCaptcha()
    // The await gives the component time to unmount underneath us.
    if (!host.value || widgetId.value) return
    widgetId.value = hcaptcha.render(host.value, {
      sitekey: sitekey.value,
      size: props.size,
      theme: theme.mode,
      callback: (token: string) => emit('update:modelValue', token),
      'expired-callback': () => emit('update:modelValue', ''),
      'chalexpired-callback': () => emit('update:modelValue', ''),
      'error-callback': () => {
        emit('update:modelValue', '')
        failure.value = 'The check failed to run. Try it again.'
      },
    })
    failure.value = ''
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'The captcha could not be loaded'
    failure.value = reason
    emit('unavailable', reason)
  }
}

/**
 * Throw away the current answer and ask for a fresh one. Tokens are single-use
 * and live about two minutes, so every failed submit has to go through here —
 * resending a spent token fails identically to sending none.
 */
function reset() {
  emit('update:modelValue', '')
  const hcaptcha = (window as CaptchaWindow).hcaptcha
  if (widgetId.value && hcaptcha) hcaptcha.reset(widgetId.value)
}

defineExpose({ reset })

onMounted(() => {
  // Report an empty token straight away where captcha is off, so a form that
  // gates its submit button on this field is not stuck waiting forever.
  if (!sitekey.value) emit('update:modelValue', '')
  else void mountWidget()
})

// `/meta` may land after this component does; mount as soon as the key exists.
watch(sitekey, (key) => {
  if (key) void mountWidget()
  else emit('update:modelValue', '')
})

onBeforeUnmount(() => {
  const hcaptcha = (window as CaptchaWindow).hcaptcha
  if (widgetId.value && hcaptcha) hcaptcha.remove(widgetId.value)
  widgetId.value = null
})
</script>

<template>
  <div v-if="sitekey" class="flex flex-col gap-1.5">
    <div ref="host" class="min-h-[78px]" />
    <p v-if="failure" class="text-xs leading-relaxed text-destructive">{{ failure }}</p>
    <p class="text-[11px] leading-relaxed text-muted-foreground">
      One check covers one submission and expires after about two minutes. If the form comes back
      with an error, solve it again — the previous answer is already spent.
    </p>
  </div>
</template>
