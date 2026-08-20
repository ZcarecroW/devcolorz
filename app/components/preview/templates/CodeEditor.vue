<script setup lang="ts">
/**
 * An editor window: file tree, tabs, a syntax-highlighted TypeScript snippet
 * and a status bar.
 *
 * The decision worth knowing: the snippet is tokenized at runtime by a small
 * local lexer instead of being hand-split into spans. Every token class maps
 * onto one `--p-chart-*` slot, so this template is the strictest test the app
 * has of whether the chart series stay mutually distinguishable — six colors,
 * 11px, one surface, no icons to lean on.
 */
import { computed } from 'vue'
import { ChevronDown, ChevronRight, CircleX, GitBranch, TriangleAlert, X } from '@lucide/vue'
import InfoHint from '@/components/common/InfoHint.vue'
import type { RoleMap } from '@/lib/color/roles'
import type { Oklch } from '@/lib/color/types'

const props = defineProps<{ roles: RoleMap; colors: Oklch[] }>()

const chartCount = computed(() => Math.max(1, props.roles.chart.length))
function chart(index: number): string {
  const n = chartCount.value
  return `var(--p-chart-${(((index % n) + n) % n) + 1})`
}

const rampCount = computed(() => Math.max(1, props.roles.ramp.length))
function ramp(index: number): string {
  const n = rampCount.value
  return `var(--p-ramp-${(((index % n) + n) % n) + 1})`
}

type Kind = 'plain' | 'keyword' | 'type' | 'string' | 'fn' | 'number' | 'comment' | 'punct'

interface Token {
  text: string
  kind: Kind
}

const KEYWORDS = new Set([
  'import',
  'export',
  'from',
  'const',
  'let',
  'function',
  'return',
  'if',
  'for',
  'of',
  'while',
  'new',
  'type',
  'interface',
  'as',
  'void',
])

// One pass, ordered so comments and strings win over identifiers.
const LEXER = /(\/\/[^\n]*|\/\*[^\n]*)|('[^']*')|(\d+(?:\.\d+)?)|([A-Za-z_$][\w$]*)|(\s+)|([^\w\s])/g

function classify(word: string, next: string): Kind {
  if (KEYWORDS.has(word)) return 'keyword'
  if (next === '(') return 'fn'
  if (/^[A-Z]/.test(word)) return 'type'
  return 'plain'
}

function tokenize(line: string): Token[] {
  const out: Token[] = []
  LEXER.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = LEXER.exec(line)) !== null) {
    const [text, comment, str, num, word, space] = match
    if (comment) out.push({ text, kind: 'comment' })
    else if (str) out.push({ text, kind: 'string' })
    else if (num) out.push({ text, kind: 'number' })
    else if (word) out.push({ text, kind: classify(word, line[LEXER.lastIndex] ?? '') })
    else if (space) out.push({ text, kind: 'plain' })
    else out.push({ text, kind: 'punct' })
  }
  return out
}

const SOURCE = [
  "import { deltaEOK } from './gamut'",
  "import type { Oklch } from './types'",
  '',
  '/** Farthest-point ordering: adjacent series stay maximally distinct. */',
  'export function pickSeries(pool: Oklch[], count: number): Oklch[] {',
  '  const picked: Oklch[] = [pool[0]]',
  '  const rest = pool.slice(1)',
  '',
  '  while (picked.length < count && rest.length) {',
  '    let best = 0',
  '    let far = -1',
  '    rest.forEach((color, i) => {',
  '      const gap = Math.min(...picked.map((p) => deltaEOK(p, color)))',
  '      if (gap > far) {',
  '        far = gap',
  '        best = i',
  '      }',
  '    })',
  '    picked.push(rest.splice(best, 1)[0])',
  '  }',
  '  return picked',
  '}',
]

const lines = computed(() => SOURCE.map((line) => tokenize(line)))

/** Token class → chart slot. Comments and punctuation stay deliberately quiet. */
function colorFor(kind: Kind): string {
  switch (kind) {
    case 'keyword':
      return chart(0)
    case 'type':
      return chart(1)
    case 'string':
      return chart(2)
    case 'fn':
      return chart(3)
    case 'number':
      return chart(4)
    case 'comment':
      return 'var(--p-text-muted)'
    case 'punct':
      return chart(5)
    default:
      return 'var(--p-text)'
  }
}

interface TreeNode {
  depth: number
  label: string
  folder: boolean
  open: boolean
  active?: boolean
}

const tree: TreeNode[] = [
  { depth: 0, label: 'app', folder: true, open: true },
  { depth: 1, label: 'lib', folder: true, open: true },
  { depth: 2, label: 'color', folder: true, open: true },
  { depth: 3, label: 'roles.ts', folder: false, open: false, active: true },
  { depth: 3, label: 'contrast.ts', folder: false, open: false },
  { depth: 3, label: 'gamut.ts', folder: false, open: false },
  { depth: 3, label: 'scale.ts', folder: false, open: false },
  { depth: 1, label: 'stores', folder: true, open: false },
  { depth: 1, label: 'components', folder: true, open: false },
]

