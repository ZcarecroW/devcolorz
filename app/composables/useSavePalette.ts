/**
 * Saving the palette on screen to the signed-in user's library.
 *
 * One implementation for the toolbar button, the command palette and the
 * keyboard shortcut, so all three agree on what "save" means: overwrite the
 * record this palette was opened from, or create a new one when there is none.
 * The in-flight flag lives at module level so the three entry points share it
 * and a double press cannot create two palettes.
 */

import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'
import { ApiError, api } from '@/lib/api'
import { docFromState, type PaletteSummary } from '@/lib/palette/document'
import { router } from '@/router'
import { usePaletteStore } from '@/stores/palette'
import { useSessionStore } from '@/stores/session'

const saving = ref(false)

export interface SaveOptions {
  /** Always create a new record, leaving the one this palette came from alone. */
  asNew?: boolean
}

export function useSavePalette() {
  const palette = usePaletteStore()
  const session = useSessionStore()

  /** Whether there is a library to save to at all — a backend, installed. */
  const available = computed(() => Boolean(session.meta?.installed))
  const signedIn = computed(() => session.isAuthenticated)
  /** True when the palette on screen is a saved record, not just a link. */
  const savedHere = computed(() => palette.paletteUuid !== null)
  /** True when saving would change nothing. */
  const upToDate = computed(() => savedHere.value && !palette.dirty)

  function describe(error: unknown): string {
    if (error instanceof ApiError) return error.reason
    return 'Could not reach the server. The palette is still in the address bar.'
  }

  async function save(options: SaveOptions = {}): Promise<void> {
    if (saving.value) return
    if (!available.value) {
      toast.info('There is no library on this copy', {
        description: 'Saving needs the backend. The share link carries the whole palette instead.',
      })
      return
    }
    if (!signedIn.value) {
      // The palette rides along in the address the sign-in form comes back
      // to, so nothing on screen is lost by leaving to sign in.
      toast.info('Sign in to save to your library', {
        description: 'Your palette comes back with you.',
      })
      await router.push({
        name: 'login',
        query: { redirect: router.currentRoute.value.fullPath },
      })
      return
    }
    if (!palette.count) {
      toast.error('There is nothing to save yet')
      return
    }

    saving.value = true
    const title = palette.title.trim()
    const doc = docFromState(palette.toState())
    try {
      if (palette.paletteUuid && !options.asNew) {
        try {
          // The title goes along only when there is one: an emptied box
          // should not blank the name the record already has.
          const updated = await api.patch<PaletteSummary>(`/palettes/${palette.paletteUuid}`, {
            doc,
            ...(title ? { title } : {}),
          })
          palette.markSaved(updated.uuid, updated.title)
          toast.success('Saved', { description: `“${updated.title}” is up to date in your library.` })
          return
        } catch (error) {
          // The record was deleted meanwhile, or was never this account's —
          // the server answers 404 to both. A fresh copy is the useful answer;
          // anything else is a real failure.
          if (!(error instanceof ApiError && error.status === 404)) throw error
        }
      }
      const created = await api.post<PaletteSummary>('/palettes', {
        title,
        doc,
        visibility: 'private',
      })
      palette.markSaved(created.uuid, created.title)
      toast.success('Saved to your library', {
        description: 'Private until you say otherwise. Save again to overwrite it.',
      })
    } catch (error) {
      if (error instanceof ApiError && error.isUnauthorized) {
        // The session ended underneath us; the header would otherwise go on
        // showing an account that can no longer save.
        session.user = null
      }
      toast.error('That palette could not be saved', { description: describe(error) })
    } finally {
      saving.value = false
    }
  }

  return { saving, available, signedIn, savedHere, upToDate, save }
}
