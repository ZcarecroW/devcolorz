/**
 * Global keyboard shortcuts for the studio.
 *
 * Three rules learned the hard way:
 *
 * 1. **Never fire while the user is typing.** Space is the generate key and
 *    also the most common character in a name field.
 * 2. **Do not fight the browser.** Ctrl+S and Ctrl+P belong to the browser;
 *    save and palettes get the Shift variants instead.
 * 3. **Preventing the default has to be explicit.** Space scrolls the page
 *    unless we say otherwise, and a listener registered as passive cannot.
 */

import { onBeforeUnmount, onMounted } from 'vue'
import { toast } from 'vue-sonner'
import { usePaletteStore } from '@/stores/palette'
import { useStudioStore } from '@/stores/studio'
import { useThemeStore } from '@/stores/theme'

export interface ShortcutDef {
  keys: string[]
  label: string
  group: 'Generate' | 'Palette' | 'View' | 'Clipboard'
}

export const SHORTCUTS: ShortcutDef[] = [
  { keys: ['Space'], label: 'Generate new colors for every unlocked swatch', group: 'Generate' },
  { keys: ['R'], label: 'Re-roll the hovered color', group: 'Generate' },
  { keys: ['L'], label: 'Lock or unlock the hovered color', group: 'Generate' },
  { keys: ['Shift', 'L'], label: 'Lock every color', group: 'Generate' },
  { keys: ['Shift', 'U'], label: 'Unlock every color', group: 'Generate' },
  { keys: ['Shift', 'I'], label: 'Invert every lock', group: 'Generate' },
  { keys: ['+'], label: 'Add a color', group: 'Palette' },
  { keys: ['−'], label: 'Remove the last unlocked color', group: 'Palette' },
  { keys: ['S'], label: 'Shuffle the order', group: 'Palette' },
  { keys: ['Ctrl', 'Z'], label: 'Undo', group: 'Palette' },
  { keys: ['Ctrl', 'Shift', 'Z'], label: 'Redo', group: 'Palette' },
  { keys: ['Ctrl', 'Shift', 'C'], label: 'Copy the palette as CSS', group: 'Clipboard' },
  { keys: ['Ctrl', 'Shift', 'L'], label: 'Copy the share link', group: 'Clipboard' },
  { keys: ['Ctrl', 'V'], label: 'Paste colors, or an image, from the clipboard', group: 'Clipboard' },
  { keys: ['Ctrl', 'K'], label: 'Open the command palette', group: 'View' },
  { keys: ['['], label: 'Show or hide the controls', group: 'View' },
  { keys: [']'], label: 'Show or hide the previews', group: 'View' },
  { keys: ['D'], label: 'Toggle dark mode', group: 'View' },
  { keys: ['?'], label: 'Show this list', group: 'View' },
]

/** True when focus is somewhere that should receive the keystroke itself. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/** The swatch element under the pointer, for the hover-scoped shortcuts. */
function hoveredSwatchId(): string | null {
  const element = document.querySelector('[data-swatch-id]:hover')
  return element?.getAttribute('data-swatch-id') ?? null
}

export function useKeyboardShortcuts() {
  const palette = usePaletteStore()
  const studio = useStudioStore()
  const theme = useThemeStore()

  async function copyCss() {
    const css = palette.swatches
      .map((s, i) => `  --color-${s.name ? s.name.toLowerCase().replace(/\W+/g, '-') : i + 1}: ${
        palette.hexes[i]
      };`)
      .join('\n')
    await navigator.clipboard.writeText(`:root {\n${css}\n}`)
    toast.success('CSS copied')
  }

  /**
   * Import colors from pasted text.
   *
   * Bound to the `paste` event rather than to Ctrl+V, and it steps aside when
   * the clipboard carries an image: pasting a screenshot is meant for the image
   * panel, and handling both produced a spurious "no colors found" every time.
   */
  function onPaste(event: ClipboardEvent) {
    if (isTypingTarget(event.target)) return
    const items = event.clipboardData?.items
    if (items && Array.from(items).some((item) => item.type.startsWith('image/'))) return

    const text = event.clipboardData?.getData('text/plain') ?? ''
    if (!text.trim()) return
    const count = palette.importFromText(text)
    if (count) {
      event.preventDefault()
      toast.success(`Imported ${count} colors`)
    }
  }

  function onKeydown(event: KeyboardEvent) {
    if (isTypingTarget(event.target)) return
    const mod = event.ctrlKey || event.metaKey

    if (mod) {
      switch (event.key.toLowerCase()) {
        case 'z':
          event.preventDefault()
          if (event.shiftKey) palette.redo()
          else palette.undo()
          return
        case 'y':
          event.preventDefault()
          palette.redo()
          return
        case 'k':
          event.preventDefault()
          studio.commandOpen = !studio.commandOpen
          return
        case 'c':
          if (event.shiftKey) {
            event.preventDefault()
            void copyCss()
          }
          return
        case 'l':
          if (event.shiftKey) {
            event.preventDefault()
            void palette.shareUrl().then(async (url) => {
              await navigator.clipboard.writeText(url)
              toast.success('Link copied')
            })
          }
          return
        default:
          return
      }
    }

    switch (event.key) {
      case ' ':
        event.preventDefault()
        palette.roll()
        return
      case '?':
        studio.shortcutsOpen = true
        return
      case '[':
        studio.leftPanelOpen = !studio.leftPanelOpen
        return
      case ']':
        studio.rightPanelOpen = !studio.rightPanelOpen
        return
      case '+':
      case '=':
        palette.addSwatch()
        return
      case '-':
      case '_': {
        const last = [...palette.swatches].reverse().find((s) => !s.locked)
        if (last) palette.removeSwatch(last.id)
        return
      }
    }

    switch (event.key.toLowerCase()) {
      case 'r': {
        const id = hoveredSwatchId()
        if (id) palette.rollOne(id)
        return
      }
      case 'l': {
        if (event.shiftKey) {
          palette.setAllLocks(true)
          return
        }
        const id = hoveredSwatchId()
        if (id) palette.toggleLock(id)
        return
      }
      case 'u':
        if (event.shiftKey) palette.setAllLocks(false)
        return
      case 'i':
        if (event.shiftKey) palette.invertLocks()
        return
      case 's':
        palette.shuffle()
        return
      case 'd':
        theme.toggleAppearance()
        return
    }
  }

  onMounted(() => {
    // Not passive: Space scrolls the page unless the handler can prevent it.
    window.addEventListener('keydown', onKeydown, { passive: false })
    window.addEventListener('paste', onPaste)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown)
    window.removeEventListener('paste', onPaste)
  })

  return { copyCss }
}
