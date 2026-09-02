<script setup lang="ts">
import { Monitor, Moon, Sun } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useThemeStore, type Appearance } from '@/stores/theme'

const theme = useThemeStore()

const options: Array<{ value: Appearance; label: string; icon: typeof Sun; hint: string }> = [
  { value: 'light', label: 'Light', icon: Sun, hint: 'Always use the light palette.' },
  { value: 'dark', label: 'Dark', icon: Moon, hint: 'Always use the dark palette.' },
  {
    value: 'system',
    label: 'System',
    icon: Monitor,
    hint: 'Follow the operating system setting, and switch live when it changes.',
  },
]
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="icon" class="shrink-0" aria-label="Appearance">
        <Sun v-if="theme.mode === 'light'" />
        <Moon v-else />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-60">
      <DropdownMenuLabel>Appearance</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        v-for="option in options"
        :key="option.value"
        class="items-start gap-2"
        :data-active="theme.appearance === option.value ? '' : undefined"
        @select="theme.setAppearance(option.value)"
      >
        <component :is="option.icon" class="mt-0.5" />
        <span class="flex flex-col gap-0.5">
          <span class="flex items-center gap-2 text-sm">
            {{ option.label }}
            <span v-if="theme.appearance === option.value" class="text-primary">•</span>
          </span>
          <span class="text-xs leading-snug text-muted-foreground">{{ option.hint }}</span>
        </span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
