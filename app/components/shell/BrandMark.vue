<script setup lang="ts">
/**
 * The wordmark.
 *
 * The three overlapping dots are painted from live theme tokens, so the logo
 * re-colours with whatever theme the user has built. A logo that ignores the
 * theme would be an odd thing to ship in a theming tool.
 */
</script>

<template>
  <!--
    The wordmark is the one thing in the header allowed to give way: it
    truncates when the row is short of room, and steps out entirely on the
    narrowest screens, so the marks beside it are never the ones squeezed.
  -->
  <span class="flex min-w-0 items-center gap-2">
    <svg viewBox="0 0 32 32" class="size-7 shrink-0" aria-hidden="true">
      <rect width="32" height="32" rx="8" class="fill-foreground/8" />
      <circle cx="12.5" cy="13" r="6.2" fill="var(--chart-1)" opacity="0.95" />
      <circle cx="19.5" cy="13" r="6.2" fill="var(--chart-2)" opacity="0.8" />
      <circle cx="16" cy="19.5" r="6.2" fill="var(--chart-3)" opacity="0.8" />
    </svg>
    <span class="hidden min-w-0 truncate text-[15px] font-semibold tracking-tight min-[340px]:block">
      Dev<span class="text-primary">Colorz</span>
    </span>
  </span>
</template>
