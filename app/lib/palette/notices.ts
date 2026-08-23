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
