<script setup lang="ts">
/**
 * A marketing page painted entirely from the role variables.
 *
 * The one decision worth knowing: nothing in here is a real control. Every
 * button and link is a span, so a preview never becomes a tab stop or a click
 * target that lies about what it does, and the pane can drop the whole layout
 * inside a button in grid mode without nesting interactive elements.
 *
 * All color comes from `var(--p-*)`; tints are `color-mix()` against the
 * background so they survive any palette without a second engine call.
 */
import { ArrowRight, Check, Layers, ShieldCheck, Zap } from '@lucide/vue'
import type { RoleMap } from '@/lib/color/roles'
import type { Oklch } from '@/lib/color/types'

defineProps<{ roles: RoleMap; colors: Oklch[] }>()

const FEATURES = [
  {
    icon: Layers,
    title: 'Tokens, not screenshots',
    text: 'One source emits CSS variables, a Tailwind theme and Figma styles.',
  },
  {
    icon: ShieldCheck,
    title: 'Contrast checked',
    text: 'Every pair is scored in WCAG 2 and APCA before it reaches a build.',
  },
  {
    icon: Zap,
    title: 'Dark mode derived',
    text: 'The second scheme comes from the same palette, not from a guess.',
  },
]

const tint = (role: string, amount: number) =>
  `color-mix(in oklab, var(${role}) ${amount}%, var(--p-background))`
</script>

