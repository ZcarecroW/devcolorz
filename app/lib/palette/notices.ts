import { toast } from 'vue-sonner'

/**
 * Say why generating did nothing.
 *
 * `roll()` and `applyHarmony()` refuse when every swatch is locked — there is
 * no slot they are allowed to write to. The stores hold no UI, so they answer
 * with `false` and the message lives here, shared by all five entry points
 * (the toolbar, the generator panel, the harmony cards, Space, and the command
 * palette) so the explanation is the same wherever the refusal is met.
 */
export function allLockedNotice(): void {
  toast.info('Every color is locked', {
    description: 'Unlock at least one swatch — generating would have nothing to change.',
  })
}

/**
 * Say why a color was not added or removed.
 *
 * The toolbar disables its buttons at the limits, but the `+` and `−` keys
 * and the command palette have no disabled state to show: pressed at forty
 * colors, or at one, they used to do nothing and say nothing.
 */
export function paletteFullNotice(max: number): void {
  toast.info(`The palette is full at ${max} colors`, {
    description: 'Remove one before adding another.',
  })
}

export function lastColorNotice(): void {
  toast.info('That is the last color', {
    description: 'A palette keeps at least one. Generate or adjust it instead of removing it.',
  })
}
