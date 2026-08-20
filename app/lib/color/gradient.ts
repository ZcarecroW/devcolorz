/**
 * Channel gradients for slider tracks.
 *
 * A slider that shows the colours it selects is worth three that show a grey
 * bar. Each track samples its channel across the full domain, holding every
 * other channel at the midpoint of its own range, so dragging the lightness
 * range repaints the hue track to match.
 */

import { formatColor, fromChannelValues } from './convert'
import { isInGamut } from './gamut'
import { getSpace } from './spaces'
import type { SpaceId } from './types'

/**
 * A CSS gradient across one channel's domain.
 *
 * Out-of-gamut samples are still painted, gamut-mapped, because a track with
 * holes in it reads as broken; the hatch overlay from `gamutGaps` is what
 * communicates the limitation.
 */
export function channelGradient(
  space: SpaceId,
  channelKey: string,
  others: Record<string, number>,
  steps = 24,
): string {
  const def = getSpace(space)
  const channel = def.channels.find((c) => c.key === channelKey)
  if (!channel) return 'var(--muted)'

  const stops: string[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const value = channel.min + t * (channel.max - channel.min)
    const color = fromChannelValues(space, { ...others, [channelKey]: value })
    stops.push(`${formatColor(color, 'oklch')} ${(t * 100).toFixed(2)}%`)
  }
  return `linear-gradient(to right, ${stops.join(', ')})`
}

/**
 * The stretches of a channel that fall outside sRGB, as `[start, end]` pairs
 * in 0–1 track coordinates. Drawn as hatching so the range panel shows which
 * part of the space is aspirational.
 */
export function gamutGaps(
  space: SpaceId,
  channelKey: string,
  others: Record<string, number>,
  steps = 72,
): Array<[number, number]> {
  const def = getSpace(space)
  const channel = def.channels.find((c) => c.key === channelKey)
  if (!channel) return []

  const gaps: Array<[number, number]> = []
  let start: number | null = null
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const value = channel.min + t * (channel.max - channel.min)
    const color = fromChannelValues(space, { ...others, [channelKey]: value })
    const outside = !isInGamut(color)
    if (outside && start === null) start = t
    if (!outside && start !== null) {
      gaps.push([start, t])
      start = null
    }
  }
  if (start !== null) gaps.push([start, 1])
  return gaps
}

/** Midpoint of a range, honouring wrap-around for cyclic channels. */
export function rangeMidpoint(min: number, max: number, cyclic: boolean, wrapAt: number): number {
  if (!cyclic || min <= max) return (min + max) / 2
  const span = wrapAt - min + max
  return ((min + span / 2) % wrapAt + wrapAt) % wrapAt
}

/** A gradient showing a palette, for strip previews and share images. */
export function paletteGradient(colors: Array<{ l?: number; c?: number; h?: number }>): string {
  if (!colors.length) return 'var(--muted)'
  const stops = colors.map((color, i) => {
    const from = (i / colors.length) * 100
    const to = ((i + 1) / colors.length) * 100
    const css = formatColor({ mode: 'oklch', ...color } as never, 'oklch')
    return `${css} ${from.toFixed(2)}% ${to.toFixed(2)}%`
  })
  return `linear-gradient(to right, ${stops.join(', ')})`
}
