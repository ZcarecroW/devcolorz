/**
 * Palette extraction from images.
 *
 * Runs entirely in the browser — the image never leaves the machine.
 *
 * Three algorithms, because they answer different questions:
 *   • `kmeans`      — "what are the N groups of color in this image?"
 *   • `median-cut`  — "give me N colors that between them cover the image"
 *   • `vibrant`     — "give me the N colors a designer would actually pull out"
 *
 * All of them cluster in OKLab rather than RGB. Clustering in RGB is why so
 * many extractors return five nearly identical browns from a photo of a sunset.
 */

import type { Oklch } from 'culori'
import { toOklab, toOklch } from './convert'
import { createRng, type Rng } from './random'

export type ExtractAlgorithm = 'kmeans' | 'median-cut' | 'vibrant'

export interface ExtractOptions {
  algorithm: ExtractAlgorithm
  count: number
  /** Longest edge the image is downscaled to before sampling. */
  sampleSize: number
  /** Drop pixels below this OKLab lightness (kills black borders and shadows). */
  minLightness: number
  /** Drop pixels above this OKLab lightness (kills blown highlights). */
  maxLightness: number
  /** Drop pixels below this chroma (kills the grey mass that swamps photos). */
  minChroma: number
  /** Sort the result by lightness so it reads as a palette rather than a bag. */
  sort: 'lightness' | 'chroma' | 'hue' | 'population' | 'none'
  seed: number
}

export const DEFAULT_EXTRACT_OPTIONS: ExtractOptions = {
  algorithm: 'kmeans',
  count: 5,
  sampleSize: 220,
  minLightness: 0.06,
  maxLightness: 0.985,
  minChroma: 0.008,
  sort: 'lightness',
  seed: 0xc010f,
}

export interface ExtractedColor {
  color: Oklch
  /** Share of sampled pixels this color represents, 0–1. */
  population: number
}

interface LabPixel {
  l: number
  a: number
  b: number
}

/* ------------------------------------------------------------------ *
 * Sampling
 * ------------------------------------------------------------------ */

/** Downscale an image to a manageable size and read its pixels. */
export async function samplePixels(
  source: HTMLImageElement | ImageBitmap | Blob,
  options: Partial<ExtractOptions> = {},
): Promise<LabPixel[]> {
  const opts = { ...DEFAULT_EXTRACT_OPTIONS, ...options }
  const bitmap =
    source instanceof Blob ? await createImageBitmap(source) : (source as ImageBitmap | HTMLImageElement)

  const width = 'width' in bitmap ? bitmap.width : 0
  const height = 'height' in bitmap ? bitmap.height : 0
  if (!width || !height) return []

  const scale = Math.min(1, opts.sampleSize / Math.max(width, height))
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))

  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement('canvas'), { width: w, height: h })
  const ctx = (canvas as OffscreenCanvas).getContext('2d', { willReadFrequently: true }) as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null
  if (!ctx) return []
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h)
  const { data } = ctx.getImageData(0, 0, w, h)

  const pixels: LabPixel[] = []
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue // ignore transparent regions
    const ok = toOklab({
      mode: 'rgb',
      r: data[i] / 255,
      g: data[i + 1] / 255,
      b: data[i + 2] / 255,
    }) as LabPixel
    if (ok.l < opts.minLightness || ok.l > opts.maxLightness) continue
    if (Math.hypot(ok.a, ok.b) < opts.minChroma) continue
    pixels.push({ l: ok.l, a: ok.a, b: ok.b })
  }
  return pixels
}

/* ------------------------------------------------------------------ *
 * k-means
 * ------------------------------------------------------------------ */

/** k-means++ seeding: pick starts that are far apart, not merely random. */
function seedCentroids(pixels: LabPixel[], k: number, rng: Rng): LabPixel[] {
  const centroids: LabPixel[] = [pixels[Math.floor(rng.next() * pixels.length)]]
  while (centroids.length < k) {
    const distances = pixels.map((p) => {
      let nearest = Infinity
      for (const c of centroids) {
        const d = (p.l - c.l) ** 2 + (p.a - c.a) ** 2 + (p.b - c.b) ** 2
        if (d < nearest) nearest = d
      }
      return nearest
    })
    const total = distances.reduce((sum, d) => sum + d, 0)
    if (total <= 0) break
    let target = rng.next() * total
    let index = 0
    for (let i = 0; i < distances.length; i++) {
      target -= distances[i]
      if (target <= 0) {
        index = i
        break
      }
    }
    centroids.push(pixels[index])
  }
  return centroids
}

