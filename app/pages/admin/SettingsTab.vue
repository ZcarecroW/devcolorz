<script setup lang="ts">
/**
 * Every admin-editable setting, grouped.
 *
 * The fields are described as data rather than written out as markup: there are
 * forty-odd of them and the interesting content is the explanation attached to
 * each one, not the input element. Nothing saves as you type — settings change
 * how the whole install behaves, so the tab collects edits and writes only the
 * keys you actually touched when you press Save.
 */
import { computed, onMounted, ref } from 'vue'
import type { Component } from 'vue'
import {
  Braces,
  Clock,
  Copy,
  Download,
  FileText,
  Globe,
  Mail,
  RotateCw,
  Save,
  ShieldCheck,
  Timer,
  TriangleAlert,
  Undo2,
  Users,
} from '@lucide/vue'
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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ApiError, api } from '@/lib/api'
import { useSessionStore } from '@/stores/session'
import { FORMAT_LABELS } from '@/lib/color/convert'
import { GAMUT_STRATEGY_LABELS } from '@/lib/color/gamut'
import { INVERT_LABELS } from '@/lib/color/invert'
import type { ColorFormat, GamutStrategy } from '@/lib/color/types'
import type { InvertStrategy } from '@/lib/color/invert'

type FieldKind = 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'secret' | 'token' | 'bucket'

interface SelectOption {
  value: string
  label: string
}

interface Field {
  key: string
  label: string
  kind: FieldKind
  hintTitle: string
  hint: string
  options?: SelectOption[]
  min?: number
  max?: number
  suffix?: string
  placeholder?: string
  /** Which rotate endpoint replaces this value, for `token` fields. */
  rotate?: 'invite' | 'cron'
  /** A line printed under the control, for things a tooltip should not hide. */
  legend?: string
}

interface Group {
  id: string
  label: string
  blurb: string
  icon: Component
  fields: Field[]
}

