import { describe, expect, it } from 'vitest'
import { planGrid, spansFor } from './layout'

describe('spansFor', () => {
  it('leaves an exact fit alone', () => {
    expect(spansFor(8, 4)).toEqual([1, 1, 1, 1, 1, 1, 1, 1])
  })

  it('spreads a lone straggler across the whole last row', () => {
    // 9 in 4 columns: the ninth would otherwise sit beside three empty cells.
    const spans = spansFor(9, 4)
    expect(spans.slice(0, 8)).toEqual([1, 1, 1, 1, 1, 1, 1, 1])
    expect(spans[8]).toBe(4)
  })

  it('shares the last row between the items that are on it', () => {
    // 10 in 4: two on the last row, two columns each.
    expect(spansFor(10, 4).slice(8)).toEqual([2, 2])
    // 11 in 4: three on the last row, so 2 + 1 + 1.
    expect(spansFor(11, 4).slice(8)).toEqual([2, 1, 1])
  })

  it('fills a single short row', () => {
    // Three items in a five-column grid still span the full width.
    expect(spansFor(3, 5)).toEqual([2, 2, 1])
    expect(spansFor(3, 5).reduce((a, b) => a + b, 0)).toBe(5)
  })

  it('always sums the last row to the column count', () => {
    for (let count = 1; count <= 40; count++) {
      for (let columns = 1; columns <= 8; columns++) {
        const spans = spansFor(count, columns)
        const lastRowSize = count <= columns ? count : count % columns || columns
        const total = spans.slice(count - lastRowSize).reduce((a, b) => a + b, 0)
        expect(total, `${count} in ${columns}`).toBe(columns)
      }
    }
  })
})

describe('planGrid', () => {
  it('fills a wide area with a wide grid', () => {
    const plan = planGrid(12, 1200, 400)
    expect(plan.columns).toBeGreaterThan(plan.rows)
    expect(plan.columns * plan.rows).toBeGreaterThanOrEqual(12)
  })

  it('fills a tall area with a tall grid', () => {
    const plan = planGrid(12, 400, 1200)
    expect(plan.rows).toBeGreaterThan(plan.columns)
  })

  it('keeps tiles near square in a square area', () => {
    const plan = planGrid(16, 800, 800)
    const ratio = plan.tileWidth / plan.tileHeight
    expect(ratio).toBeGreaterThan(0.6)
    expect(ratio).toBeLessThan(1.7)
  })

  it('never leaves more than one row incomplete', () => {
    for (let count = 1; count <= 40; count++) {
      const plan = planGrid(count, 1000, 600)
      const empty = plan.columns * plan.rows - count
      expect(empty, `${count} colors`).toBeLessThan(plan.columns)
    }
  })

  it('produces one span per color', () => {
    for (let count = 1; count <= 40; count++) {
      expect(planGrid(count, 1000, 600).spans).toHaveLength(count)
    }
  })

  it('survives a zero-sized container', () => {
    const plan = planGrid(5, 0, 0)
    expect(plan.columns).toBe(1)
    expect(plan.spans.length).toBeGreaterThan(0)
  })

  it('gives a single color the whole box', () => {
    const plan = planGrid(1, 900, 500)
    expect(plan.columns).toBe(1)
    expect(plan.rows).toBe(1)
    expect(plan.spans).toEqual([1])
  })

  it('accounts for the gap between tiles', () => {
    const withGap = planGrid(9, 900, 900, { gap: 20 })
    expect(withGap.tileWidth).toBeLessThan(900 / withGap.columns)
  })
})

describe('planGrid under conditions it used to give up on', () => {
  it('never returns zero-size tiles when the gap alone would overflow the box', () => {
    const plan = planGrid(50, 100, 100, { gap: 20 })
    expect(plan.tileWidth).toBeGreaterThan(0)
    expect(plan.tileHeight).toBeGreaterThan(0)
    expect(plan.spans).toHaveLength(50)
  })

  it('keeps one span per item while the container is still unmeasured', () => {
    expect(planGrid(10, 0, 0).spans).toHaveLength(10)
  })

  it('honours an affordable gap exactly', () => {
    const plan = planGrid(4, 400, 400, { gap: 8 })
    expect(plan.columns).toBe(2)
    expect(plan.tileWidth).toBeCloseTo(196, 6)
  })
})
