# shadcn/ui Theming + tweakcn + shadcn-vue — Exact Token Contract

## 1. Canonical token list (shadcn, current / Tailwind v4 + OKLCH)

**Color format:** OKLCH is the default since the March 2025 Tailwind v4 update. Legacy `hsl(var(--x))` wrapping is **gone** — variables now hold raw color values and are consumed directly (`background: var(--background)`), which is why `@theme inline` exists.

### `:root` — 30 color tokens + `--radius` (default `0.625rem`)
```
--background        oklch(1 0 0)              --foreground        oklch(0.145 0 0)
--card              oklch(1 0 0)              --card-foreground   oklch(0.145 0 0)
--popover           oklch(1 0 0)              --popover-foreground oklch(0.145 0 0)
--primary           oklch(0.205 0 0)          --primary-foreground oklch(0.985 0 0)
--secondary         oklch(0.97 0 0)           --secondary-foreground oklch(0.205 0 0)
--muted             oklch(0.97 0 0)           --muted-foreground  oklch(0.556 0 0)
--accent            oklch(0.97 0 0)           --accent-foreground oklch(0.205 0 0)
--destructive       oklch(0.577 0.245 27.325)
--border            oklch(0.922 0 0)          --input             oklch(0.922 0 0)
--ring              oklch(0.708 0 0)
--chart-1 oklch(0.646 0.222 41.116)  --chart-2 oklch(0.6 0.118 184.704)
--chart-3 oklch(0.398 0.07 227.392)  --chart-4 oklch(0.828 0.189 84.429)
--chart-5 oklch(0.769 0.188 70.08)
--sidebar oklch(0.985 0 0)                    --sidebar-foreground oklch(0.145 0 0)
--sidebar-primary oklch(0.205 0 0)            --sidebar-primary-foreground oklch(0.985 0 0)
--sidebar-accent oklch(0.97 0 0)              --sidebar-accent-foreground oklch(0.205 0 0)
--sidebar-border oklch(0.922 0 0)             --sidebar-ring oklch(0.708 0 0)
```

### `.dark` — same 30 keys, no `--radius` re-declaration
```
--background oklch(0.145 0 0)   --foreground oklch(0.985 0 0)
--card oklch(0.205 0 0)         --card-foreground oklch(0.985 0 0)
--popover oklch(0.205 0 0)      --popover-foreground oklch(0.985 0 0)
--primary oklch(0.922 0 0)      --primary-foreground oklch(0.205 0 0)
--secondary oklch(0.269 0 0)    --secondary-foreground oklch(0.985 0 0)
--muted oklch(0.269 0 0)        --muted-foreground oklch(0.708 0 0)
--accent oklch(0.269 0 0)       --accent-foreground oklch(0.985 0 0)
--destructive oklch(0.704 0.191 22.216)
--border oklch(1 0 0 / 10%)     --input oklch(1 0 0 / 15%)   --ring oklch(0.556 0 0)
--chart-1 oklch(0.488 0.243 264.376)  --chart-2 oklch(0.696 0.17 162.48)
--chart-3 oklch(0.769 0.188 70.08)    --chart-4 oklch(0.627 0.265 303.9)
--chart-5 oklch(0.645 0.246 16.439)
--sidebar oklch(0.205 0 0)      --sidebar-foreground oklch(0.985 0 0)
--sidebar-primary oklch(0.488 0.243 264.376)  --sidebar-primary-foreground oklch(0.985 0 0)
--sidebar-accent oklch(0.269 0 0)             --sidebar-accent-foreground oklch(0.985 0 0)
--sidebar-border oklch(1 0 0 / 10%)           --sidebar-ring oklch(0.556 0 0)
```

**Gotcha for programmatic generation:** `--destructive-foreground` exists in tweakcn's schema but **NOT** in stock shadcn's `:root`/`.dark` (shadcn dropped it; destructive buttons use `text-white`). Emit it — harmless and required for tweakcn-preset parity.

