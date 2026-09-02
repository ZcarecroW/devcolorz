<script setup lang="ts">
/**
 * A link to MILELO, the school this project's author supports.
 *
 * A hover card rather than a plain tooltip: a tooltip is for naming a control,
 * and this needs to say enough that someone who has never heard of MILELO
 * understands what they would be visiting. It opens on focus as well as hover,
 * so it is not mouse-only, and the trigger is a real link — the card is an
 * explanation of where it goes, never the only way to get there.
 */
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { MILELO_ICON, MILELO_URL } from '@/lib/milelo'

const FACTS = [
  { label: 'Where', value: 'Kijenge, Arusha — Tanzania' },
  { label: 'Since', value: 'January 2026, one first-grade class of 30' },
  { label: 'Run by', value: 'A local school management team and teachers' },
]
</script>

<template>
  <HoverCard :open-delay="150" :close-delay="120">
    <HoverCardTrigger as-child>
      <a
        :href="MILELO_URL"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex size-9 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label="MILELO School in Arusha, Tanzania — free education, free meals (opens in a new tab)"
      >
        <!--
          The wordmark is the whole point of the mark, so it is not tinted to
          match the chrome. `alt` is empty because the link's own label already
          names the destination; repeating it would make a screen reader say it
          twice.
        -->
        <img :src="MILELO_ICON" alt="" class="size-5 rounded-full" width="20" height="20" />
      </a>
    </HoverCardTrigger>

    <HoverCardContent align="end" class="w-80">
      <div class="flex flex-col gap-3">
        <div class="flex items-center gap-2.5">
          <img :src="MILELO_ICON" alt="" class="size-9 shrink-0 rounded-full" width="36" height="36" />
          <div class="min-w-0">
            <p class="text-sm font-semibold tracking-tight">MILELO School</p>
            <p class="text-xs text-muted-foreground">
              Free education, free meals, English focus, led locally
            </p>
          </div>
        </div>

        <p class="text-xs leading-relaxed text-muted-foreground">
          A primary school in Arusha, Tanzania, for children who would otherwise not be in one.
          Lessons and meals cost the families nothing. Donations are raised in Germany through
          <span class="font-medium text-foreground">Education is Light e.V.</span>, a registered
          non-profit run entirely by volunteers, and all of it reaches the school.
        </p>

        <dl class="flex flex-col gap-1 text-xs">
          <div v-for="fact in FACTS" :key="fact.label" class="flex gap-2">
            <dt class="w-14 shrink-0 text-muted-foreground">{{ fact.label }}</dt>
            <dd class="min-w-0 flex-1">{{ fact.value }}</dd>
          </div>
        </dl>

        <p class="text-xs font-medium">
          milelo.de
          <span class="font-normal text-muted-foreground">— read more, or sponsor a place.</span>
        </p>
      </div>
    </HoverCardContent>
  </HoverCard>
</template>
