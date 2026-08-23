/**
 * The stored palette document, and the API shapes built around it.
 *
 * This is the contract between the editor, the server and the share link, so it
 * lives in `lib/` rather than beside whichever component happened to need it
 * first. The server treats the document as opaque — it derives a hex index for
 * search and never interprets anything else — which is what keeps the color
 * engine in exactly one implementation.
 *
 * `hex` is mandatory on every entry precisely because the server reads it:
 * posting raw OKLCH objects produces a palette the server records as having
 * zero colors, and the failure looks like a validation error a long way from
 * its cause.
 */

import { bestBlackOrWhite } from '@/lib/color/contrast'
import { formatColor, parseColor } from '@/lib/color/convert'
import type { Oklch } from '@/lib/color/types'
import { encodeState, type PaletteState } from './url'

export type PaletteVisibility = 'private' | 'unlisted' | 'public'

/** One entry of the stored document. */
export interface PaletteDocColor {
  /** Always present, always `#rrggbb`. The only field the server reads. */
  hex: string
  name?: string
  locked?: boolean
  /** OKLCH channels, so wide-gamut colors survive a round trip that hex cannot carry. */
  oklch?: [l: number, c: number, h: number]
}

export interface PaletteDoc {
  version: number
  colors: PaletteDocColor[]
  seed?: number | null
}

export interface PaletteSummary {
  uuid: string
  slug: string
  title: string
  /** Hex strings, already prefixed with `#`. */
  colors: string[]
  colorCount: number
  visibility: PaletteVisibility
  featured?: boolean
  likes: number
  views: number
  updatedAt: number
  createdAt: number
  owner?: { displayName: string }
  /** Present when the endpoint returned the full document. */
  doc?: PaletteDoc | null
}

export interface PaletteDetail extends PaletteSummary {
  description: string
  liked: boolean
}

export interface PaletteListResponse {
  items: PaletteSummary[]
  nextCursor: string | null
}

export const VISIBILITY_ORDER: PaletteVisibility[] = ['private', 'unlisted', 'public']

export const VISIBILITY_LABELS: Record<PaletteVisibility, string> = {
  private: 'Private',
  unlisted: 'Unlisted',
  public: 'Public',
}

/** One line each, shown inside the selector so the choice is never a guess. */
export const VISIBILITY_HINTS: Record<PaletteVisibility, string> = {
  private: 'Only you can open it, even with the link.',
  unlisted: 'Anyone with the link can open it; it stays out of Explore and search.',
  public: 'Listed in Explore, likeable, and indexable by search engines.',
}

/**
 * Pack editor state into a document the server will accept.
 *
 * Both `hex` and the OKLCH channels are written: hex is what the server
 * indexes and what every other tool understands, while the channels preserve a
 * color that hex would have to clip.
 */
export function docFromState(state: PaletteState): PaletteDoc {
  return {
    version: 1,
    colors: state.colors.map((color, index) => ({
      hex: formatColor(color, 'hex'),
      name: state.names[index] ?? '',
      locked: Boolean(state.locks[index]),
      oklch: [
        Number((color.l ?? 0).toFixed(5)),
        Number((color.c ?? 0).toFixed(5)),
        Number((color.h ?? 0).toFixed(3)),
      ] as [number, number, number],
    })),
    seed: state.seed ?? null,
  }
}

/**
 * Unpack a stored palette back into editor state.
 *
 * Prefers the document, which carries names, locks and full-precision channels,
 * and falls back to the flat hex list the grid endpoints return — so "open in
 * generator" works from a card that never fetched the full record.
 */
export function stateFromPalette(item: PaletteSummary): PaletteState | null {
  const read = (entries: ReadonlyArray<PaletteDocColor | string>) => {
    const colors: Oklch[] = []
    const names: string[] = []
    const locks: boolean[] = []
    for (const entry of entries) {
      // A document written by another client may hold bare hex strings rather
      // than our objects. The API stores whatever it is given, so this reads
      // both rather than returning "no readable colors" for a palette whose
      // colors are perfectly readable.
      const doc: PaletteDocColor = typeof entry === 'string' ? { hex: entry } : entry
      // The stored channels win when they are there: hex has already lost
      // anything outside sRGB, and re-parsing it would bake that loss in.
      const parsed = doc?.oklch
        ? ({ mode: 'oklch', l: doc.oklch[0], c: doc.oklch[1], h: doc.oklch[2] } satisfies Oklch)
        : parseColor(doc?.hex as string)
      if (!parsed) continue
      colors.push(parsed)
      names.push(doc?.name ?? '')
      locks.push(Boolean(doc?.locked))
    }
    return { colors, names, locks }
  }

  // The document first, for names, locks and full-precision channels; the flat
  // hex list as the fallback, so a card that never fetched the full record —
  // or one whose document cannot be read — still opens.
  const fromDoc = read(item.doc?.colors ?? [])
  const { colors, names, locks } = fromDoc.colors.length ? fromDoc : read(item.colors ?? [])

  if (!colors.length) return null
  return { colors, locks, names, seed: item.doc?.seed ?? null }
}

/**
 * Encode a stored palette for the studio's `/p/:state` route.
 *
 * Opening a palette goes through the URL rather than through the store because
 * the studio re-initialises itself from the route on mount; handing it the
 * state directly would only get overwritten, and this way the address bar ends
 * up holding a share link for whatever is on screen.
 */
export async function encodeForGenerator(item: PaletteSummary): Promise<string | null> {
  const state = stateFromPalette(item)
  return state ? encodeState(state) : null
}

/** A hex, its CSS form, and the black-or-white that stays legible on it. */
export interface PaletteBand {
  hex: string
  css: string
  text: string
}

export function bandsFor(hexes: string[]): PaletteBand[] {
  const out: PaletteBand[] = []
  for (const hex of hexes) {
    const parsed = parseColor(hex)
    if (!parsed) continue
    out.push({
      hex: formatColor(parsed, 'hex'),
      css: formatColor(parsed, 'oklch'),
      text: formatColor(bestBlackOrWhite(parsed), 'oklch'),
    })
  }
  return out
}

const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3600],
  ['minute', 60],
]

/** Unix seconds to "3 days ago", in the visitor's locale. */
export function relativeTime(unixSeconds: number): string {
  const delta = unixSeconds - Date.now() / 1000
  const magnitude = Math.abs(delta)
  for (const [unit, size] of UNITS) {
    if (magnitude >= size) return RELATIVE.format(Math.round(delta / size), unit)
  }
  return RELATIVE.format(Math.round(delta), 'second')
}