const tabs = [
  { label: 'roles.ts', active: true, dirty: true },
  { label: 'contrast.ts', active: false, dirty: false },
  { label: 'gamut.ts', active: false, dirty: false },
]
</script>

<template>
  <div
    class="@container flex w-full flex-col font-mono"
    :style="{ background: 'var(--p-background)', color: 'var(--p-text)' }"
  >
    <div class="flex min-h-0">
      <!-- File tree -->
      <div
        class="w-28 shrink-0 border-r py-2 @lg:w-44"
        :style="{ borderColor: 'var(--p-border)', background: 'var(--p-surface)' }"
      >
        <div
          class="flex items-center gap-1 px-2 pb-1.5 text-[9px] tracking-widest uppercase"
          :style="{ color: 'var(--p-text-muted)' }"
        >
          Explorer
        </div>
        <div
          v-for="node in tree"
          :key="node.depth + node.label"
          class="flex items-center gap-1 py-[3px] pr-1 text-[10px]"
          :style="{
            paddingLeft: `${0.4 + node.depth * 0.45}rem`,
            background: node.active
              ? 'color-mix(in oklab, var(--p-primary) 16%, transparent)'
              : 'transparent',
            color: node.active ? 'var(--p-text)' : 'var(--p-text-muted)',
            boxShadow: node.active ? 'inset 2px 0 0 0 var(--p-primary)' : 'none',
          }"
        >
          <ChevronDown v-if="node.folder && node.open" class="size-2.5 shrink-0" />
          <ChevronRight v-else-if="node.folder" class="size-2.5 shrink-0" />
          <span
            v-else
            class="size-1.5 shrink-0 rounded-[2px]"
            :style="{ background: ramp(node.depth + node.label.length) }"
          />
          <span class="truncate">{{ node.label }}</span>
        </div>
      </div>

      <!-- Editor -->
      <div class="flex min-w-0 flex-1 flex-col">
        <!-- Tabs -->
        <div
          class="flex items-stretch border-b"
          :style="{ borderColor: 'var(--p-border)', background: 'var(--p-surface-alt)' }"
        >
          <span
            v-for="tab in tabs"
            :key="tab.label"
            class="flex items-center gap-1.5 border-r px-2.5 py-1.5 text-[10px]"
            :style="{
              borderColor: 'var(--p-border)',
              background: tab.active ? 'var(--p-background)' : 'transparent',
              color: tab.active ? 'var(--p-text)' : 'var(--p-text-muted)',
              boxShadow: tab.active ? 'inset 0 2px 0 0 var(--p-primary)' : 'none',
            }"
          >
            <span class="truncate">{{ tab.label }}</span>
            <span
              v-if="tab.dirty"
              class="size-1.5 rounded-full"
              :style="{ background: 'var(--p-accent)' }"
            />
            <X v-else class="size-2.5 opacity-60" />
          </span>
          <span class="flex-1" />
          <span class="flex items-center px-2">
            <InfoHint
              title="Six colors, 11px"
              wide
              class="text-[color:var(--p-text-muted)] hover:text-[color:var(--p-text)]"
              text="Each token class maps to one chart slot, which makes this the strictest test in the set: six colors have to stay apart at 11px on a single surface with no shape or icon to help. Palettes that pass the chart panel often fail here, because a bar chart gives every series a large filled area and code gives it three letters. If two token classes blur together, widen the hue spacing before you touch the syntax theme."
            />
          </span>
        </div>

        <!-- Code -->
        <div class="min-w-0 overflow-x-auto py-2">
          <div
            v-for="(line, i) in lines"
            :key="i"
            class="flex whitespace-pre"
            :style="{
              background:
                i === 12 ? 'color-mix(in oklab, var(--p-primary) 8%, transparent)' : 'transparent',
            }"
          >
            <span
              class="w-8 shrink-0 pr-2 text-right text-[10px] leading-5 tabular-nums select-none"
              :style="{ color: 'var(--p-text-muted)', opacity: 0.7 }"
            >
              {{ i + 1 }}
            </span>
            <span class="pr-4 text-[11px] leading-5">
              <span
                v-for="(token, t) in line"
                :key="t"
                :style="{ color: colorFor(token.kind) }"
              >{{ token.text }}</span>
              <span
                v-if="i === 12"
                class="inline-block h-3.5 w-[2px] translate-y-0.5 animate-pulse"
                :style="{ background: 'var(--p-primary)' }"
              />
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Status bar -->
    <div
      class="flex items-center gap-3 border-t px-3 py-1 text-[10px]"
      :style="{
        borderColor: 'var(--p-border)',
        background: 'var(--p-primary)',
        color: 'var(--p-text-on-primary)',
      }"
    >
      <span class="flex items-center gap-1"><GitBranch class="size-3" /> ramp/chroma-falloff</span>
      <span class="flex items-center gap-1"><CircleX class="size-3" /> 0</span>
      <span class="flex items-center gap-1"><TriangleAlert class="size-3" /> 2</span>
      <span class="flex-1" />
      <span class="hidden tabular-nums @lg:inline">Ln 13, Col 28</span>
      <span class="hidden @lg:inline">UTF-8</span>
      <span>TypeScript</span>
    </div>
  </div>
</template>
