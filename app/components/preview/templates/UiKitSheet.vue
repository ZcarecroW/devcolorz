<script setup lang="ts">
/**
 * The QA surface: every component in every state, using every role once.
 *
 * States are shown side by side as static samples rather than being triggered
 * by real hover and focus. A preview you have to hover cannot be judged at a
 * glance, and half of these states would be unreachable inside the grid
 * density anyway — so `--p-primary-hover`, disabled and focus all get their own
 * swatch, labelled, next to the resting state.
 */
import {
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Info,
  Search,
  TriangleAlert,
} from '@lucide/vue'
import type { RoleMap } from '@/lib/color/roles'
import type { Oklch } from '@/lib/color/types'

defineProps<{ roles: RoleMap; colors: Oklch[] }>()

/** Tint a role toward the page background — the honest way to fake alpha here. */
const tint = (role: string, amount: number, base = '--p-background') =>
  `color-mix(in oklab, var(${role}) ${amount}%, var(${base}))`

const BADGES = [
  { label: 'Primary', style: { background: 'var(--p-primary)', color: 'var(--p-text-on-primary)' } },
  { label: 'Accent', style: { background: 'var(--p-accent)', color: 'var(--p-text-on-accent)' } },
  { label: 'Secondary', style: { background: tint('--p-secondary', 18), color: 'var(--p-secondary)' } },
  {
    label: 'Outline',
    style: { border: '1px solid var(--p-border-strong)', color: 'var(--p-text-muted)' },
  },
  { label: 'Success', style: { background: tint('--p-success', 18), color: 'var(--p-success)' } },
  { label: 'Warning', style: { background: tint('--p-warning', 20), color: 'var(--p-warning)' } },
  { label: 'Danger', style: { background: tint('--p-danger', 18), color: 'var(--p-danger)' } },
  { label: 'Info', style: { background: tint('--p-info', 18), color: 'var(--p-info)' } },
]

const ALERTS = [
  {
    role: '--p-success',
    icon: CircleCheck,
    title: 'Tokens published',
    text: 'Forty-four variables are live on the production build.',
  },
  {
    role: '--p-info',
    icon: Info,
    title: 'Three drafts waiting',
    text: 'Nobody has reviewed the dark scheme since Tuesday.',
  },
  {
    role: '--p-warning',
    icon: TriangleAlert,
    title: 'Contrast is thin',
    text: 'Muted text on the alternate surface reaches Lc 58.',
  },
  {
    role: '--p-danger',
    icon: CircleAlert,
    title: 'Export failed',
    text: 'Two aliases point at a token that no longer exists.',
  },
]

const TABS = ['Tokens', 'Components', 'Changelog']
</script>

