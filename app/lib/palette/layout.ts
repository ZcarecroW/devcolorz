/**
 * Laying a palette out in a box.
 *
 * Vertical strips are the right shape for five colours and the wrong shape for
 * twenty: at that count each column is a 40px sliver, and a palette you cannot
 * see is not much use. So the strip offers several layouts, and the interesting
 * one is `boxes` — fill the available area with N tiles that are as close to
 * square as the area allows, with no leftover gap.
 *
 * The maths is small but not obvious, which is why it lives here as plain
 * functions rather than inside a component.
 */

export type PaletteView = 'columns' | 'boxes' | 'rows' | 'cards'

export interface GridPlan {
  columns: number
  rows: number
  /**
   * Column span per item. Every entry is 1 except on the final row, where the
   * remaining items widen to absorb the leftover columns — which is what makes
   * the grid actually fill its box instead of trailing off with a hole in the
   * bottom-right corner.
   */
  spans: number[]
  /** The resulting tile aspect ratio, for callers that want to adapt type size. */
  tileWidth: number
  tileHeight: number
}

export interface GridOptions {
  /** Gap between tiles, in the same units as width and height. */
  gap?: number
  /**
   * How much a tile is allowed to depart from square before another column
   * count wins. Below 1 the layout tolerates nothing; 2 accepts a 2:1 tile.
   */
  tolerance?: number
}

/**
 * Choose a column count that fills `width` × `height` with `count` tiles.
 *
 * Scoring balances two things that pull against each other: how far each tile
 * is from square, and how many cells the final row leaves empty. Optimising
 * squareness alone produces layouts like 7 columns for 8 items — near-perfect
 * tiles and a row containing one lonely stretched swatch.
 */
export function planGrid(
  count: number,
  width: number,
  height: number,
  options: GridOptions = {},
): GridPlan {
  const gap = options.gap ?? 0
  const tolerance = options.tolerance ?? 1

  if (count <= 0 || width <= 0 || height <= 0) {
    // One span per item even here: a container still being measured reads as
    // 0×0 for a tick, and a caller indexing `spans[i]` for its second item
    // otherwise got `undefined` into a grid-column declaration.
    return {
      columns: 1,
      rows: Math.max(1, count),
      spans: new Array(Math.max(1, count)).fill(1),
      tileWidth: width,
      tileHeight: height,
    }
  }

  let best = { columns: 1, rows: count, score: Number.POSITIVE_INFINITY, tileWidth: 0, tileHeight: 0 }

  for (let columns = 1; columns <= count; columns++) {
    const rows = Math.ceil(count / columns)
    // A gap the box cannot afford is shrunk rather than honoured: with the
    // gaps alone wider than the box, every column count failed and the
    // placeholder above came back as a plan with zero-size tiles. The gaps
    // may take at most half of each axis, so the tiles keep the other half.
    const maxGap = Math.min(
      columns > 1 ? width / (2 * (columns - 1)) : Number.POSITIVE_INFINITY,
      rows > 1 ? height / (2 * (rows - 1)) : Number.POSITIVE_INFINITY,
    )
    const fitGap = Math.min(gap, maxGap)
    const tileWidth = (width - fitGap * (columns - 1)) / columns
    const tileHeight = (height - fitGap * (rows - 1)) / rows
    if (tileWidth <= 0 || tileHeight <= 0) continue

    // Log ratio so a 2:1 tile and a 1:2 tile score identically.
    const squareness = Math.abs(Math.log(tileWidth / tileHeight))
    // Empty cells in the last row, as a fraction of one row.
    const orphans = (columns * rows - count) / columns
    const score = squareness / Math.max(0.01, tolerance) + orphans * 0.6

    if (score < best.score) best = { columns, rows, score, tileWidth, tileHeight }
  }

  return {
    columns: best.columns,
    rows: best.rows,
    spans: spansFor(count, best.columns),
    tileWidth: best.tileWidth,
    tileHeight: best.tileHeight,
  }
}

/**
 * Column span per item so the final row spreads across the full width.
 *
 * Nine items in four columns leaves one on the last row; rather than sitting
 * in a quarter-width box beside three empty cells, it spans all four.
 */
export function spansFor(count: number, columns: number): number[] {
  const spans = new Array(count).fill(1)
  if (columns <= 1 || count <= columns) {
    // A single row: share the columns out between however many items there are.
    if (count > 0 && count < columns) {
      const base = Math.floor(columns / count)
      let extra = columns % count
      for (let i = 0; i < count; i++) {
        spans[i] = base + (extra-- > 0 ? 1 : 0)
      }
    }
    return spans
  }

  const remainder = count % columns
  if (remainder === 0) return spans

  const base = Math.floor(columns / remainder)
  let extra = columns % remainder
  for (let i = 0; i < remainder; i++) {
    spans[count - remainder + i] = base + (extra-- > 0 ? 1 : 0)
  }
  return spans
}

export interface ViewDef {
  id: PaletteView
  label: string
  hint: string
}

export const PALETTE_VIEWS: ViewDef[] = [
  {
    id: 'columns',
    label: 'Columns',
    hint: 'Full-height vertical strips, the way a palette tool traditionally shows one. Best up to about ten colors — past that each column is a sliver and the label has to turn on its side to fit.',
  },
  {
    id: 'boxes',
    label: 'Boxes',
    hint: 'Tiles that fill the whole area, arranged in whichever grid keeps them closest to square. The last row widens to absorb the remainder, so there is never an empty corner. This is the layout that stays readable at twenty or forty colors.',
  },
  {
    id: 'rows',
    label: 'Rows',
    hint: 'Full-width horizontal bands. The easiest layout for judging lightness order, because every color spans the same distance and your eye compares them along one axis.',
  },
  {
    id: 'cards',
    label: 'Cards',
    hint: 'A scrolling grid of larger tiles that keeps the name, the value and the contrast badges visible on every color at once. Useful when you are naming things or auditing, rather than generating.',
  },
]

export const VIEW_BY_ID: Record<PaletteView, ViewDef> = Object.fromEntries(
  PALETTE_VIEWS.map((v) => [v.id, v]),
) as Record<PaletteView, ViewDef>
