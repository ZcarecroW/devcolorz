<script setup lang="ts">
/**
 * Three pricing tiers with one highlighted, a feature checklist and CTAs.
 *
 * The decision worth knowing: the highlighted tier is raised with the primary
 * color on *three* surfaces at once — border, badge and filled button — while
 * its neighbours stay on plain surfaces. That is the arrangement that exposes a
 * primary too close to the background to read as emphasis at all.
 */
import { computed } from 'vue'
import { Check, Minus, Sparkles } from '@lucide/vue'
import InfoHint from '@/components/common/InfoHint.vue'
import type { RoleMap } from '@/lib/color/roles'
import type { Oklch } from '@/lib/color/types'

const props = defineProps<{ roles: RoleMap; colors: Oklch[] }>()

const rampCount = computed(() => Math.max(1, props.roles.ramp.length))
function ramp(index: number): string {
  const n = rampCount.value
  return `var(--p-ramp-${(((index % n) + n) % n) + 1})`
}

interface Tier {
  name: string
  price: string
  cadence: string
  blurb: string
  featured: boolean
  cta: string
  features: Array<{ label: string; included: boolean }>
}

const tiers: Tier[] = [
  {
    name: 'Solo',
    price: '$0',
    cadence: 'forever',
    blurb: 'For one designer and the palettes they keep re-deriving.',
    featured: false,
    cta: 'Start free',
    features: [
      { label: '5 saved palettes', included: true },
      { label: 'CSS and Tailwind export', included: true },
      { label: 'APCA and WCAG audits', included: true },
      { label: 'Shared team libraries', included: false },
      { label: 'Figma token sync', included: false },
    ],
  },
  {
    name: 'Studio',
    price: '$18',
    cadence: 'per seat / month',
    blurb: 'For product teams shipping one system across several surfaces.',
    featured: true,
    cta: 'Start 14-day trial',
    features: [
      { label: 'Unlimited palettes', included: true },
      { label: 'Every export target', included: true },
      { label: 'Contrast gates in CI', included: true },
      { label: 'Shared team libraries', included: true },
      { label: 'Figma token sync', included: false },
    ],
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    cadence: 'annual',
    blurb: 'For design orgs with brand governance and an audit trail.',
    featured: false,
    cta: 'Talk to sales',
    features: [
      { label: 'Unlimited palettes', included: true },
      { label: 'Every export target', included: true },
      { label: 'Contrast gates in CI', included: true },
      { label: 'Shared team libraries', included: true },
      { label: 'Figma token sync', included: true },
    ],
  },
]
</script>

<template>
  <div
    class="@container w-full px-4 py-8 @xl:px-8 @xl:py-12"
    :style="{ background: 'var(--p-background)', color: 'var(--p-text)' }"
  >
    <!-- Heading -->
    <div class="mx-auto max-w-2xl text-center">
      <span
        class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
        :style="{
          color: 'var(--p-accent)',
          background: 'color-mix(in oklab, var(--p-accent) 12%, transparent)',
          boxShadow: 'inset 0 0 0 1px color-mix(in oklab, var(--p-accent) 40%, transparent)',
        }"
      >
        <Sparkles class="size-3" /> Pricing
      </span>
      <h2 class="mt-3 text-2xl font-semibold tracking-tight text-balance @xl:text-4xl">
        Pay for the seats that touch the system
      </h2>
      <p class="mx-auto mt-2 max-w-md text-sm text-pretty" :style="{ color: 'var(--p-text-muted)' }">
        Every plan ships the same color engine. The difference is how many people
        can write to it.
      </p>

      <!-- Billing toggle -->
      <div class="mt-5 flex items-center justify-center gap-2">
        <span
          class="flex items-center rounded-full p-1"
          :style="{ background: 'var(--p-surface-alt)', boxShadow: 'inset 0 0 0 1px var(--p-border)' }"
        >
          <span
            class="rounded-full px-3 py-1 text-[11px]"
            :style="{ color: 'var(--p-text-muted)' }"
          >
            Monthly
          </span>
          <span
            class="rounded-full px-3 py-1 text-[11px] font-medium"
            :style="{ background: 'var(--p-primary)', color: 'var(--p-text-on-primary)' }"
          >
            Yearly
          </span>
        </span>
        <span class="text-[11px]" :style="{ color: 'var(--p-success)' }">Save 20%</span>
        <InfoHint
          title="Why one tier is filled"
          wide
          class="text-[color:var(--p-text-muted)] hover:text-[color:var(--p-text)]"
          text="The featured card carries the primary color on its border, its badge and its button at the same time, while the other two stay on plain surfaces. If the middle card does not visibly jump forward here, the primary is too close in lightness to the background to work as emphasis, and buttons elsewhere in the product will read as disabled."
        />
      </div>
    </div>

    <!-- Tiers -->
    <div class="mx-auto mt-8 grid max-w-5xl gap-4 @2xl:grid-cols-3">
      <div
        v-for="(tier, i) in tiers"
        :key="tier.name"
        class="relative flex flex-col rounded-2xl p-5"
        :style="
          tier.featured
            ? {
                background: 'var(--p-surface)',
                boxShadow: '0 0 0 2px var(--p-primary), 0 18px 40px -24px var(--p-overlay)',
              }
            : { background: 'var(--p-surface)', boxShadow: 'inset 0 0 0 1px var(--p-border)' }
        "
      >
        <span
          v-if="tier.featured"
          class="absolute -top-2.5 left-5 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
          :style="{ background: 'var(--p-primary)', color: 'var(--p-text-on-primary)' }"
        >
          Most popular
        </span>

        <span class="flex items-center gap-2">
          <span class="size-2.5 rounded-full" :style="{ background: ramp(i * 2) }" />
          <span class="text-sm font-semibold">{{ tier.name }}</span>
        </span>

        <span class="mt-3 flex items-baseline gap-1.5">
          <span class="text-3xl font-semibold tracking-tight tabular-nums">{{ tier.price }}</span>
          <span class="text-[11px]" :style="{ color: 'var(--p-text-muted)' }">
            {{ tier.cadence }}
          </span>
        </span>

        <p class="mt-2 text-xs leading-relaxed" :style="{ color: 'var(--p-text-muted)' }">
          {{ tier.blurb }}
        </p>

        <span class="my-4 h-px" :style="{ background: 'var(--p-border)' }" />

        <ul class="flex flex-col gap-2">
          <li
            v-for="feature in tier.features"
            :key="feature.label"
            class="flex items-start gap-2 text-xs"
            :style="{ color: feature.included ? 'var(--p-text)' : 'var(--p-text-muted)' }"
          >
            <Check
              v-if="feature.included"
              class="mt-px size-3.5 shrink-0"
              :style="{ color: 'var(--p-success)' }"
            />
            <Minus v-else class="mt-px size-3.5 shrink-0" />
            <span>{{ feature.label }}</span>
          </li>
        </ul>

        <span class="flex-1" />

        <span
          class="mt-5 block rounded-lg px-4 py-2.5 text-center text-xs font-medium"
          :style="
            tier.featured
              ? { background: 'var(--p-primary)', color: 'var(--p-text-on-primary)' }
              : { color: 'var(--p-text)', boxShadow: 'inset 0 0 0 1px var(--p-border-strong)' }
          "
        >
          {{ tier.cta }}
        </span>
      </div>
    </div>

    <p class="mt-6 text-center text-[11px]" :style="{ color: 'var(--p-text-muted)' }">
      Prices exclude VAT. Cancel from the billing page, no call required.
    </p>
  </div>
</template>