### `@theme inline` mapping (Tailwind v4)
`inline` means values are substituted at build time rather than re-referenced, so `.dark` overrides of `--background` still flow into `bg-background`. Pattern: `--color-<token>: var(--<token>)` for all 30 colors above, plus the radius scale:
```css
--radius-sm: calc(var(--radius) * 0.6);   --radius-md: calc(var(--radius) * 0.8);
--radius-lg: var(--radius);               --radius-xl: calc(var(--radius) * 1.4);
--radius-2xl: calc(var(--radius) * 1.8);  --radius-3xl: calc(var(--radius) * 2.2);
--radius-4xl: calc(var(--radius) * 2.6);
```
Note: the older/widely-deployed radius scale was `calc(var(--radius) - 4px | - 2px | +0 | +4px)`. **Current docs use the multiplier form above** — a breaking change to detect. Header also needs `@custom-variant dark (&:is(.dark *));` and:
```css
@layer base { * { @apply border-border outline-ring/50; } body { @apply bg-background text-foreground; } }
```

## 2. tweakcn's extended contract (the superset — 45 keys per mode)

From `types/theme.ts` (`themeStylePropsSchema`, zod): the 30 shadcn colors + `destructive-foreground`, then:

| Key | Purpose |
|---|---|
| `font-sans`, `font-serif`, `font-mono` | full font stacks, e.g. `Inter, sans-serif` |
| `radius` | e.g. `0.375rem` |
| `shadow-color` | `hsl(0 0% 0%)` |
| `shadow-opacity` | `0.1` (unitless) |
| `shadow-blur` | `8px` |
| `shadow-spread` | `-1px` |
| `shadow-offset-x` / `shadow-offset-y` | `0px` / `4px` |
| `letter-spacing` | `0em` |
| `spacing` | `0.25rem` (optional in schema — `themeStylePropsSchemaWithoutSpacing` omits it) |

**Derived shadow scale** (emitted into both modes, computed from the 6 primitives). Exact algorithm from `utils/shadows.ts`:
- Color = `hsl(<hsl> / (opacity * multiplier).toFixed(2))`
- Single-layer: `2xs` and `xs` use multiplier **0.5**; `2xl` uses **2.5**
- Two-layer (`sm`, `shadow`, `md`, `lg`, `xl`): layer 1 multiplier **1.0**; layer 2 = same offsetX, fixed offsetY/blur per size, spread = `(spread − 1)px`, multiplier 1.0
- Layer-2 (offsetY, blur) pairs: `sm`/`shadow` → `1px, 2px`; `md` → `2px, 4px`; `lg` → `4px, 6px`; `xl` → `8px, 10px`

Emitted vars: `--shadow-2xs, --shadow-xs, --shadow-sm, --shadow, --shadow-md, --shadow-lg, --shadow-xl, --shadow-2xl`. Plus `--tracking-normal: <letter-spacing>` in light mode only.

Real output sample (Amber Minimal, blur 8px / spread −1px / offset 0,4px / opacity 0.1):
```
--shadow-2xs: 0px 4px 8px -1px hsl(0 0% 0% / 0.05);
--shadow-sm:  0px 4px 8px -1px hsl(0 0% 0% / 0.10), 0px 1px 2px -2px hsl(0 0% 0% / 0.10);
--shadow-2xl: 0px 4px 8px -1px hsl(0 0% 0% / 0.25);
```

tweakcn's `@theme inline` additionally maps: `--font-sans/serif/mono`, `--shadow-*` (all 8), `--tracking-tighter|tight|normal|wide|wider|widest` as `calc(var(--tracking-normal) + Xem)`, and `--spacing`. Body gets `letter-spacing: var(--tracking-normal);` appended.

## 3. tweakcn editor UX (what to match/beat)

- **Left panel tabs:** `Colors` · `Typography` · `Other` · `Generate`
- **Colors:** grouped accordions — Primary, Secondary, Accent, Base, Card, Popover, Muted, Destructive (each bg + foreground), then Border & Input (Border/Input/Ring), Chart (1–5), Sidebar (with a **Sync** toggle that derives sidebar tokens from primary/accent/border/ring)
- **Typography:** Google Fonts picker for sans/serif/mono, letter-spacing slider
- **Other:** radius slider, shadow builder (color, opacity, blur, spread, offset X/Y), spacing
- **Top bar:** Reset · Import (paste CSS) · Share · Save · **Code** (export modal, Tailwind v3 *and* v4 output, toggleable color format)
- **Preview tabs:** Custom Cards, Dashboard, Application, Marketing (+ "Open in" v0/Bolt/Lovable)
- **Presets:** large built-in library (`source: "BUILT_IN" | "SAVED"`), light+dark pairs
- **AI:** natural-language theme generation in the Generate tab
- **Registry export:** shadcn-registry-compatible JSON so `npx shadcn add <url>` installs the theme

