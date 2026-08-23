<script setup lang="ts">
/**
 * The explanatory tooltip used throughout the app.
 *
 * Colour tooling is full of choices that look arbitrary until someone explains
 * the trade-off, so almost every control here carries one of these. It opens on
 * hover *and* on focus, and it uses a popover rather than a title attribute so
 * the content can be several sentences long and still be reachable by keyboard
 * and screen reader.
 */
import { ref } from 'vue'
import { Info } from '@lucide/vue'
import {
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from 'reka-ui'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    /** Short heading shown in bold above the body. */
    title?: string
    /** The explanation. Long is fine — that is the point. */
    text?: string
    side?: 'top' | 'right' | 'bottom' | 'left'
    align?: 'start' | 'center' | 'end'
    /** Widen for tooltips that carry a worked example. */
    wide?: boolean
    class?: string
    /** Delay before opening, in ms. */
    delay?: number
  }>(),
  { side: 'top', align: 'center', delay: 180 },
)

const open = ref(false)
</script>

<template>
  <TooltipProvider :delay-duration="props.delay" :skip-delay-duration="300">
    <TooltipRoot v-model:open="open">
      <TooltipTrigger as-child>
        <button
          type="button"
          :class="
            cn(
              // 24px of target, 16px of ink. The icon keeps the size the dense
              // panels are laid out around, while the box a finger has to hit
              // is the 24px minimum; the negative margin gives the extra back
              // to the layout, so nothing moves.
              'inline-flex size-6 -m-1 p-1 shrink-0 cursor-help items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:text-foreground',
              props.class,
            )
          "
          :aria-label="props.title ? `About ${props.title}` : 'More information'"
          @click.stop.prevent
        >
          <slot name="trigger">
            <Info class="size-3.5" />
          </slot>
        </button>
      </TooltipTrigger>
      <!--
        Portalled to the body. Rendered in place, the tooltip is a descendant
        of the toolbar, and the swatch strip is a later sibling — so the strip
        painted straight over it and a tooltip opened from the toolbar was
        unreadable. z-index cannot fix that across separate stacking contexts;
        leaving the DOM subtree can.
      -->
      <TooltipPortal>
        <TooltipContent
        :side="props.side"
        :align="props.align"
        :side-offset="6"
        :collision-padding="12"
        :class="
          cn(
            'z-50 rounded-lg border bg-popover px-3 py-2.5 text-popover-foreground shadow-lg',
            'origin-(--reka-tooltip-content-transform-origin)',
            'data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
            'data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1',
            'data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1',
            'duration-150 ease-out',
            props.wide ? 'max-w-md' : 'max-w-xs',
          )
        "
      >
        <p v-if="props.title" class="mb-1 text-xs font-semibold tracking-tight">{{ props.title }}</p>
        <slot>
          <p class="text-xs leading-relaxed text-muted-foreground">{{ props.text }}</p>
        </slot>
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>