function kmeans(pixels: LabPixel[], k: number, rng: Rng, iterations = 24): ExtractedColor[] {
  if (!pixels.length) return []
  const centroids = seedCentroids(pixels, Math.min(k, pixels.length), rng)
  const assignments = new Int32Array(pixels.length)

  for (let iter = 0; iter < iterations; iter++) {
    let moved = false
    for (let i = 0; i < pixels.length; i++) {
      const p = pixels[i]
      let best = 0
      let bestDistance = Infinity
      for (let c = 0; c < centroids.length; c++) {
        const centroid = centroids[c]
        const d = (p.l - centroid.l) ** 2 + (p.a - centroid.a) ** 2 + (p.b - centroid.b) ** 2
        if (d < bestDistance) {
          bestDistance = d
          best = c
        }
      }
      if (assignments[i] !== best) {
        assignments[i] = best
        moved = true
      }
    }
    const sums = centroids.map(() => ({ l: 0, a: 0, b: 0, n: 0 }))
    for (let i = 0; i < pixels.length; i++) {
      const s = sums[assignments[i]]
      s.l += pixels[i].l
      s.a += pixels[i].a
      s.b += pixels[i].b
      s.n++
    }
    for (let c = 0; c < centroids.length; c++) {
      if (sums[c].n === 0) continue
      centroids[c] = { l: sums[c].l / sums[c].n, a: sums[c].a / sums[c].n, b: sums[c].b / sums[c].n }
    }
    if (!moved) break
  }

  const counts = new Array(centroids.length).fill(0)
  for (let i = 0; i < assignments.length; i++) counts[assignments[i]]++
  return centroids
    .map((c, i) => ({
      color: toOklch({ mode: 'oklab', l: c.l, a: c.a, b: c.b }) as Oklch,
      population: counts[i] / pixels.length,
    }))
    .filter((entry) => entry.population > 0)
}

/* ------------------------------------------------------------------ *
 * Median cut
 * ------------------------------------------------------------------ */

function medianCut(pixels: LabPixel[], k: number): ExtractedColor[] {
  if (!pixels.length) return []
  let buckets: LabPixel[][] = [pixels]
  while (buckets.length < k) {
    // Split whichever bucket has the widest spread on any axis.
    let targetIndex = -1
    let targetAxis: keyof LabPixel = 'l'
    let widest = -1
    buckets.forEach((bucket, index) => {
      if (bucket.length < 2) return
      for (const axis of ['l', 'a', 'b'] as const) {
        let min = Infinity
        let max = -Infinity
        for (const p of bucket) {
          if (p[axis] < min) min = p[axis]
          if (p[axis] > max) max = p[axis]
        }
        const range = max - min
        if (range > widest) {
          widest = range
          targetIndex = index
          targetAxis = axis
        }
      }
    })
    if (targetIndex < 0) break
    const bucket = buckets[targetIndex].slice().sort((x, y) => x[targetAxis] - y[targetAxis])
    const mid = Math.floor(bucket.length / 2)
    buckets = [
      ...buckets.slice(0, targetIndex),
      bucket.slice(0, mid),
      bucket.slice(mid),
      ...buckets.slice(targetIndex + 1),
    ]
  }
  return buckets
    .filter((bucket) => bucket.length)
    .map((bucket) => {
      const n = bucket.length
      const sum = bucket.reduce((acc, p) => ({ l: acc.l + p.l, a: acc.a + p.a, b: acc.b + p.b }), {
        l: 0,
        a: 0,
        b: 0,
      })
      return {
        color: toOklch({ mode: 'oklab', l: sum.l / n, a: sum.a / n, b: sum.b / n }) as Oklch,
        population: n / pixels.length,
      }
    })
}

/* ------------------------------------------------------------------ *
 * Vibrant
 * ------------------------------------------------------------------ */

/**
 * Cluster, then re-rank by how *interesting* each cluster is rather than by
 * how much of the image it covers. A photo of a grey street with one red door
 * should surface the red door.
 */
