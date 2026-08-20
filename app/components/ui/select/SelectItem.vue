<script setup lang="ts">
/**
 * A select option.
 *
 * Extended from the stock shadcn-vue component with `label` and `description`,
 * because almost every select in this app explains its options and the stock
 * component cannot carry that.
 *
 * The reason it cannot is worth stating: reka-ui shows the selected option in
 * the trigger by copying the *text content* of `SelectItemText`. Put a label
 * and a paragraph of explanation inside it — the obvious thing to do — and the
 * closed trigger reads "OKLCH perceptual wide gamut Perceptually uniform polar
 * space. Equal steps in lightness…". So only the label goes inside
 * `SelectItemText`; the description sits beside it, visible in the open list
 * and absent from the trigger.
 *
 * Pass `label` and `description` for an explained option, or use the default
 * slot alone for a plain one.
 */
import type { SelectItemProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { Check } from "@lucide/vue"
import { reactiveOmit } from "@vueuse/core"
import {
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  useForwardProps,
} from "reka-ui"
import { cn } from "@/lib/utils"

const props = defineProps<
  SelectItemProps & {
    class?: HTMLAttributes["class"]
    /** Shown in the list and, alone, in the closed trigger. */
    label?: string
    /** Shown only in the open list. */
    description?: string
  }
>()

const delegatedProps = reactiveOmit(props, "class", "label", "description")

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <SelectItem
    data-slot="select-item"
    v-bind="forwardedProps"
    :class="
      cn(
        `focus:bg-accent focus:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex w-full cursor-default rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4`,
        label === undefined
          ? `items-center gap-2 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2`
          : 'items-start gap-2',
        props.class,
      )
    "
  >
    <span class="absolute right-2 flex size-3.5 items-center justify-center">
      <SelectItemIndicator>
        <slot name="indicator-icon">
          <Check class="size-4" />
        </slot>
      </SelectItemIndicator>
    </span>

    <span v-if="label !== undefined" class="flex min-w-0 flex-col gap-0.5 py-0.5">
      <span class="flex items-center gap-2">
        <SelectItemText>{{ label }}</SelectItemText>
        <slot name="badge" />
      </span>
      <span
        v-if="description"
        class="max-w-[22rem] text-[11px] leading-snug text-wrap text-muted-foreground"
      >
        {{ description }}
      </span>
      <slot />
    </span>

    <SelectItemText v-else>
      <slot />
    </SelectItemText>
  </SelectItem>
</template>
