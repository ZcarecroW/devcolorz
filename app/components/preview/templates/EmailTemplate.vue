<script setup lang="ts">
/**
 * A transactional email: logo bar, heading, body, line-item table, button and
 * footer, sitting on the grey page an email client would paint behind it.
 *
 * The decision worth knowing: the whole email is built from two surfaces and
 * three text weights, with exactly one saturated element — the button. Email is
 * the medium where a palette has the least room to manoeuvre, so this template
 * is deliberately the most restrained in the set: if the primary does not carry
 * the button here, nothing else in the message will rescue it.
 */
import { computed } from 'vue'
import { ArrowRight, Receipt, ShieldCheck } from '@lucide/vue'
import InfoHint from '@/components/common/InfoHint.vue'
import type { RoleMap } from '@/lib/color/roles'
import type { Oklch } from '@/lib/color/types'

const props = defineProps<{ roles: RoleMap; colors: Oklch[] }>()

const rampCount = computed(() => Math.max(1, props.roles.ramp.length))
function ramp(index: number): string {
  const n = rampCount.value
  return `var(--p-ramp-${(((index % n) + n) % n) + 1})`
}

const lineItems = [
  { label: 'Studio · 6 seats', detail: 'Mar 1 – Mar 31', amount: '$108.00' },
  { label: 'Token sync add-on', detail: 'Mar 1 – Mar 31', amount: '$24.00' },
  { label: 'Annual discount', detail: '20% off', amount: '-$26.40' },
]
</script>

<template>
  <div
    class="@container w-full px-3 py-6 @xl:px-6 @xl:py-10"
    :style="{ background: 'var(--p-surface-alt)', color: 'var(--p-text)' }"
  >
    <!-- Preheader, as email clients show it in the list view -->
    <p class="mx-auto mb-3 max-w-xl text-center text-[10px]" :style="{ color: 'var(--p-text-muted)' }">
      Receipt for March · view in browser
    </p>

    <div
      class="mx-auto max-w-xl overflow-hidden rounded-xl"
      :style="{
        background: 'var(--p-background)',
        boxShadow: 'inset 0 0 0 1px var(--p-border), 0 12px 40px -28px var(--p-overlay)',
      }"
    >
      <!-- Brand bar -->
      <div
        class="flex items-center gap-2.5 px-6 py-4"
        :style="{ background: 'var(--p-surface)', borderBottom: '1px solid var(--p-border)' }"
      >
        <span
          class="size-7 shrink-0 rounded-lg"
          :style="{ background: `linear-gradient(135deg, ${ramp(0)}, ${ramp(3)} 60%, ${ramp(6)})` }"
        />
        <span class="text-sm font-semibold tracking-tight">Devcolorz</span>
        <span class="flex-1" />
        <span
          class="flex items-center gap-1 text-[10px]"
          :style="{ color: 'var(--p-text-muted)' }"
        >
          <Receipt class="size-3" /> Invoice 4471
        </span>
        <InfoHint
          title="One saturated element"
          wide
          class="text-[color:var(--p-text-muted)] hover:text-[color:var(--p-text)]"
          text="Email strips away almost everything a palette normally leans on: no hover states, no shadows worth trusting, no dark mode you control. What is left is two surfaces, three text weights and a single filled button. If the primary cannot carry that button against the card here, it is not a primary — it is an accent, and the role assignment needs revisiting."
        />
      </div>

      <div class="px-6 py-6">
        <span
          class="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase"
          :style="{
            color: 'var(--p-success)',
            background: 'color-mix(in oklab, var(--p-success) 14%, transparent)',
          }"
        >
          Payment received
        </span>

        <h1 class="mt-3 text-xl leading-snug font-semibold tracking-tight text-balance">
          Your March invoice is settled
        </h1>

        <p class="mt-3 text-sm leading-relaxed" :style="{ color: 'var(--p-text-muted)' }">
          Hi Ana — we charged the card ending 4417 on 1 March. Nothing else is
          needed from you. The full breakdown is below, and the PDF is attached
          for your records.
        </p>

        <!-- Line items -->
        <div
          class="mt-5 overflow-hidden rounded-lg"
          :style="{ boxShadow: 'inset 0 0 0 1px var(--p-border)' }"
        >
          <div
            v-for="(item, i) in lineItems"
            :key="item.label"
            class="flex items-center gap-3 px-3.5 py-2.5"
            :style="{
              borderTop: i === 0 ? 'none' : '1px solid var(--p-border)',
              background: 'var(--p-surface)',
            }"
          >
            <span class="size-1.5 shrink-0 rounded-full" :style="{ background: ramp(i * 3) }" />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-xs font-medium">{{ item.label }}</span>
              <span class="block text-[10px]" :style="{ color: 'var(--p-text-muted)' }">
                {{ item.detail }}
              </span>
            </span>
            <span class="shrink-0 text-xs tabular-nums">{{ item.amount }}</span>
          </div>
          <div
            class="flex items-center gap-3 px-3.5 py-2.5"
            :style="{ borderTop: '1px solid var(--p-border-strong)', background: 'var(--p-surface-alt)' }"
          >
            <span class="flex-1 text-xs font-semibold">Total charged</span>
            <span class="text-sm font-semibold tabular-nums">$105.60</span>
          </div>
        </div>

        <!-- Call to action -->
        <div class="mt-6 flex flex-col items-center gap-3">
          <span
            class="inline-flex items-center gap-1.5 rounded-lg px-5 py-2.5 text-sm font-medium"
            :style="{ background: 'var(--p-primary)', color: 'var(--p-text-on-primary)' }"
          >
            View receipt <ArrowRight class="size-4" />
          </span>
          <span class="text-[11px]" :style="{ color: 'var(--p-accent)' }">
            Manage billing and seats
          </span>
        </div>

        <p
          class="mt-6 flex items-start gap-2 rounded-lg p-3 text-[11px] leading-relaxed"
          :style="{ background: 'var(--p-surface)', color: 'var(--p-text-muted)' }"
        >
          <ShieldCheck class="mt-px size-3.5 shrink-0" :style="{ color: 'var(--p-info)' }" />
          <span>
            We never ask for card details by email. If a message claiming to be
            from us does, forward it to security@devcolorz.app and delete it.
          </span>
        </p>
      </div>

      <!-- Footer -->
      <div
        class="px-6 py-5 text-center"
        :style="{ background: 'var(--p-surface)', borderTop: '1px solid var(--p-border)' }"
      >
        <div class="flex justify-center gap-1.5">
          <span
            v-for="i in Math.min(6, rampCount)"
            :key="i"
            class="size-1.5 rounded-full"
            :style="{ background: ramp(i - 1) }"
          />
        </div>
        <p class="mt-3 text-[10px] leading-relaxed" :style="{ color: 'var(--p-text-muted)' }">
          Devcolorz BV · Prinsengracht 12, 1015 Amsterdam
          <br />
          You receive this because you own the billing seat on this workspace.
        </p>
        <p class="mt-2 text-[10px]" :style="{ color: 'var(--p-text-muted)' }">
          <span class="underline">Billing preferences</span>
          ·
          <span class="underline">Unsubscribe from receipts</span>
        </p>
      </div>
    </div>
  </div>
</template>