function vibrant(pixels: LabPixel[], k: number, rng: Rng): ExtractedColor[] {
  const clusters = kmeans(pixels, Math.max(k * 3, 12), rng)
  const scored = clusters.map((entry) => {
    const c = entry.color.c ?? 0
    const l = entry.color.l ?? 0
    // Reward chroma and mid lightness, and give population a modest say so
    // one stray pixel of neon cannot dominate the result.
    const chromaScore = Math.min(1, c / 0.2)
    const lightnessScore = 1 - Math.abs(l - 0.58) * 1.6
    const score =
      chromaScore * 0.55 + Math.max(0, lightnessScore) * 0.25 + Math.sqrt(entry.population) * 0.2
    return { entry, score }
  })
  scored.sort((a, b) => b.score - a.score)

  // Greedily take the best, skipping anything too close to what we already have.
  const picked: ExtractedColor[] = []
  for (const { entry } of scored) {
    if (picked.length >= k) break
    const tooClose = picked.some((p) => {
      const dl = (p.color.l ?? 0) - (entry.color.l ?? 0)
      const dc = (p.color.c ?? 0) - (entry.color.c ?? 0)
      const dh = Math.abs(((p.color.h ?? 0) - (entry.color.h ?? 0) + 540) % 360) - 180
      return Math.abs(dl) < 0.1 && Math.abs(dc) < 0.05 && Math.abs(dh) < 22
    })
    if (!tooClose) picked.push(entry)
  }
  // Backfill if the distinctness filter was too aggressive.
  for (const { entry } of scored) {
    if (picked.length >= k) break
    if (!picked.includes(entry)) picked.push(entry)
  }
  return picked.slice(0, k)
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

function sortColors(colors: ExtractedColor[], sort: ExtractOptions['sort']): ExtractedColor[] {
  const out = colors.slice()
  switch (sort) {
    case 'lightness':
      return out.sort((a, b) => (b.color.l ?? 0) - (a.color.l ?? 0))
    case 'chroma':
      return out.sort((a, b) => (b.color.c ?? 0) - (a.color.c ?? 0))
    case 'hue':
      return out.sort((a, b) => (a.color.h ?? 0) - (b.color.h ?? 0))
    case 'population':
      return out.sort((a, b) => b.population - a.population)
    default:
      return out
  }
}

/** Extract a palette from an image. */
export async function extractPalette(
  source: HTMLImageElement | ImageBitmap | Blob,
  options: Partial<ExtractOptions> = {},
): Promise<ExtractedColor[]> {
  const opts = { ...DEFAULT_EXTRACT_OPTIONS, ...options }
  const pixels = await samplePixels(source, opts)
  if (!pixels.length) return []
  const rng = createRng(opts.seed)
  let result: ExtractedColor[]
  switch (opts.algorithm) {
    case 'median-cut':
      result = medianCut(pixels, opts.count)
      break
    case 'vibrant':
      result = vibrant(pixels, opts.count, rng)
      break
    case 'kmeans':
    default:
      result = kmeans(pixels, opts.count, rng)
      break
  }
  return sortColors(result, opts.sort).slice(0, opts.count)
}

/** Pick the color under a specific point of an image — the eyedropper. */
export function pickAt(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  radius = 2,
): Oklch | null {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  const size = radius * 2 + 1
  const left = Math.max(0, Math.min(canvas.width - size, x - radius))
  const top = Math.max(0, Math.min(canvas.height - size, y - radius))
  const { data } = ctx.getImageData(left, top, size, size)
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue
    r += data[i]
    g += data[i + 1]
    b += data[i + 2]
    n++
  }
  if (!n) return null
  return toOklch({ mode: 'rgb', r: r / n / 255, g: g / n / 255, b: b / n / 255 }) as Oklch
}

export const ALGORITHM_LABELS: Record<ExtractAlgorithm, string> = {
  kmeans: 'k-means clustering',
  'median-cut': 'Median cut',
  vibrant: 'Vibrant',
}

export const ALGORITHM_HINTS: Record<ExtractAlgorithm, string> = {
  kmeans:
    'Groups every pixel into N clusters and returns each cluster’s average, seeded with k-means++ so the starting points are spread out rather than random. The most faithful representation of what is actually in the image. Because we cluster in OKLab, the groups match what your eye would group — clustering in RGB is why other extractors hand back five near-identical browns from a sunset.',
  'median-cut':
    'Repeatedly splits the color space along its widest axis until there are N boxes, then averages each. The classic GIF-quantisation algorithm. Faster than k-means and guarantees the whole range of the image is covered, but the colors it returns are less characteristic.',
  vibrant:
    'Clusters first, then ranks the clusters by how interesting they are rather than how much of the image they cover — favouring saturated, mid-lightness colors and rejecting near-duplicates. A grey street with one red door gives you the red door. This is usually the one you want for brand work.',
}

export const EXTRACT_SORT_LABELS: Record<ExtractOptions['sort'], string> = {
  lightness: 'Lightness',
  chroma: 'Colorfulness',
  hue: 'Hue',
  population: 'Coverage',
  none: 'Algorithm order',
}

export const EXTRACT_SORT_HINTS: Record<ExtractOptions['sort'], string> = {
  lightness: 'Light to dark. Reads as a designed palette and makes the light/dark ends obvious.',
  chroma: 'Most colorful first. Puts the accents at the front and the neutrals at the back.',
  hue: 'Around the color wheel. Best for spotting which hue families the image actually uses.',
  population: 'Most of the image first. Shows you the true weighting of the photo.',
  none: 'Whatever order the algorithm produced.',
}
