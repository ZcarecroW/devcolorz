/**
 * The twelve extra preview templates, in the shape the registry spreads in.
 *
 * The decision worth knowing: every `component` is a lazy `import()` rather
 * than a static import. Twelve fake products is a lot of markup, and a user
 * looks at one at a time — keeping them as separate chunks means switching
 * templates costs a network round trip once instead of costing every visitor a
 * larger bundle forever.
 */

// A type-only import, so the registry can import this module's rows without
// the two forming a runtime cycle. The row shape used to be redeclared here
// field for field, which nothing kept in step with the registry's own.
import type { PreviewTemplate } from '../registry'

export const EXTRA_TEMPLATES: PreviewTemplate[] = [
  {
    id: 'mobile-app',
    label: 'Mobile app',
    group: 'Product',
    description:
      'A phone screen with a status bar, an activity feed and a tab bar. The densest small-type test in the set.',
    minColors: 2,
    component: () => import('./MobileApp.vue'),
  },
  {
    id: 'chat-ui',
    label: 'Chat',
    group: 'Product',
    description:
      'A conversation where outgoing bubbles carry body text on the primary color — harder than carrying a button label.',
    minColors: 2,
    component: () => import('./ChatUi.vue'),
  },
  {
    id: 'pricing-table',
    label: 'Pricing table',
    group: 'Marketing',
    description:
      'Three tiers with one highlighted. Shows whether the primary reads as emphasis next to plain surfaces.',
    minColors: 2,
    component: () => import('./PricingTable.vue'),
  },
  {
    id: 'kanban-board',
    label: 'Kanban board',
    group: 'Product',
    description:
      'Four columns of cards with ramp-colored labels, tested at the size a real label chip gets.',
    minColors: 3,
    component: () => import('./KanbanBoard.vue'),
  },
  {
    id: 'blog-article',
    label: 'Article',
    group: 'Editorial',
    description:
      'Hero, headline, real paragraphs, a pull quote and a code block. The honest test of the muted text color.',
    minColors: 2,
    component: () => import('./BlogArticle.vue'),
  },
  {
    id: 'code-editor',
    label: 'Code editor',
    group: 'System',
    description:
      'File tree, tabs and a syntax-highlighted snippet where every token class maps to a chart color.',
    minColors: 4,
    component: () => import('./CodeEditor.vue'),
  },
  {
    id: 'terminal',
    label: 'Terminal',
    group: 'System',
    description:
      'A build log that puts success, warning and danger on one surface a few lines apart.',
    minColors: 2,
    component: () => import('./Terminal.vue'),
  },
  {
    id: 'data-viz',
    label: 'Analytics board',
    group: 'Data',
    description:
      'Donut, stacked bars, sparklines and a heatmap — the chart series and the ramp side by side.',
    minColors: 3,
    component: () => import('./DataViz.vue'),
  },
  {
    id: 'music-player',
    label: 'Music player',
    group: 'Product',
    description:
      'Album art swept through every ramp step, plus a queue and transport controls. Banding shows up here first.',
    minColors: 2,
    component: () => import('./MusicPlayer.vue'),
  },
  {
    id: 'calendar-view',
    label: 'Calendar',
    group: 'Product',
    description:
      'A month grid where four calendars have to stay apart at nine pixels of color.',
    minColors: 3,
    component: () => import('./CalendarView.vue'),
  },
  {
    id: 'editorial-poster',
    label: 'Poster',
    group: 'Editorial',
    description:
      'Display type at container scale over palette bands. The least forgiving surface a color gets.',
    minColors: 3,
    component: () => import('./EditorialPoster.vue'),
  },
  {
    id: 'email-template',
    label: 'Transactional email',
    group: 'Marketing',
    description:
      'Two surfaces, three text weights and one filled button — a palette with nowhere to hide.',
    minColors: 1,
    component: () => import('./EmailTemplate.vue'),
  },
]
