/**
 * What a tab knows about the palette in its own address bar.
 *
 * The studio rewrites the URL as you work, so after a reload the palette
 * arrives through the same door as a colleague's link — with nothing to say
 * whether it is the record saved a minute ago as "Harbour" or a stranger's.
 * The pages that hand a palette to the studio, and the studio itself, leave a
 * note here beside the link they wrote: which saved record it is, its title,
 * and whether it has changed since it was saved. A link that arrives without
 * a matching note is foreign, and is treated as one.
 *
 * Session storage, deliberately: it is per tab and survives a reload, which is
 * exactly the distinction. Local storage would let one tab's palette claim
 * another tab's saved record.
 */

export interface PaletteIdentity {
  /** The saved record this palette is, or null when it has never been saved. */
  uuid: string | null
  title: string
  /** True when the palette has changed since it was last saved. */
  dirty: boolean
}

const KEY = 'devcolorz:own-link'

/** Leave the note beside `state`, replacing whatever was there. */
export function rememberLink(state: string, identity: PaletteIdentity): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ state, ...identity }))
  } catch {
    // Without storage every reload reads as a foreign link, which is the safe
    // way round: a palette is never mistaken for a saved record it is not.
  }
}

/** The note beside `state`, or null when this tab never wrote that link. */
export function identityFor(state: string): PaletteIdentity | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const note = JSON.parse(raw) as Partial<PaletteIdentity> & { state?: unknown }
    if (note.state !== state) return null
    return {
      uuid: typeof note.uuid === 'string' && note.uuid !== '' ? note.uuid : null,
      title: typeof note.title === 'string' ? note.title : '',
      dirty: Boolean(note.dirty),
    }
  } catch {
    return null
  }
}
