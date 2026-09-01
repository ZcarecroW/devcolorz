/**
 * Encoding palette state into a URL.
 *
 * Two representations, chosen automatically:
 *
 *   • **hex list** — `264653-2a9d8f-e9c46a`. Lossy (no locks, names or
 *     generator settings) but human-readable, hand-editable and compatible
 *     with the format every other palette tool uses. Emitted whenever the
 *     palette carries nothing else worth keeping.
 *   • **packed blob** — a versioned JSON document, deflate-compressed when it
 *     helps, in base64url. Carries everything.
 *
 * State lives in the URL *fragment*, never the query string: fragments are not
 * sent to the server, so palettes never appear in access logs, and a shared
 * link cannot leak through a `Referer` header.
 */

import { formatColor, parseColor } from '@/lib/color/convert'
import type { Oklch } from '@/lib/color/types'

export interface PaletteState {
  colors: Oklch[]
  locks: boolean[]
  names: string[]
  /** Generator seed, so a shared link reproduces the exact roll. */
  seed?: number | null
  /** Opaque extras (constraints, harmony settings) round-tripped verbatim. */
  extra?: Record<string, unknown>
}

// Six digits, or eight when a colour carries alpha. Links written before
// alpha was preserved are all six, and still read.
const HEX_LIST = /^[0-9a-f]{6}(?:[0-9a-f]{2})?(-[0-9a-f]{6}(?:[0-9a-f]{2})?)*$/i

/* ------------------------------------------------------------------ *
 * base64url
 * ------------------------------------------------------------------ */

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') return bytes
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') return bytes
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/* ------------------------------------------------------------------ *
 * Encoding
 * ------------------------------------------------------------------ */

/** True when a hex list would lose nothing. */
function isPlain(state: PaletteState): boolean {
  return (
    state.locks.every((l) => !l) &&
    state.names.every((n) => !n) &&
    !state.extra &&
    (state.seed === undefined || state.seed === null)
  )
}

/**
 * `rrggbb`, or `rrggbbaa` when the colour is not fully opaque.
 *
 * The adjust dialog has an alpha slider and a checkerboard to show the result,
 * and every persistence path wrote six digits — so a translucent swatch came
 * back opaque from a reload, a share link, or the library, with nothing said.
 */
function hexDigits(color: Oklch): string {
  const alpha = color.alpha ?? 1
  return formatColor(color, alpha < 1 ? 'hexa' : 'hex').slice(1)
}

export function encodeHexList(colors: Oklch[]): string {
  return colors.map(hexDigits).join('-')
}

/**
 * Encode palette state for the URL fragment.
 *
 * `v1` is the compressed form; the prefix is part of the payload so a future
 * format change cannot be mistaken for corrupt data.
 */
/**
 * The OKLCH channels, rounded to what a link can afford.
 *
 * Five decimals of lightness and chroma and three of hue are finer than any
 * display can show, and far finer than the six hex digits the packed blob
 * used to be the only carrier of — which clipped every wide-gamut colour to
 * sRGB on the way through a link that claimed to carry everything.
 */
function channels(color: Oklch): number[] {
  const round = (value: number | undefined, places: number) =>
    Number((value ?? 0).toFixed(places))
  const out = [round(color.l, 5), round(color.c, 5), round(color.h, 3)]
  if (color.alpha !== undefined && color.alpha < 1) out.push(round(color.alpha, 4))
  return out
}

export async function encodeState(state: PaletteState): Promise<string> {
  if (isPlain(state)) return encodeHexList(state.colors)

  const doc = {
    v: 1,
    // The hex list stays so a reader from before `o` existed still gets the
    // colours; a current reader prefers the channels.
    c: state.colors.map(hexDigits),
    o: state.colors.map(channels),
    l: state.locks.map((l) => (l ? 1 : 0)),
    n: state.names,
    s: state.seed ?? null,
    x: state.extra ?? null,
  }
  const json = new TextEncoder().encode(JSON.stringify(doc))
  // Below roughly 150 bytes deflate's header costs more than it saves.
  const packed = json.length > 150 ? await deflate(json) : json
  const flag = packed === json ? 'r' : 'z'
  return `v1${flag}${toBase64Url(packed)}`
}

/** A colour from a packed document's channel tuple, or null when it is not one. */
function fromChannels(tuple: unknown): Oklch | null {
  if (!Array.isArray(tuple) || tuple.length < 3) return null
  const [l, c, h, alpha] = tuple as unknown[]
  if (![l, c, h].every((v) => typeof v === 'number' && Number.isFinite(v))) return null
  const color: Oklch = { mode: 'oklch', l: l as number, c: c as number, h: h as number }
  if (typeof alpha === 'number' && Number.isFinite(alpha) && alpha < 1) {
    color.alpha = Math.max(0, alpha)
  }
  return color
}

export async function decodeState(value: string): Promise<PaletteState | null> {
  // A stray `%` in a hand-edited or truncated link is not a palette, and it
  // is not an exception either: every other unreadable input here is a null.
  let raw: string
  try {
    raw = decodeURIComponent(value.trim().replace(/^#/, ''))
  } catch {
    return null
  }
  if (!raw) return null

  if (HEX_LIST.test(raw)) {
    const colors = raw
      .split('-')
      .map((hex) => parseColor(`#${hex}`))
      .filter((c): c is Oklch => c !== null)
    if (!colors.length) return null
    return { colors, locks: colors.map(() => false), names: colors.map(() => '') }
  }

  const match = /^v1([rz])(.+)$/.exec(raw)
  if (!match) return null
  try {
    const bytes = fromBase64Url(match[2])
    const json = match[1] === 'z' ? await inflate(bytes) : bytes
    const doc = JSON.parse(new TextDecoder().decode(json)) as {
      v: number
      c: string[]
      o?: unknown[]
      l?: number[]
      n?: string[]
      s?: number | null
      x?: Record<string, unknown> | null
    }
    if (doc.v !== 1 || !Array.isArray(doc.c)) return null
    // Kept in step by index: a colour whose hex cannot be read is dropped along
    // with its lock and name, so those never slide onto the next colour.
    const entries = doc.c
      .map((hex, i) => ({ color: fromChannels(doc.o?.[i]) ?? parseColor(`#${hex}`), i }))
      .filter((entry): entry is { color: Oklch; i: number } => entry.color !== null)
    if (!entries.length) return null
    return {
      colors: entries.map((entry) => entry.color),
      locks: entries.map((entry) => Boolean(doc.l?.[entry.i])),
      names: entries.map((entry) => doc.n?.[entry.i] ?? ''),
      seed: doc.s ?? null,
      extra: doc.x ?? undefined,
    }
  } catch {
    return null
  }
}

/** Read whatever palette the current URL carries, if any. */
export async function readFromLocation(): Promise<PaletteState | null> {
  if (typeof location === 'undefined') return null
  const hash = location.hash.replace(/^#\/?/, '')
  const match = /(?:^|\/)p\/([^/?#]+)/.exec(hash)
  if (match) return decodeState(match[1])
  return null
}