<template>
  <div
    class="@container flex min-h-full flex-col"
    :style="{ background: 'var(--p-background)', color: 'var(--p-text)' }"
  >
    <!-- Nav -->
    <div
      class="flex items-center gap-3 border-b px-4 py-2.5"
      :style="{ borderColor: 'var(--p-border)', background: 'var(--p-surface)' }"
    >
      <div class="flex shrink-0 items-center gap-1.5">
        <div
          class="size-4 rounded-[5px]"
          :style="{ background: 'var(--p-primary)' }"
        />
        <span class="text-[13px] font-semibold tracking-tight">Halcyon</span>
      </div>
      <div
        class="ml-3 hidden items-center gap-3.5 text-[11px] @lg:flex"
        :style="{ color: 'var(--p-text-muted)' }"
      >
        <span>Product</span>
        <span>Docs</span>
        <span>Pricing</span>
        <span>Changelog</span>
      </div>
      <div class="ml-auto flex shrink-0 items-center gap-2">
        <span
          class="hidden text-[11px] @sm:inline"
          :style="{ color: 'var(--p-text-muted)' }"
        >
          Sign in
        </span>
        <span
          class="rounded-md px-2.5 py-1 text-[11px] font-medium"
          :style="{ background: 'var(--p-primary)', color: 'var(--p-text-on-primary)' }"
        >
          Get started
        </span>
      </div>
    </div>

    <!-- Hero -->
    <div class="grid gap-5 px-4 py-6 @2xl:grid-cols-[1.05fr_1fr] @2xl:items-center @2xl:gap-7 @2xl:px-6 @2xl:py-9">
      <div class="flex flex-col items-start gap-3">
        <span
          class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
          :style="{ background: tint('--p-accent', 16), color: 'var(--p-accent)' }"
        >
          <Zap class="size-2.5" />
          Version 4 is out
        </span>
        <h1 class="text-xl leading-[1.1] font-semibold tracking-tight text-balance @2xl:text-[28px]">
          Ship a color system your engineers can install.
        </h1>
        <p
          class="max-w-[34ch] text-[12px] leading-relaxed @2xl:text-[13px]"
          :style="{ color: 'var(--p-text-muted)' }"
        >
          Halcyon turns a palette into themed tokens, a documented ramp and a dark
          scheme that holds its contrast. One command, no handoff meeting.
        </p>
        <div class="mt-1 flex flex-wrap items-center gap-2">
          <span
            class="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium"
            :style="{ background: 'var(--p-primary)', color: 'var(--p-text-on-primary)' }"
          >
            Start free
            <ArrowRight class="size-3" />
          </span>
          <span
            class="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-medium"
            :style="{ borderColor: 'var(--p-border-strong)', color: 'var(--p-text)' }"
          >
            Book a walkthrough
          </span>
        </div>
        <div
          class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]"
          :style="{ color: 'var(--p-text-muted)' }"
        >
          <span class="inline-flex items-center gap-1">
            <Check class="size-2.5" :style="{ color: 'var(--p-success)' }" />
            No card required
          </span>
          <span class="inline-flex items-center gap-1">
            <Check class="size-2.5" :style="{ color: 'var(--p-success)' }" />
            SOC 2 Type II
          </span>
          <span class="hidden items-center gap-1 @lg:inline-flex">
            <Check class="size-2.5" :style="{ color: 'var(--p-success)' }" />
            Self-host available
          </span>
        </div>
      </div>

      <!-- Product shot: a mock app window, so the accents get to sit on a surface -->
      <div
        class="overflow-hidden rounded-lg border shadow-sm"
        :style="{ background: 'var(--p-surface)', borderColor: 'var(--p-border)' }"
      >
        <div
          class="flex items-center gap-1 border-b px-2.5 py-1.5"
          :style="{ borderColor: 'var(--p-border)', background: 'var(--p-surface-alt)' }"
        >
          <span class="size-1.5 rounded-full" :style="{ background: 'var(--p-danger)' }" />
          <span class="size-1.5 rounded-full" :style="{ background: 'var(--p-warning)' }" />
          <span class="size-1.5 rounded-full" :style="{ background: 'var(--p-success)' }" />
          <span class="ml-2 text-[9px]" :style="{ color: 'var(--p-text-muted)' }">
            tokens.css
          </span>
        </div>
        <div class="flex flex-col gap-2.5 p-3">
          <div class="flex items-end gap-1.5">
            <div
              v-for="(height, index) in [38, 62, 30, 74, 50, 86]"
              :key="index"
              class="min-w-0 flex-1 rounded-[3px]"
              :style="{ height: `${height * 0.5}px`, background: `var(--p-chart-${index + 1})` }"
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <div
              v-for="(width, index) in ['86%', '64%', '72%']"
              :key="index"
              class="h-1.5 rounded-full"
              :style="{ width, background: tint('--p-text', index === 0 ? 26 : 14) }"
            />
          </div>
          <div class="flex items-center gap-2">
            <span
              class="rounded px-2 py-0.5 text-[9px] font-medium"
              :style="{ background: 'var(--p-accent)', color: 'var(--p-text-on-accent)' }"
            >
              Publish
            </span>
            <span class="text-[9px]" :style="{ color: 'var(--p-text-muted)' }">
              44 tokens, 2 schemes
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Features -->
    <div
      class="grid gap-3 border-t px-4 py-5 @lg:grid-cols-3 @2xl:px-6"
      :style="{ borderColor: 'var(--p-border)', background: 'var(--p-surface-alt)' }"
    >
      <div v-for="feature in FEATURES" :key="feature.title" class="flex gap-2.5">
        <div
          class="flex size-7 shrink-0 items-center justify-center rounded-md"
          :style="{ background: tint('--p-primary', 14), color: 'var(--p-primary)' }"
        >
          <component :is="feature.icon" class="size-3.5" />
        </div>
        <div class="min-w-0">
          <p class="text-[12px] font-medium">{{ feature.title }}</p>
          <p class="text-[11px] leading-snug" :style="{ color: 'var(--p-text-muted)' }">
            {{ feature.text }}
          </p>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div
      class="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-3 text-[10px] @2xl:px-6"
      :style="{ borderColor: 'var(--p-border)', color: 'var(--p-text-muted)' }"
    >
      <span class="inline-flex items-center gap-1.5">
        <span class="size-2.5 rounded-[3px]" :style="{ background: 'var(--p-primary)' }" />
        Halcyon Labs
      </span>
      <span>Documentation</span>
      <span>Status</span>
      <span>Privacy</span>
      <span class="ml-auto">© 2026</span>
    </div>
  </div>
</template>
