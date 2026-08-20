<script setup lang="ts">
/**
 * A commerce grid — the template that shows what the palette does to photos.
 *
 * There is no photography here, so each card gets a two-stop gradient built
 * from the chart series instead. That is deliberate: the chart roles are the
 * only ones guaranteed to exist in six maximally distinct steps, so the
 * imagery stays distinct from card to card no matter how small the palette is.
 */
import { Heart, ShoppingCart, Star, Truck } from '@lucide/vue'
import type { RoleMap } from '@/lib/color/roles'
import type { Oklch } from '@/lib/color/types'

defineProps<{ roles: RoleMap; colors: Oklch[] }>()

interface Product {
  name: string
  category: string
  price: string
  was?: string
  rating: number
  reviews: number
  badge?: { label: string; role: string }
  from: number
  to: number
  stocked: boolean
}

const PRODUCTS: Product[] = [
  {
    name: 'Aster Lounge Chair',
    category: 'Seating',
    price: '$680',
    was: '$840',
    rating: 4,
    reviews: 128,
    badge: { label: '−19%', role: '--p-danger' },
    from: 1,
    to: 4,
    stocked: true,
  },
  {
    name: 'Halo Floor Lamp',
    category: 'Lighting',
    price: '$245',
    rating: 5,
    reviews: 64,
    badge: { label: 'New', role: '--p-accent' },
    from: 2,
    to: 5,
    stocked: true,
  },
  {
    name: 'Meridian Side Table',
    category: 'Tables',
    price: '$310',
    rating: 3,
    reviews: 41,
    badge: { label: 'Last one', role: '--p-warning' },
    from: 3,
    to: 6,
    stocked: false,
  },
]

const FILTERS = ['All', 'Seating', 'Lighting', 'Tables', 'Under $300']

const tint = (role: string, amount: number) =>
  `color-mix(in oklab, var(${role}) ${amount}%, var(--p-surface))`

const artwork = (from: number, to: number) => ({
  backgroundImage: [
    `radial-gradient(120% 90% at 20% 12%, color-mix(in oklab, var(--p-chart-${from}) 55%, white) 0%, transparent 62%)`,
    `linear-gradient(145deg, var(--p-chart-${from}), var(--p-chart-${to}))`,
  ].join(', '),
})
</script>

<template>
  <div
    class="@container flex min-h-full flex-col gap-3 p-3.5"
    :style="{ background: 'var(--p-background)', color: 'var(--p-text)' }"
  >
    <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <h2 class="text-[15px] font-semibold tracking-tight">New this season</h2>
      <span class="text-[10px]" :style="{ color: 'var(--p-text-muted)' }">
        42 pieces, shipped from the workshop
      </span>
    </div>

    <div class="flex flex-wrap gap-1.5">
      <span
        v-for="(filter, index) in FILTERS"
        :key="filter"
        class="rounded-full px-2 py-0.5 text-[10px]"
        :style="
          index === 0
            ? { background: 'var(--p-primary)', color: 'var(--p-text-on-primary)', fontWeight: 500 }
            : { border: '1px solid var(--p-border)', color: 'var(--p-text-muted)' }
        "
      >
        {{ filter }}
      </span>
    </div>

    <div class="grid grid-cols-1 gap-2.5 @xs:grid-cols-2 @2xl:grid-cols-3">
      <div
        v-for="product in PRODUCTS"
        :key="product.name"
        class="flex flex-col overflow-hidden rounded-lg border"
        :style="{ background: 'var(--p-surface)', borderColor: 'var(--p-border)' }"
      >
        <div class="relative aspect-[4/3]" :style="artwork(product.from, product.to)">
          <!--
            The badge is role-colored text on a surface chip rather than white
            on the role color: a status role is only guaranteed to contrast
            against the background, never against an arbitrary gradient.
          -->
          <span
            v-if="product.badge"
            class="absolute top-1.5 left-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
            :style="{ background: 'var(--p-surface)', color: `var(${product.badge.role})` }"
          >
            {{ product.badge.label }}
          </span>
          <span
            class="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full"
            :style="{ background: 'var(--p-surface)', color: 'var(--p-text-muted)' }"
          >
            <Heart class="size-2.5" />
          </span>
        </div>

        <div class="flex flex-1 flex-col gap-1.5 p-2.5">
          <p
            class="text-[8px] font-medium tracking-wide uppercase"
            :style="{ color: 'var(--p-text-muted)' }"
          >
            {{ product.category }}
          </p>
          <p class="text-[12px] leading-snug font-medium">{{ product.name }}</p>

          <div class="flex items-center gap-1">
            <span class="flex">
              <Star
                v-for="step in 5"
                :key="step"
                class="size-2.5"
                :style="{
                  color: step <= product.rating ? 'var(--p-warning)' : 'var(--p-border-strong)',
                  fill: step <= product.rating ? 'var(--p-warning)' : 'transparent',
                }"
              />
            </span>
            <span class="text-[9px] tabular-nums" :style="{ color: 'var(--p-text-muted)' }">
              {{ product.reviews }}
            </span>
          </div>

          <div class="mt-auto flex items-baseline gap-1.5">
            <span class="text-[13px] font-semibold tabular-nums">{{ product.price }}</span>
            <span
              v-if="product.was"
              class="text-[10px] line-through tabular-nums"
              :style="{ color: 'var(--p-text-muted)' }"
            >
              {{ product.was }}
            </span>
          </div>

          <span
            class="mt-0.5 flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[10px] font-medium"
            :style="
              product.stocked
                ? { background: 'var(--p-primary)', color: 'var(--p-text-on-primary)' }
                : { background: tint('--p-text', 10), color: 'var(--p-text-muted)' }
            "
          >
            <ShoppingCart class="size-3" />
            {{ product.stocked ? 'Add to cart' : 'Notify me' }}
          </span>
        </div>
      </div>
    </div>

    <div
      class="flex items-center gap-1.5 rounded-md border-l-2 py-1.5 pr-2 pl-2 text-[10px]"
      :style="{ background: tint('--p-info', 12), borderColor: 'var(--p-info)' }"
    >
      <Truck class="size-3 shrink-0" :style="{ color: 'var(--p-info)' }" />
      <span>Free delivery over $250, and returns stay open for 60 days.</span>
    </div>
  </div>
</template>
