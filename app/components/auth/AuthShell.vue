<script setup lang="ts">
/**
 * The frame every sign-in, sign-up and recovery page sits in.
 *
 * These are the only screens in the app with no palette on them, so they are
 * deliberately quiet: one centered card, the brand mark above it, nothing that
 * competes with the form. The brand mark is also the way out — someone who
 * followed a stale link should never have to hunt for a route back to the
 * generator, which works fine without an account.
 */
import { RouterLink } from 'vue-router'
import BrandMark from '@/components/shell/BrandMark.vue'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

const props = withDefaults(
  defineProps<{
    /** Heading inside the card. */
    title: string
    /** One line under the heading saying what happens next. */
    subtitle?: string
    /** Wider card for forms with more than four fields. */
    wide?: boolean
  }>(),
  { subtitle: '', wide: false },
)
</script>

<template>
  <div class="flex w-full flex-1 justify-center px-4 py-10 sm:py-14">
    <div class="w-full" :class="props.wide ? 'max-w-lg' : 'max-w-sm'">
      <RouterLink
        :to="{ name: 'studio' }"
        class="mb-6 flex justify-center rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <BrandMark />
      </RouterLink>

      <Card>
        <CardHeader>
          <CardTitle class="text-lg tracking-tight">{{ props.title }}</CardTitle>
          <CardDescription v-if="props.subtitle" class="leading-relaxed">
            {{ props.subtitle }}
          </CardDescription>
        </CardHeader>

        <CardContent class="flex flex-col gap-4">
          <slot />
        </CardContent>

        <CardFooter v-if="$slots.footer" class="flex-col items-stretch gap-2 border-t text-sm">
          <slot name="footer" />
        </CardFooter>
      </Card>

      <div v-if="$slots.aside" class="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
        <slot name="aside" />
      </div>
    </div>
  </div>
</template>