**Beatable gaps:** (a) no contrast/APCA validation surfaced per pair; (b) no per-mode independent editing safety — sync is coarse; (c) OKLCH is displayed but the picker is HSL-ish; a true OKLCH L/C/H triad editor with gamut clipping would be better; (d) no chart-palette generator (harmonic hue rotation) — chart-1..5 are hand-picked; (e) no font-pairing suggestions or self-host/subset output — only Google Fonts CDN; (f) shadow builder is one global scale, no per-elevation override; (g) no diff view against base theme; (h) no live token usage map (which component uses which token).

## 4. shadcn-vue

- **npm:** `shadcn-vue@2.8.2` (CLI). Primitives: **`reka-ui@2.10.3`** ("Vue port for Radix UI Primitives", peer `vue >=3.4.0`) — renamed from `radix-vue` at shadcn-vue v1 (Feb 2025). Depends on `tailwindcss ^4.3.2`.
- **CLI:** `pnpm dlx shadcn-vue@latest init` → prompts base color; `pnpm dlx shadcn-vue@latest add button`. Exports `shadcn-vue/registry`, `/schema`, `/icons`, `/utils`, plus a `tailwind.css` stylesheet entry.
- **Vite setup:** `pnpm add tailwindcss @tailwindcss/vite`; `src/style.css` → `@import "tailwindcss";`; `pnpm add -D @types/node`; add `baseUrl: "."` + `paths: {"@/*": ["./src/*"]}` to **both** `tsconfig.json` and `tsconfig.app.json`; `vite.config.ts` plugins `[vue(), tailwindcss()]` with `resolve.alias['@'] = path.resolve(__dirname, './src')`.
- **Token contract is byte-identical to React shadcn** — same OKLCH values, same `@theme inline`, same multiplier radius scale. `components.json` needs `tailwind.cssVariables: true` (default). This means one generator serves both.
- **Components (74):** Accordion, Alert, Alert Dialog, Aspect Ratio, Attachment, Avatar, Badge, Breadcrumb, Bubble, Button, Button Group, Calendar, Card, Carousel, Chart, Checkbox, Collapsible, Combobox, Command, Context Menu, Data Table, Date Picker, Dialog, Drawer, Dropdown Menu, Empty, Field, Form, Hover Card, Input, Input Group, Input OTP, Item, Kbd, Label, Marker, Menubar, Message, Message Scroller, Native Select, Navigation Menu, Number Field, Pagination, Pin Input, Popover, Progress, Questionnaire, Radio Group, Range Calendar, Resizable, Scroll Area, Select, Separator, Sheet, Sidebar, Skeleton, Slider, Sonner, Spinner, Stepper, Switch, Table, Tabs, Tags Input, Textarea, Toast, Toggle, Toggle Group, Tooltip, Typography.
- Vue-only extras vs React: Number Field, Pin Input, Tags Input, Stepper, Range Calendar, Typography.

## 5. Generation checklist

Emit per mode: 31 colors (incl. `destructive-foreground`) + 3 fonts + `radius` + 6 shadow primitives + `letter-spacing` + `spacing` + 8 derived `--shadow-*`; `--tracking-normal` light-only. Then `@theme inline` with 30 `--color-*`, 7 `--radius-*`, 3 `--font-*`, 8 `--shadow-*`, 6 `--tracking-*`, `--spacing`. Wrap with `@import "tailwindcss";` + `@custom-variant dark (&:is(.dark *));` + the `@layer base` block.

Sources: [ui.shadcn.com/docs/theming](https://ui.shadcn.com/docs/theming) · [shadcn-vue.com/docs/theming](https://www.shadcn-vue.com/docs/theming) · [shadcn-vue.com/docs/installation/vite](https://www.shadcn-vue.com/docs/installation/vite) · [tweakcn.com/editor/theme](https://tweakcn.com/editor/theme) · [github.com/jnsahaj/tweakcn](https://github.com/jnsahaj/tweakcn) · [npm reka-ui](https://registry.npmjs.org/reka-ui/latest) · [npm shadcn-vue](https://registry.npmjs.org/shadcn-vue/latest)