<template>
  <div
    class="@container flex min-h-full flex-col gap-4 p-3.5 text-[11px]"
    :style="{ background: 'var(--p-background)', color: 'var(--p-text)' }"
  >
    <div class="grid gap-4 @2xl:grid-cols-2">
      <!-- Buttons -->
      <section class="flex flex-col gap-2">
        <p
          class="text-[9px] font-medium tracking-wide uppercase"
          :style="{ color: 'var(--p-text-muted)' }"
        >
          Buttons
        </p>
        <div class="flex flex-wrap items-end gap-2">
          <div class="flex flex-col items-center gap-1">
            <span
              class="rounded-md px-3 py-1.5 font-medium"
              :style="{ background: 'var(--p-primary)', color: 'var(--p-text-on-primary)' }"
            >
              Publish
            </span>
            <span class="text-[8px]" :style="{ color: 'var(--p-text-muted)' }">default</span>
          </div>
          <div class="flex flex-col items-center gap-1">
            <span
              class="rounded-md px-3 py-1.5 font-medium"
              :style="{ background: 'var(--p-primary-hover)', color: 'var(--p-text-on-primary)' }"
            >
              Publish
            </span>
            <span class="text-[8px]" :style="{ color: 'var(--p-text-muted)' }">hover</span>
          </div>
          <div class="flex flex-col items-center gap-1">
            <span
              class="rounded-md px-3 py-1.5 font-medium"
              :style="{
                background: 'var(--p-primary)',
                color: 'var(--p-text-on-primary)',
                boxShadow: '0 0 0 2px var(--p-background), 0 0 0 4px var(--p-primary)',
              }"
            >
              Publish
            </span>
            <span class="text-[8px]" :style="{ color: 'var(--p-text-muted)' }">focus</span>
          </div>
          <div class="flex flex-col items-center gap-1">
            <span
              class="rounded-md px-3 py-1.5 font-medium"
              :style="{ background: tint('--p-primary', 38), color: tint('--p-text-on-primary', 70, '--p-primary') }"
            >
              Publish
            </span>
            <span class="text-[8px]" :style="{ color: 'var(--p-text-muted)' }">disabled</span>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span
            class="rounded-md px-3 py-1.5 font-medium"
            :style="{ background: 'var(--p-accent)', color: 'var(--p-text-on-accent)' }"
          >
            Accent
          </span>
          <span
            class="rounded-md px-3 py-1.5 font-medium"
            :style="{ background: tint('--p-secondary', 18), color: 'var(--p-secondary)' }"
          >
            Secondary
          </span>
          <span
            class="rounded-md border px-3 py-1.5 font-medium"
            :style="{ borderColor: 'var(--p-border-strong)', color: 'var(--p-text)' }"
          >
            Outline
          </span>
          <span
            class="rounded-md px-3 py-1.5 font-medium"
            :style="{ background: tint('--p-text', 8), color: 'var(--p-text)' }"
          >
            Ghost
          </span>
          <span
            class="rounded-md px-3 py-1.5 font-medium"
            :style="{ background: tint('--p-danger', 16), color: 'var(--p-danger)' }"
          >
            Delete
          </span>
        </div>
      </section>

      <!-- Fields -->
      <section class="flex flex-col gap-2">
        <p
          class="text-[9px] font-medium tracking-wide uppercase"
          :style="{ color: 'var(--p-text-muted)' }"
        >
          Fields
        </p>
        <div class="flex flex-col gap-1">
          <span class="font-medium">Workspace name</span>
          <div
            class="flex items-center gap-1.5 rounded-md border px-2 py-1.5"
            :style="{ background: 'var(--p-surface)', borderColor: 'var(--p-border)' }"
          >
            <Search class="size-3 shrink-0" :style="{ color: 'var(--p-text-muted)' }" />
            <span :style="{ color: 'var(--p-text-muted)' }">Search or paste a URL</span>
          </div>
        </div>
        <div
          class="flex items-center justify-between rounded-md border px-2 py-1.5"
          :style="{
            background: 'var(--p-surface)',
            borderColor: 'var(--p-primary)',
            boxShadow: '0 0 0 3px ' + tint('--p-primary', 24),
          }"
        >
          <span>halcyon-design</span>
          <span class="text-[9px]" :style="{ color: 'var(--p-text-muted)' }">focused</span>
        </div>
        <div class="flex flex-col gap-1">
          <div
            class="flex items-center justify-between rounded-md border px-2 py-1.5"
            :style="{ background: 'var(--p-surface)', borderColor: 'var(--p-danger)' }"
          >
            <span>ops@</span>
          </div>
          <span class="text-[9px]" :style="{ color: 'var(--p-danger)' }">
            Enter a full address, including the domain.
          </span>
        </div>
        <div
          class="flex items-center justify-between rounded-md border px-2 py-1.5"
          :style="{ background: 'var(--p-surface)', borderColor: 'var(--p-border)' }"
        >
          <span>Every deploy</span>
          <ChevronDown class="size-3" :style="{ color: 'var(--p-text-muted)' }" />
        </div>
        <div
          class="flex items-center justify-between rounded-md border px-2 py-1.5"
          :style="{
            background: 'var(--p-surface-alt)',
            borderColor: 'var(--p-border)',
            color: 'var(--p-text-muted)',
          }"
        >
          <span>Managed by SSO</span>
          <span class="text-[9px]">disabled</span>
        </div>
      </section>

      <!-- Selection controls -->
      <section class="flex flex-col gap-2">
        <p
          class="text-[9px] font-medium tracking-wide uppercase"
          :style="{ color: 'var(--p-text-muted)' }"
        >
          Selection
        </p>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span class="inline-flex items-center gap-1.5">
            <span
              class="flex size-3.5 items-center justify-center rounded-[4px]"
              :style="{ background: 'var(--p-primary)', color: 'var(--p-text-on-primary)' }"
            >
              <Check class="size-2.5" />
            </span>
            Checked
          </span>
          <span class="inline-flex items-center gap-1.5">
            <span
              class="size-3.5 rounded-[4px] border"
              :style="{ borderColor: 'var(--p-border-strong)', background: 'var(--p-surface)' }"
            />
            Unchecked
          </span>
          <span class="inline-flex items-center gap-1.5">
            <span
              class="flex size-3.5 items-center justify-center rounded-full border-2"
              :style="{ borderColor: 'var(--p-primary)' }"
            >
              <span class="size-1.5 rounded-full" :style="{ background: 'var(--p-primary)' }" />
            </span>
            Selected
          </span>
          <span class="inline-flex items-center gap-1.5">
            <span
              class="size-3.5 rounded-full border"
              :style="{ borderColor: 'var(--p-border-strong)', background: 'var(--p-surface)' }"
            />
            Option
          </span>
          <span class="inline-flex items-center gap-1.5">
            <span
              class="flex h-3.5 w-6 items-center rounded-full px-0.5"
              :style="{ background: 'var(--p-primary)' }"
            >
              <span
                class="ml-auto size-2.5 rounded-full"
                :style="{ background: 'var(--p-text-on-primary)' }"
              />
            </span>
            On
          </span>
          <span class="inline-flex items-center gap-1.5">
            <span
              class="flex h-3.5 w-6 items-center rounded-full px-0.5"
              :style="{ background: tint('--p-text', 22) }"
            >
              <span class="size-2.5 rounded-full" :style="{ background: 'var(--p-surface)' }" />
            </span>
            Off
          </span>
        </div>

        <!-- Badges -->
        <p
          class="mt-1 text-[9px] font-medium tracking-wide uppercase"
          :style="{ color: 'var(--p-text-muted)' }"
        >
          Badges
        </p>
        <div class="flex flex-wrap gap-1.5">
          <span
            v-for="badge in BADGES"
            :key="badge.label"
            class="rounded-full px-2 py-0.5 text-[9px] font-medium"
            :style="badge.style"
          >
            {{ badge.label }}
          </span>
        </div>
      </section>

      <!-- Progress, tabs, tooltip, scrim -->
      <section class="flex flex-col gap-2">
        <p
          class="text-[9px] font-medium tracking-wide uppercase"
          :style="{ color: 'var(--p-text-muted)' }"
        >
          Feedback
        </p>
        <div class="flex flex-col gap-1.5">
          <div class="flex justify-between text-[9px]" :style="{ color: 'var(--p-text-muted)' }">
            <span>Migration</span>
            <span class="tabular-nums">68%</span>
          </div>
          <div class="h-1.5 overflow-hidden rounded-full" :style="{ background: tint('--p-text', 12) }">
            <div class="h-full w-[68%] rounded-full" :style="{ background: 'var(--p-primary)' }" />
          </div>
          <div class="h-1.5 overflow-hidden rounded-full" :style="{ background: tint('--p-text', 12) }">
            <div class="h-full w-[34%] rounded-full" :style="{ background: 'var(--p-accent)' }" />
          </div>
        </div>

        <div class="flex gap-3 border-b" :style="{ borderColor: 'var(--p-border)' }">
          <span
            v-for="(tab, index) in TABS"
            :key="tab"
            class="pb-1.5 text-[10px]"
            :style="
              index === 0
                ? {
                    color: 'var(--p-primary)',
                    fontWeight: 600,
                    boxShadow: 'inset 0 -2px 0 0 var(--p-primary)',
                  }
                : { color: 'var(--p-text-muted)' }
            "
          >
            {{ tab }}
          </span>
        </div>

        <div class="flex flex-wrap items-start gap-3">
          <!-- Tooltip: the one element that inverts, so it proves text/background swap -->
          <span class="relative inline-block">
            <span
              class="block rounded-md px-2 py-1 text-[9px] font-medium"
              :style="{ background: 'var(--p-text)', color: 'var(--p-background)' }"
            >
              Copies the OKLCH value
            </span>
            <span
              class="absolute -bottom-[3px] left-4 block size-1.5 rotate-45"
              :style="{ background: 'var(--p-text)' }"
            />
          </span>

          <!-- Scrim: the only place --p-overlay is visible -->
          <span
            class="relative block h-14 w-24 overflow-hidden rounded-md border"
            :style="{ background: 'var(--p-surface-alt)', borderColor: 'var(--p-border)' }"
          >
            <span class="absolute inset-0 block" :style="{ background: 'var(--p-overlay)' }" />
            <span
              class="absolute inset-x-2 top-3 block rounded-[5px] border p-1.5"
              :style="{ background: 'var(--p-surface)', borderColor: 'var(--p-border)' }"
            >
              <span class="block text-[8px] font-medium">Discard draft?</span>
              <span
                class="mt-1 block w-fit rounded-[3px] px-1.5 py-0.5 text-[7px]"
                :style="{ background: 'var(--p-primary)', color: 'var(--p-text-on-primary)' }"
              >
                Discard
              </span>
            </span>
          </span>
        </div>
      </section>
    </div>

    <!-- Alerts, one per status role -->
    <section class="flex flex-col gap-1.5">
      <p
        class="text-[9px] font-medium tracking-wide uppercase"
        :style="{ color: 'var(--p-text-muted)' }"
      >
        Status
      </p>
      <div class="grid gap-1.5 @2xl:grid-cols-2">
        <div
          v-for="alert in ALERTS"
          :key="alert.title"
          class="flex gap-2 rounded-md border-l-2 py-1.5 pr-2 pl-2"
          :style="{ background: tint(alert.role, 10), borderColor: `var(${alert.role})` }"
        >
          <component
            :is="alert.icon"
            class="mt-px size-3.5 shrink-0"
            :style="{ color: `var(${alert.role})` }"
          />
          <div class="min-w-0">
            <p class="text-[10px] font-medium">{{ alert.title }}</p>
            <p class="text-[10px] leading-snug" :style="{ color: 'var(--p-text-muted)' }">
              {{ alert.text }}
            </p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
