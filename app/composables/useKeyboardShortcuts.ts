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
import { allLockedNotice, lastColorNotice, paletteFullNotice } from '@/lib/palette/notices'
import { MAX_SWATCHES, usePaletteStore } from '@/stores/palette'
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

function isRangeInput(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement && target.type === 'range'
}

/**
 * Widgets that swallow Space to activate themselves.
 *
 * A focused `<button>` is activated by Space on *keyup*, and only if the
 * keydown was not default-prevented — so a global `preventDefault()` on Space
 * does not merely add a second meaning to the key, it removes the first one.
 * Tabbing to any control in the studio and pressing Space re-rolled the whole
 * palette instead of pressing the button.
 */
const ACTIVATION_CONSUMERS = [
  'button',
  '[role="button"]',
  '[role="tab"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="option"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="combobox"]',
  'a[href]',
  'summary',
].join(', ')

/**
 * Widgets where a printable key jumps to a matching entry.
 *
 * Narrower than the activation list on purpose. Treating every focusable
 * control as a typeahead target took away `r`, `l`, `d`, `[` and `]` from
 * anyone whose focus happened to be resting on a tab or a button — which,
 * after clicking a panel tab, is everyone.
 */
const TYPEAHEAD_CONSUMERS = [
  '[role="combobox"]',
  '[role="listbox"]',
  '[role="option"]',
  '[role="menu"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="slider"]',
  '[role="spinbutton"]',
].join(', ')

function ownsKey(target: EventTarget | null, selector: string): boolean {
  return target instanceof HTMLElement && target.closest(selector) !== null
}

/** True inside a dialog, menu or listbox, where the studio's keys do not belong. */
function inOverlay(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]') !== null
  )
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
    // Every button that copies handles a refused clipboard; these two
    // shortcuts were the only paths that let the rejection go nowhere, which is
    // the worst place for it — a keyboard user gets no visual answer at all.
    try {
      await navigator.clipboard.writeText(`:root {\n${css}\n}`)
      toast.success('CSS copied')
    } catch {
      toast.error('Could not reach the clipboard', {
        description: 'Your browser blocked it. Use Export to select the CSS and copy it manually.',
      })
    }
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
    const image = items
      ? Array.from(items).find((item) => item.kind === 'file' && item.type.startsWith('image/'))
      : undefined
    if (image) {
      // The Image panel takes it itself while it is on screen. Anywhere else
      // in the studio the file is parked with the store, which opens the
      // panel — the panel collects it as it mounts.
      if (document.querySelector('[data-image-panel]')) return
      const file = image.getAsFile()
      if (!file) return
      event.preventDefault()
      studio.stashPastedImage(file)
      return
    }

    const text = event.clipboardData?.getData('text/plain') ?? ''
    if (!text.trim()) return
    const count = palette.importFromText(text)
    if (count) {
      event.preventDefault()
      toast.success(`Imported ${count} colors`)
    }
  }

  function onKeydown(event: KeyboardEvent) {
    const mod = event.ctrlKey || event.metaKey
    // A slider has no text to protect, so the modifier chords stay available
    // on it — a keyboard user could not undo a channel adjustment without
    // first tabbing off the slider they had just made it on.
    if (isTypingTarget(event.target) && !(mod && isRangeInput(event.target))) return

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
            void palette
              .shareUrl()
              .then(async (url) => {
                await navigator.clipboard.writeText(url)
                toast.success('Link copied')
              })
              .catch(() => {
                toast.error('Could not reach the clipboard', {
                  description: 'Your browser blocked it. The link is in the address bar.',
                })
              })
          }
          return
        default:
          return
      }
    }

    // Modifier chords stay global — no browser activates a button with Ctrl+Z.
    // Below this line the keys are unmodified, so an open overlay owns them.
    if (studio.commandOpen || studio.shortcutsOpen || inOverlay(event.target)) {
      return
    }
    // A typeahead widget owns every printable key; everything else only owns
    // the key it is actually activated with.
    if (ownsKey(event.target, TYPEAHEAD_CONSUMERS)) return

    switch (event.key) {
      case ' ':
        // Space belongs to the focused control, if there is one.
        if (ownsKey(event.target, ACTIVATION_CONSUMERS)) return
        event.preventDefault()
        if (!palette.roll()) allLockedNotice()
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
        if (!palette.addSwatch()) paletteFullNotice(MAX_SWATCHES)
        return
      case '-':
      case '_': {
        const last = [...palette.swatches].reverse().find((s) => !s.locked)
        if (!last) {
          allLockedNotice()
          return
        }
        if (!palette.removeSwatch(last.id)) lastColorNotice()
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