const APPEARANCE_OPTIONS: SelectOption[] = [
  { value: 'system', label: 'Follow the system' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

const MODERATION_OPTIONS: SelectOption[] = [
  { value: 'open', label: 'Open — anyone can publish' },
  { value: 'review', label: 'Review — an admin approves' },
]

const METRIC_OPTIONS: SelectOption[] = [
  { value: 'wcag', label: 'WCAG 2 contrast ratio' },
  { value: 'apca', label: 'APCA Lc' },
]

const FORMAT_OPTIONS: SelectOption[] = (Object.keys(FORMAT_LABELS) as ColorFormat[]).map((id) => ({
  value: id,
  label: FORMAT_LABELS[id],
}))

const GAMUT_OPTIONS: SelectOption[] = (Object.keys(GAMUT_STRATEGY_LABELS) as GamutStrategy[]).map(
  (id) => ({ value: id, label: GAMUT_STRATEGY_LABELS[id] }),
)

const DARK_OPTIONS: SelectOption[] = (Object.keys(INVERT_LABELS) as InvertStrategy[]).map((id) => ({
  value: id,
  label: INVERT_LABELS[id],
}))

const SUBJECT_LEGEND =
  'Placeholders: none. The line is sent exactly as written, so spell the site name out rather than expecting a token to expand.'

const GROUPS: Group[] = [
  {
    id: 'site',
    label: 'Site',
    blurb: 'Identity, the address links are built from, and the switch that closes the doors.',
    icon: Globe,
    fields: [
      {
        key: 'site.name',
        label: 'Site name',
        kind: 'text',
        hintTitle: 'Site name',
        hint: 'Shown in the header, in page titles and inside the mail this install sends. It is cosmetic — renaming changes no URL and no stored data — but it is also what people look for in a crowded inbox.',
      },
      {
        key: 'site.baseUrl',
        label: 'Base URL',
        kind: 'text',
        placeholder: 'https://colors.example.com',
        hintTitle: 'Base URL',
        hint: 'The absolute address this install answers on, used to build the links inside verification and reset emails. Leave it empty to infer it from the incoming request, which is right until a proxy rewrites the host and the links start pointing somewhere nobody can reach. Include the scheme, no trailing slash.',
      },
      {
        key: 'site.defaultAppearance',
        label: 'Default appearance',
        kind: 'select',
        options: APPEARANCE_OPTIONS,
        hintTitle: 'First impression',
        hint: 'What a first-time visitor sees before choosing for themselves. Following the system is the least surprising option, because it honors a preference they already expressed at the operating system. Forcing light or dark overrides that choice for everyone who has not yet made one here.',
      },
      {
        key: 'site.maintenance',
        label: 'Maintenance mode',
        kind: 'switch',
        hintTitle: 'Maintenance mode',
        hint: 'Closes the site to everyone except administrators, who keep full access so you can verify a fix from the same browser. Writes are refused while it is on, so anything a user has open loses its next save. Announce it before you flip it.',
      },
      {
        key: 'site.maintenanceMessage',
        label: 'Maintenance message',
        kind: 'textarea',
        hintTitle: 'What visitors read',
        hint: 'The text on the maintenance screen. Say when you expect to be back — without an estimate people reload every thirty seconds, which is both futile and load you did not need.',
      },
      {
        key: 'site.allowAnonymous',
        label: 'Anonymous use',
        kind: 'switch',
        hintTitle: 'Use without an account',
        hint: 'Lets people generate, theme and export without signing up. Turning it off puts a sign-in wall in front of the whole tool. Palettes never leave the browser either way, so this decides who may use the site rather than what is protected.',
      },
      {
        key: 'site.publicExplore',
        label: 'Public gallery',
        kind: 'switch',
        hintTitle: 'Explore page',
        hint: 'Publishes the gallery of shared palettes. With it off, public palettes stay reachable by direct link but nothing lists or indexes them — the usual setting for an install that is really a private workspace.',
      },
    ],
  },
  {
    id: 'auth',
    label: 'Accounts',
    blurb: 'Who may register, how long they stay signed in, and what a password has to be.',
    icon: Users,
    fields: [
      {
        key: 'auth.registrationOpen',
        label: 'Registration open',
        kind: 'switch',
        hintTitle: 'New accounts',
        hint: 'The master switch. With it off the register page refuses everyone, including anyone holding a valid invite token; existing accounts are untouched. Use this rather than the invite requirement when you want the door shut rather than narrowed.',
      },
      {
        key: 'auth.inviteRequired',
        label: 'Invite required',
        kind: 'switch',
        hintTitle: 'Invite token',
        hint: 'Registration additionally demands the token below. It costs nothing to run and it stops the drive-by sign-up bots that find any open registration form within days. The token travels in the link, so anyone you invite can pass it on to anyone else.',
      },
      {
        key: 'auth.inviteToken',
        label: 'Invite token',
        kind: 'token',
        rotate: 'invite',
        hintTitle: 'Rotating the invite',
        hint: 'The shared secret that unlocks registration when invites are required. The server never hands it back in full, so the moment you rotate is the only time you can copy it. Rotating invalidates every invite link already in circulation, including the ones you sent five minutes ago.',
      },
      {
        key: 'auth.requireEmailVerification',
        label: 'Verify email addresses',
        kind: 'switch',
        hintTitle: 'Email verification',
        hint: 'New accounts stay pending, unable to sign in, until they follow the link in the confirmation mail. It is the only thing standing between you and accounts on addresses their owners do not control. If outgoing mail is broken it locks out every new user, so check that the outbox drains before you turn it on.',
      },
      {
        key: 'auth.minPasswordLength',
        label: 'Minimum password length',
        kind: 'number',
        min: 8,
        max: 128,
        suffix: 'characters',
        hintTitle: 'Length over composition',
        hint: 'The floor for new and changed passwords. Length beats character-class rules by a wide margin, which is why there is no "must contain a symbol" setting anywhere in here. Twelve is the current sensible minimum; below eight is worse than useless.',
      },
      {
        key: 'auth.sessionIdleMinutes',
        label: 'Idle timeout',
        kind: 'number',
        min: 5,
        max: 525600,
        suffix: 'minutes',
        hintTitle: 'Idle expiry',
        hint: 'How long a session survives with no requests before it expires. Long values are convenient and leave an abandoned browser signed in; short ones interrupt people mid-task and train them to pick worse passwords because they type them so often. The default of thirty days suits a tool people return to weekly.',
      },
      {
        key: 'auth.sessionAbsoluteHours',
        label: 'Absolute session limit',
        kind: 'number',
        min: 1,
        max: 8760,
        suffix: 'hours',
        hintTitle: 'Hard ceiling',
        hint: 'The maximum life of a session regardless of activity. It bounds the damage from a stolen cookie, because a token that never expires is a permanent key. Keep it comfortably longer than the idle timeout, or the two fight and people are signed out at apparently random moments.',
      },
      {
        key: 'auth.allowAccountDeletion',
        label: 'Self-service deletion',
        kind: 'switch',
        hintTitle: 'Deleting an account',
        hint: 'Lets people delete their own account and everything in it from the account page. Turning it off leaves deletion to you and your inbox. One compliance regime requires the button and another forbids it, so check which one you are in rather than guessing.',
      },
      {
        key: 'auth.emailDomainAllowlist',
        label: 'Email domain allowlist',
        kind: 'text',
        placeholder: 'example.com, team.example.org',
        hintTitle: 'Which domains may register',
        hint: 'Comma-separated domains that may sign up. Empty means any address. It is a coarse filter — anyone who can create an address at an allowed domain gets in — but it is the cheapest way to keep a company install to company addresses.',
      },
    ],
  },
  {
    id: 'ratelimit',
    label: 'Rate limits',
    blurb:
      'Token buckets, one per address. Capacity is how many requests fit; the window is how long the bucket takes to refill.',
    icon: Timer,
    fields: [
      {
        key: 'ratelimit.login',
        label: 'Sign in',
        kind: 'bucket',
        hintTitle: 'Sign-in attempts',
        hint: 'Both failed and successful attempts from one address. Tight enough to make password guessing pointless, loose enough that an office behind one NAT does not lock itself out. A real user with a typo still gets several tries.',
      },
      {
        key: 'ratelimit.register',
        label: 'Register',
        kind: 'bucket',
        hintTitle: 'Sign-up attempts',
        hint: 'This is the one that keeps a bot from creating a thousand pending accounts overnight and burning your host mail quota on confirmation messages nobody asked for.',
      },
      {
        key: 'ratelimit.forgot',
        label: 'Password reset',
        kind: 'bucket',
        hintTitle: 'Reset requests',
        hint: 'Protects mailboxes as much as the server: every request sends real mail to a real person who did not ask for it. Keeping this low is the difference between a nuisance and a harassment tool.',
      },
      {
        key: 'ratelimit.write',
        label: 'Writes',
        kind: 'bucket',
        hintTitle: 'Anything that changes state',
        hint: 'Saving a palette, editing settings, uploading an image. Set it too low and a burst of autosaves gets rejected — nothing here retries, so a refused write is a lost change rather than a delayed one.',
      },
      {
        key: 'ratelimit.read',
        label: 'Reads',
        kind: 'bucket',
        hintTitle: 'Plain GET requests',
        hint: 'Be generous. One page view is many requests and the gallery alone issues a dozen, so a limit tuned for humans-per-minute will trip on a single visitor scrolling.',
      },
      {
        key: 'ratelimit.lockoutThreshold',
        label: 'Lockout threshold',
        kind: 'number',
        min: 1,
        max: 100,
        suffix: 'failures',
        hintTitle: 'Per-account backoff',
        hint: 'Consecutive failed sign-ins before the account itself starts delaying, on top of the per-address bucket. It targets the account rather than the network, so spreading an attack across many addresses does not evade it.',
      },
      {
        key: 'ratelimit.lockoutBaseSeconds',
        label: 'First delay',
        kind: 'number',
        min: 1,
        max: 3600,
        suffix: 'seconds',
        hintTitle: 'Where the doubling starts',
        hint: 'The delay imposed the first time the threshold is passed. It doubles with every further failure, so the number matters less than it looks: two seconds reaches a quarter of an hour after ten more attempts.',
      },
      {
        key: 'ratelimit.lockoutMaxSeconds',
        label: 'Maximum delay',
        kind: 'number',
        min: 5,
        max: 86400,
        suffix: 'seconds',
        hintTitle: 'Where the doubling stops',
        hint: 'The ceiling on that doubling. Without one, an account that was merely attacked becomes unusable for days and the attack has succeeded. Fifteen minutes makes guessing hopeless while a real user waits out one coffee.',
      },
      {
        key: 'ratelimit.captchaThreshold',
        label: 'Captcha after',
        kind: 'number',
        min: 1,
        max: 50,
        suffix: 'failures',
        hintTitle: 'When the challenge appears',
        hint: 'Failures before a form starts demanding a captcha. Showing one to everybody costs conversion and accessibility; showing it only after repeated failures puts it in front of exactly the traffic it is meant to stop.',
      },
    ],
  },
  {
    id: 'captcha',
    label: 'Captcha',
    blurb: 'hCaptcha, applied per form. Nothing here does anything until both keys are filled in.',
    icon: ShieldCheck,
    fields: [
      {
        key: 'captcha.enabled',
        label: 'Enabled',
        kind: 'switch',
        hintTitle: 'Master switch',
        hint: 'Turns hCaptcha on for the forms selected below. It only takes effect once a sitekey and secret are both present, so fill those in first and enable second — the other order leaves a window where every protected form rejects everyone.',
      },
      {
        key: 'captcha.sitekey',
        label: 'Sitekey',
        kind: 'text',
        hintTitle: 'The public half',
        hint: 'Sent to the browser and visible in the page source. It is not a secret; it identifies your site to hCaptcha so the widget knows which configuration to load.',
      },
      {
        key: 'captcha.secret',
        label: 'Secret',
        kind: 'secret',
        hintTitle: 'The private half',
        hint: 'Used server-side to verify a solution. The API returns only a masked form of it, never the value. Leave the mask untouched to keep the current secret; type a new one to replace it.',
      },
      {
        key: 'captcha.onRegister',
        label: 'On registration',
        kind: 'switch',
        hintTitle: 'Sign-up form',
        hint: 'Sign-up is where automated abuse actually arrives, so of the three forms this is the one worth protecting first. The cost is one extra step for every genuine new user.',
      },
      {
        key: 'captcha.onLogin',
        label: 'On sign in',
        kind: 'switch',
        hintTitle: 'Sign-in form',
        hint: 'Adds friction to every single sign-in, which people notice daily. Consider leaving it off and relying on the failure threshold above, which shows the challenge only to sessions that have already failed.',
      },
      {
        key: 'captcha.onForgot',
        label: 'On password reset',
        kind: 'switch',
        hintTitle: 'Reset form',
        hint: 'A reset request sends mail to an address the requester need not own, which makes the form a cheap way to bother someone else. A challenge here is well spent and almost nobody hits it twice.',
      },
      {
        key: 'captcha.failOpen',
        label: 'Fail open',
        kind: 'switch',
        hintTitle: 'When hCaptcha is unreachable',
        hint: 'Fail open lets people through unverified: the site keeps working and the protection is briefly absent. Fail closed refuses the form outright, which is right if you would rather be down than exposed. Pick the failure you would rather explain afterwards.',
      },
      {
        key: 'captcha.timeoutSeconds',
        label: 'Verification timeout',
        kind: 'number',
        min: 1,
        max: 30,
        suffix: 'seconds',
        hintTitle: 'How long to wait',
        hint: 'How long the server waits for hCaptcha before giving up and applying the rule above. Every second here is a second a real user spends watching a spinner on a form they have already filled in.',
      },
    ],
  },
  {
    id: 'mail',
    label: 'Mail',
    blurb: 'Envelope details and the subjects of the two messages this install sends unprompted.',
    icon: Mail,
    fields: [
      {
        key: 'mail.fromName',
        label: 'From name',
        kind: 'text',
        hintTitle: 'Display name',
        hint: 'The name shown as the sender. Recognizable beats formal — people delete mail from senders they do not recognize, and a deleted verification mail becomes a support request.',
      },
      {
        key: 'mail.fromAddress',
        label: 'From address',
        kind: 'text',
        placeholder: 'colors@example.com',
        hintTitle: 'Envelope sender',
        hint: 'Must be an address at a domain this server is authorized to send for, or SPF and DKIM fail and the mail lands in spam regardless of how correct everything else is. When in doubt, use an address at the same domain as the site.',
      },
      {
        key: 'mail.replyTo',
        label: 'Reply-to',
        kind: 'text',
        hintTitle: 'Where replies land',
        hint: 'Leave it empty when the from address is a real mailbox. Fill it in when the from address is a noreply and you would still rather not lose the replies people send anyway.',
      },
      {
        key: 'mail.bounceAddress',
        label: 'Bounce address',
        kind: 'text',
        hintTitle: 'Return path',
        hint: 'Where delivery failures go. Point it at a mailbox somebody reads: bounces are how you discover that verification mail has been failing quietly for a month.',
      },
      {
        key: 'mail.perHourCap',
        label: 'Hourly cap',
        kind: 'number',
        min: 1,
        max: 10000,
        suffix: 'messages',
        hintTitle: 'Self-imposed limit',
        hint: 'A ceiling on outgoing messages per hour. Shared hosts enforce their own and cut you off for the rest of the day when you cross it, so setting this just below the host limit trades a slow queue for a working one.',
      },
      {
        key: 'mail.subjectVerify',
        label: 'Verification subject',
        kind: 'text',
        legend: SUBJECT_LEGEND,
        hintTitle: 'Confirmation mail',
        hint: 'The subject of the message a new account receives. Make it obviously about confirming an address; anything vague reads as phishing and gets reported rather than clicked.',
      },
      {
        key: 'mail.subjectReset',
        label: 'Reset subject',
        kind: 'text',
        legend: SUBJECT_LEGEND,
        hintTitle: 'Password reset mail',
        hint: 'The subject of the password reset message. People search their inbox for this line, so keep the word "password" in it.',
      },
    ],
  },
  {
    id: 'content',
    label: 'Content',
    blurb: 'Limits on what users may store, and whether publishing needs a human first.',
    icon: FileText,
    fields: [
      {
        key: 'content.maxColors',
        label: 'Colors per palette',
        kind: 'number',
        min: 1,
        max: 100,
        suffix: 'colors',
        hintTitle: 'Palette size',
        hint: 'The largest palette anyone may save. The engine handles forty comfortably; the practical limit is the person reading the palette, not the software. Lowering it does not shrink palettes that are already stored.',
      },
      {
        key: 'content.maxPalettesPerUser',
        label: 'Palettes per user',
        kind: 'number',
        min: 0,
        max: 100000,
        suffix: '0 = unlimited',
        hintTitle: 'Storage cap',
        hint: 'How many saved palettes one account may hold, with zero meaning no limit. On a shared install this cap is the only thing between you and one enthusiastic user filling the database.',
      },
      {
        key: 'content.moderation',
        label: 'Publishing',
        kind: 'select',
        options: MODERATION_OPTIONS,
        hintTitle: 'Who may publish',
        hint: 'Open sends a user palette straight to the gallery. Review keeps it unlisted until an administrator makes it public, which means somebody has to actually watch the queue — an unattended review setting is just a publish button that does not work.',
      },
    ],
  },
  {
    id: 'engine',
    label: 'Engine defaults',
    blurb: 'The starting settings handed to a new visitor. Everyone can change them for themselves.',
    icon: Braces,
    fields: [
      {
        key: 'engine.defaultFormat',
        label: 'Color format',
        kind: 'select',
        options: FORMAT_OPTIONS,
        hintTitle: 'Default notation',
        hint: 'What new visitors see first. OKLCH is the recommended output and what current Tailwind and shadcn ship; hex is the safest thing to hand to an older tool. Nobody is stuck with this — it is only the starting point.',
      },
      {
        key: 'engine.defaultGamut',
        label: 'Gamut strategy',
        kind: 'select',
        options: GAMUT_OPTIONS,
        hintTitle: 'Out-of-gamut colors',
        hint: 'How colors that sRGB cannot show are brought back in by default. CSS Color 4 mapping is what browsers do themselves and keeps the most saturation; clipping is faster and visibly shifts both hue and lightness.',
      },
      {
        key: 'engine.defaultContrastMetric',
        label: 'Contrast metric',
        kind: 'select',
        options: METRIC_OPTIONS,
        hintTitle: 'Which measure is shown',
        hint: 'WCAG 2 is what audits and most legislation still require, so you usually have to satisfy it. APCA predicts real readability far better and accounts for polarity and font size, but it is not yet a standard anyone can cite in a report.',
      },
      {
        key: 'engine.defaultDarkStrategy',
        label: 'Dark-mode strategy',
        kind: 'select',
        options: DARK_OPTIONS,
        hintTitle: 'Deriving a dark palette',
        hint: 'The starting algorithm for turning a light palette into a dark one. The OKLCH curve is the safe general answer; the others exist because specific design systems expect specific behavior and will look wrong without it.',
      },
      {
        key: 'engine.defaultSwatchCount',
        label: 'Colors in a new palette',
        kind: 'number',
        min: 1,
        max: 40,
        suffix: 'colors',
        hintTitle: 'Starting count',
        hint: 'How many colors a fresh palette opens with. Five is the convention and fits the strip on a phone; more works fine on a desktop but each column gets thin enough that the hex labels start to crowd.',
      },
    ],
  },
  {
    id: 'updates',
    label: 'Updates',
    blurb: 'Whether this installation watches its own project for new releases, and what it does when it finds one.',
    icon: Download,
    fields: [
      {
        key: 'updates.checkEnabled',
        label: 'Check for updates',
        kind: 'switch',
        hintTitle: 'What is contacted',
        hint: 'Once a day this installation asks the GitHub API which release of DevColorz is newest, and compares it with the version running here. The repository is compiled into the application and cannot be pointed elsewhere from this page. Nothing about this site is sent — it is an ordinary public request for a version number.',
      },
      {
        key: 'updates.checkHour',
        label: 'Check at',
        kind: 'number',
        min: 0,
        max: 23,
        suffix: ':00, server time',
        hintTitle: 'When the check runs',
        hint: 'The hour, on this server’s own clock, after which the day’s check may run. It is the scheduler that actually triggers it, so a host whose cron is not wired up will never check whatever this says. The System tab shows when the last check happened.',
      },
      {
        key: 'updates.autoInstall',
        label: 'Install updates automatically',
        kind: 'switch',
        hintTitle: 'What automatic installation trusts',
        hint: 'With this on, a release found by the daily check is downloaded and unpacked over this installation without asking. config.php and storage/ are never touched, every replaced file is kept so the update can be undone, and an archive that is not DevColorz or does not match the version it claims is refused. What it cannot check is who published the release: GitHub does not sign them, so anyone holding the project owner’s account could publish something this would install. Turn it off if you would rather read the release notes first.',
        legend: 'Updates are applied over the top. Your configuration, database and uploads are left alone.',
      },
    ],
  },
  {
    id: 'cron',
    label: 'Scheduled jobs',
    blurb: 'The token in your scheduler URL, and the switch that makes the call a no-op.',
    icon: Clock,
    fields: [
      {
        key: 'cron.enabled',
        label: 'Jobs enabled',
        kind: 'switch',
        hintTitle: 'Cron switch',
        hint: 'Lets cron.php do work when it is called. Turning it off pauses the queue during maintenance without touching the scheduler: the call still arrives and returns immediately. Leave it off and mail stops going out entirely.',
      },
      {
        key: 'cron.token',
        label: 'Cron token',
        kind: 'token',
        rotate: 'cron',
        hintTitle: 'Rotating the cron token',
        hint: 'The token in the cron URL is the only thing authenticating that call, so anyone holding it can trigger your jobs at will. It is shown in full only at the moment of rotation — copy it into the scheduler then, because the old URL stops working immediately.',
      },
    ],
  },
]

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

const values = ref<Record<string, unknown>>({})
const original = ref<Record<string, unknown>>({})
const loading = ref(true)
const session = useSessionStore()

const saving = ref(false)
const loadError = ref<string | null>(null)
const saveError = ref<string | null>(null)
const fieldErrors = ref<Record<string, string>>({})
const rotating = ref<string | null>(null)
/** A freshly rotated token, shown once because the server will not repeat it. */
const revealed = ref<{ key: string; label: string; value: string } | null>(null)

function describe(error: unknown): string {
  if (error instanceof ApiError) return error.message
  return 'The API did not answer. The backend may be offline or not installed yet.'
}

/**
 * `quiet` refreshes in place after a save. The PATCH response omits the tokens
 * and returns secrets unmasked, so re-reading is the only way to get the form
 * back into the state the server actually intends to show.
 */
async function load(quiet = false) {
  if (!quiet) loading.value = true
  loadError.value = null
  try {
    const data = await api.get<Record<string, unknown>>('/admin/settings')
    values.value = { ...data }
    original.value = { ...data }
  } catch (error) {
    loadError.value = describe(error)
  } finally {
    loading.value = false
  }
}

onMounted(load)

/** Replace the whole object so a nested bucket edit still triggers reactivity. */
function set(key: string, value: unknown) {
  values.value = { ...values.value, [key]: value }
  if (fieldErrors.value[key]) {
    const next = { ...fieldErrors.value }
    delete next[key]
    fieldErrors.value = next
  }
}

const changedKeys = computed(() =>
  Object.keys(values.value).filter(
    (key) => JSON.stringify(values.value[key]) !== JSON.stringify(original.value[key]),
  ),
)

const dirty = computed(() => changedKeys.value.length > 0)

async function save() {
  if (!dirty.value) return
  saving.value = true
  saveError.value = null
  fieldErrors.value = {}
  const payload: Record<string, unknown> = {}
  for (const key of changedKeys.value) payload[key] = values.value[key]
  const count = Object.keys(payload).length
  try {
    await api.patch<Record<string, unknown>>('/admin/settings', payload)
    await load(true)
    // Several of these settings decide what the rest of the app renders —
    // whether sign-up asks for an invitation code, whether the site is open to
    // anonymous visitors. `/meta` is fetched once per session, so without this
    // the console said the setting had been saved and nothing anywhere changed
    // until someone reloaded the page.
    await session.loadMeta()
    toast.success(`Saved ${count} setting${count === 1 ? '' : 's'}`)
  } catch (error) {
    if (error instanceof ApiError && error.problem.errors) {
      fieldErrors.value = error.problem.errors
    }
    saveError.value = describe(error)
  } finally {
    saving.value = false
  }
}

function discard() {
  values.value = { ...original.value }
  fieldErrors.value = {}
  saveError.value = null
}

async function rotate(field: Field) {
  if (!field.rotate) return
  rotating.value = field.key
  saveError.value = null
  try {
    if (field.rotate === 'invite') {
      const result = await api.post<{ inviteToken: string }>('/admin/invite/rotate')
      revealed.value = { key: field.key, label: field.label, value: result.inviteToken }
    } else {
      const result = await api.post<{ cronToken: string; cronUrl?: string }>('/admin/cron/rotate')
      revealed.value = { key: field.key, label: field.label, value: result.cronUrl ?? result.cronToken }
    }
    // The list now holds a stale mask, and the fresh value is the one above.
    await load(true)
  } catch (error) {
    saveError.value = describe(error)
  } finally {
    rotating.value = null
  }
}

async function copyRevealed() {
  if (!revealed.value) return
  try {
    await navigator.clipboard.writeText(revealed.value.value)
    toast.success('Copied')
  } catch {
    toast.error('The browser refused clipboard access. Select the text and copy it by hand.')
  }
}

/* ------------------------------------------------------------------ *
 * Typed accessors over an untyped settings bag
 * ------------------------------------------------------------------ */

function textOf(key: string): string {
  const value = values.value[key]
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return ''
}

function numberOf(key: string): number {
  const value = values.value[key]
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return 0
}

function boolOf(key: string): boolean {
  return values.value[key] === true
}

interface Bucket {
  capacity: number
  perSeconds: number
}

function bucketOf(key: string): Bucket {
  const value = values.value[key]
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    return {
      capacity: Number(record.capacity) || 1,
      perSeconds: Number(record.perSeconds) || 1,
    }
  }
  return { capacity: 60, perSeconds: 60 }
}

function setBucket(key: string, part: keyof Bucket, raw: string | number) {
  const next = { ...bucketOf(key) }
  next[part] = Math.max(1, Math.round(Number(raw) || 1))
  set(key, next)
}

function humanWindow(seconds: number): string {
  if (seconds % 3600 === 0 && seconds >= 3600) {
    const hours = seconds / 3600
    return hours === 1 ? 'hour' : `${hours} hours`
  }
  if (seconds % 60 === 0 && seconds >= 60) {
    const minutes = seconds / 60
    return minutes === 1 ? 'minute' : `${minutes} minutes`
  }
  return `${seconds} seconds`
}

function bucketSummary(key: string): string {
  const bucket = bucketOf(key)
  return `${bucket.capacity} per ${humanWindow(bucket.perSeconds)}`
}

/** The read-only cron URL the server builds; useful next to the token. */
const cronUrl = computed(() => {
  const value = values.value['cron.url']
  return typeof value === 'string' ? value : ''
})
</script>

<template>
  <div class="flex flex-col gap-4 pb-20">
    <Alert v-if="loadError" variant="destructive">
      <TriangleAlert />
      <AlertTitle>Settings could not be loaded</AlertTitle>
      <AlertDescription>
        <p>{{ loadError }}</p>
        <Button variant="outline" size="sm" class="mt-2" @click="load()">Try again</Button>
      </AlertDescription>
    </Alert>

    <div v-if="loading" class="flex flex-col gap-3">
      <Skeleton v-for="n in 4" :key="n" class="h-40" />
    </div>

    <template v-else-if="!loadError">
      <div
        v-if="revealed"
        class="rounded-xl border border-primary/40 bg-primary/5 p-4"
        role="status"
      >
        <p class="text-sm font-medium">New {{ revealed.label.toLowerCase() }}</p>
        <p class="mt-1 text-xs leading-relaxed text-muted-foreground">
          This is the only time it is shown in full. Copy it somewhere safe now — the server keeps
          only a masked copy, and anything still using the old value has already stopped working.
        </p>
        <div class="mt-2 flex items-center gap-2">
          <code
            class="min-w-0 flex-1 overflow-x-auto rounded-md border bg-background px-2 py-1.5 font-mono text-xs whitespace-pre"
          >{{ revealed.value }}</code>
          <Button variant="outline" size="sm" @click="copyRevealed()">
            <Copy /> Copy
          </Button>
          <Button variant="ghost" size="sm" @click="revealed = null">Dismiss</Button>
        </div>
      </div>

      <section
        v-for="group in GROUPS"
        :key="group.id"
        class="overflow-hidden rounded-xl border bg-card"
      >
        <header class="flex flex-col gap-0.5 border-b bg-muted/40 px-4 py-3">
          <h2 class="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <component :is="group.icon" class="size-4 text-muted-foreground" />
            {{ group.label }}
          </h2>
          <p class="text-xs leading-relaxed text-muted-foreground">{{ group.blurb }}</p>
        </header>

        <div class="divide-y">
          <div
            v-for="field in group.fields"
            :key="field.key"
            class="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] sm:items-start"
          >
            <div class="flex flex-col gap-0.5">
              <Label :for="`set-${field.key}`" class="text-xs">
                {{ field.label }}
                <InfoHint :title="field.hintTitle" :text="field.hint" wide side="right" />
              </Label>
              <span class="font-mono text-[10px] text-muted-foreground/70">{{ field.key }}</span>
            </div>

            <div class="flex min-w-0 flex-col gap-1">
              <!-- Booleans -->
              <div v-if="field.kind === 'switch'" class="flex h-8 items-center gap-2">
                <Switch
                  :id="`set-${field.key}`"
                  :model-value="boolOf(field.key)"
                  @update:model-value="set(field.key, $event)"
                />
                <span class="text-xs text-muted-foreground">
                  {{ boolOf(field.key) ? 'On' : 'Off' }}
                </span>
              </div>

              <!-- Rate-limit buckets -->
              <div v-else-if="field.kind === 'bucket'" class="flex flex-wrap items-center gap-2">
                <Input
                  :id="`set-${field.key}`"
                  type="number"
                  min="1"
                  class="h-8 w-24"
                  :model-value="bucketOf(field.key).capacity"
                  :aria-label="`${field.label} capacity`"
                  @update:model-value="setBucket(field.key, 'capacity', $event)"
                />
                <span class="text-xs text-muted-foreground">requests every</span>
                <Input
                  type="number"
                  min="1"
                  class="h-8 w-24"
                  :model-value="bucketOf(field.key).perSeconds"
                  :aria-label="`${field.label} window in seconds`"
                  @update:model-value="setBucket(field.key, 'perSeconds', $event)"
                />
                <span class="text-xs text-muted-foreground">
                  seconds — {{ bucketSummary(field.key) }}
                </span>
              </div>

              <!-- Rotatable tokens: read-only, replaced rather than edited -->
              <div v-else-if="field.kind === 'token'" class="flex flex-wrap items-center gap-2">
                <Input
                  :id="`set-${field.key}`"
                  readonly
                  class="h-8 max-w-xs font-mono text-xs"
                  :model-value="textOf(field.key) || 'not set'"
                />
                <Button
                  variant="outline"
                  size="sm"
                  :disabled="rotating === field.key"
                  @click="rotate(field)"
                >
                  <RotateCw :class="rotating === field.key ? 'animate-spin' : ''" /> Rotate
                </Button>
              </div>

              <!-- Masked secret: editable, but the mask means "unchanged" -->
              <Input
                v-else-if="field.kind === 'secret'"
                :id="`set-${field.key}`"
                class="h-8 max-w-md font-mono text-xs"
                autocomplete="off"
                spellcheck="false"
                :model-value="textOf(field.key)"
                :placeholder="field.placeholder"
                @update:model-value="set(field.key, String($event))"
              />

              <Select
                v-else-if="field.kind === 'select'"
                :model-value="textOf(field.key)"
                @update:model-value="set(field.key, String($event))"
              >
                <SelectTrigger :id="`set-${field.key}`" size="sm" class="w-full max-w-sm">
                  <SelectValue :placeholder="field.label" />
                </SelectTrigger>
                <SelectContent class="max-h-80">
                  <SelectItem
                    v-for="option in field.options ?? []"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </SelectItem>
                </SelectContent>
              </Select>

              <Textarea
                v-else-if="field.kind === 'textarea'"
                :id="`set-${field.key}`"
                class="min-h-16 max-w-xl text-sm"
                :model-value="textOf(field.key)"
                :placeholder="field.placeholder"
                @update:model-value="set(field.key, String($event))"
              />

              <div v-else-if="field.kind === 'number'" class="flex items-center gap-2">
                <Input
                  :id="`set-${field.key}`"
                  type="number"
                  class="h-8 w-32"
                  :min="field.min"
                  :max="field.max"
                  :model-value="numberOf(field.key)"
                  @update:model-value="set(field.key, Number($event))"
                />
                <span v-if="field.suffix" class="text-xs text-muted-foreground">
                  {{ field.suffix }}
                </span>
              </div>

              <Input
                v-else
                :id="`set-${field.key}`"
                class="h-8 max-w-md text-sm"
                :model-value="textOf(field.key)"
                :placeholder="field.placeholder"
                @update:model-value="set(field.key, String($event))"
              />

              <p
                v-if="field.key === 'cron.token' && cronUrl"
                class="font-mono text-[11px] break-all text-muted-foreground"
              >
                {{ cronUrl }}
              </p>
              <p v-if="field.legend" class="text-[11px] leading-relaxed text-muted-foreground">
                {{ field.legend }}
              </p>
              <p v-if="fieldErrors[field.key]" class="text-[11px] text-destructive">
                {{ fieldErrors[field.key] }}
              </p>
            </div>
          </div>
        </div>
      </section>
    </template>

    <!-- Save bar. Sticky because the form is long and the change you made is
         usually near the top of a group you have already scrolled past. -->
    <div
      v-if="dirty || saveError"
      class="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-xl border bg-background/95 px-4 py-3 shadow-lg backdrop-blur"
    >
      <span v-if="dirty" class="text-sm">
        {{ changedKeys.length }} unsaved change{{ changedKeys.length === 1 ? '' : 's' }}
      </span>
      <span v-if="saveError" class="text-sm text-destructive">{{ saveError }}</span>
      <span class="flex-1" />
      <Button variant="ghost" size="sm" :disabled="!dirty || saving" @click="discard()">
        <Undo2 /> Discard
      </Button>
      <Button size="sm" :disabled="!dirty || saving" @click="save()">
        <Save /> {{ saving ? 'Saving…' : 'Save changes' }}
      </Button>
    </div>
  </div>
</template>
