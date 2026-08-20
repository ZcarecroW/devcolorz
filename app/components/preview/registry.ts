/**
 * The manifest of preview templates.
 *
 * Templates are registered by hand rather than discovered from the filesystem
 * so the picker can group and describe them in the order a designer thinks
 * about them. Every entry loads lazily: the grid density mounts all of them at
 * once, and shipping a dozen full page layouts in the main bundle would be
 * paid for by everyone who never opens the preview pane.
 *
 * To add a template, drop a component in `./templates` and append one row.
 * Nothing else in the pane needs to change.
 */

import type { Component } from 'vue'

import { EXTRA_TEMPLATES } from './templates/extra'

export interface PreviewTemplate {
  id: string
  label: string
  group: 'Brand' | 'Marketing' | 'Product' | 'Data' | 'Editorial' | 'System'
  /** One line under the label in the picker: say what the template exercises. */
  description: string
  /** Below this many palette colors it still renders, just thinly. */
  minColors: number
  component: () => Promise<Component>
}

/** Group order in the picker. Templates keep their array order within a group. */
export const PREVIEW_GROUPS: Array<PreviewTemplate['group']> = [
  'Brand',
  'Marketing',
  'Product',
  'Data',
  'Editorial',
  'System',
]

export const PREVIEW_TEMPLATES: PreviewTemplate[] = [
  {
    id: 'brand-sheet',
    label: 'Brand sheet',
    group: 'Brand',
    description:
      'Business card, letterhead and wordmark lockup, with hex values. Print-adjacent, where over-saturation shows first.',
    minColors: 2,
    component: () => import('./templates/BrandSheet.vue'),
  },
  {
    id: 'landing-hero',
    label: 'Landing hero',
    group: 'Marketing',
    description:
      'Nav, headline, two calls to action, a feature row and a footer. Shows how the palette reads at page scale.',
    minColors: 2,
    component: () => import('./templates/LandingHero.vue'),
  },
  {
    id: 'product-cards',
    label: 'Product cards',
    group: 'Product',
    description:
      'A three-up commerce grid with gradient imagery, prices, ratings and a buy button.',
    minColors: 3,
    component: () => import('./templates/ProductCards.vue'),
  },
  {
    id: 'saas-dashboard',
    label: 'SaaS dashboard',
    group: 'Data',
    description:
      'Sidebar, stat cards, a bar chart, a line chart and a table. The test for whether the six chart series stay apart.',
    minColors: 3,
    component: () => import('./templates/SaasDashboard.vue'),
  },
  {
    id: 'ui-kit',
    label: 'UI kit sheet',
    group: 'System',
    description:
      'Buttons, fields, alerts, badges, tabs and a scrim, in every state. The QA surface: it uses every role at least once.',
    minColors: 1,
    component: () => import('./templates/UiKitSheet.vue'),
  },
  {
    id: 'tonal-ramp',
    label: 'Tonal ramp',
    group: 'System',
    description:
      'An eleven-step tonal ramp per palette color, so you can see where a hue goes muddy on the way to black.',
    minColors: 1,
    component: () => import('./templates/TonalRamp.vue'),
  },
  // The twelve additional templates live in their own module so this file stays
  // readable; they are ordinary PreviewTemplate rows and the picker groups them
  // by `group` like any other.
  ...EXTRA_TEMPLATES,
]
