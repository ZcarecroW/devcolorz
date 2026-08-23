<script setup lang="ts">
/**
 * The keyboard cheat sheet, opened with `?` or the toolbar's help button.
 *
 * It reads `SHORTCUTS` straight from the composable that implements the
 * bindings rather than restating them here, so the sheet cannot drift out of
 * sync with what the keys actually do.
 */
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { SHORTCUTS, type ShortcutDef } from '@/composables/useKeyboardShortcuts'
import { useStudioStore } from '@/stores/studio'

const studio = useStudioStore()

/** Grouped in the order the groups first appear, so the list reads top-down. */
const groups: Array<{ heading: ShortcutDef['group']; items: ShortcutDef[] }> = []
for (const shortcut of SHORTCUTS) {
  const existing = groups.find((group) => group.heading === shortcut.group)
  if (existing) existing.items.push(shortcut)
  else groups.push({ heading: shortcut.group, items: [shortcut] })
}

const KEY_CLASS =
  'inline-flex h-5 min-w-5 items-center justify-center rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground'
</script>

<template>
  <Dialog v-model:open="studio.shortcutsOpen">
    <DialogContent class="max-h-[85vh] gap-3 overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Keyboard shortcuts</DialogTitle>
        <DialogDescription>
          Shortcuts are suppressed while the cursor is in a text field, so Space types a space
          when you are naming a color and generates a palette everywhere else. Press Escape to
          leave a field, then the keys below apply again.
        </DialogDescription>
      </DialogHeader>

      <div class="grid gap-x-8 gap-y-5 sm:grid-cols-2">
        <section v-for="group in groups" :key="group.heading" class="flex flex-col gap-1.5">
          <h3 class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {{ group.heading }}
          </h3>
          <dl class="flex flex-col gap-1">
            <div
              v-for="shortcut in group.items"
              :key="shortcut.keys.join('+')"
              class="flex items-baseline justify-between gap-3"
            >
              <!-- Term then definition: inside a `dl` group the `dt` comes
                   first, and the flex row still renders label-left. -->
              <dt class="text-sm leading-snug text-foreground">{{ shortcut.label }}</dt>
              <dd class="flex shrink-0 items-center gap-0.5">
                <template v-for="(key, index) in shortcut.keys" :key="key">
                  <span v-if="index > 0" class="text-[10px] text-muted-foreground">+</span>
                  <kbd :class="KEY_CLASS">{{ key }}</kbd>
                </template>
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <p class="text-xs leading-relaxed text-muted-foreground">
        Hover a swatch before pressing <kbd :class="KEY_CLASS">R</kbd> or
        <kbd :class="KEY_CLASS">L</kbd> — those two act on the color under the pointer, not on
        the selection. Ctrl and Cmd are interchangeable.
      </p>
    </DialogContent>
  </Dialog>
</template>
