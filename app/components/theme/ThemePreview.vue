<script setup lang="ts">
/**
 * The component playground the theme editor previews against.
 *
 * It renders the real shadcn-vue components rather than coloured rectangles,
 * because rectangles hide exactly the failures that matter: a primary button
 * whose label disappears, a border that vanishes against the card, a focus
 * ring nobody can see. Everything here is painted by Tailwind's semantic
 * utilities, so it repaints from the tokens with no wiring of its own.
 */
import { ref } from 'vue'
import { CircleAlert, Info, TrendingUp } from '@lucide/vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

/*
 * Tailwind only emits classes it can see as literal text, so the chart colours
 * are written out rather than built from an index.
 */
const SERIES = [
  { label: 'Organic', share: 38, dot: 'bg-chart-1', bar: 'bg-chart-1' },
  { label: 'Referral', share: 24, dot: 'bg-chart-2', bar: 'bg-chart-2' },
  { label: 'Direct', share: 18, dot: 'bg-chart-3', bar: 'bg-chart-3' },
  { label: 'Social', share: 13, dot: 'bg-chart-4', bar: 'bg-chart-4' },
  { label: 'Paid', share: 7, dot: 'bg-chart-5', bar: 'bg-chart-5' },
]

const ROWS = [
  { id: 'INV-2043', client: 'Kestrel Labs', status: 'Paid', amount: '$4,200' },
  { id: 'INV-2044', client: 'Northwind', status: 'Pending', amount: '$1,850' },
  { id: 'INV-2045', client: 'Halcyon Media', status: 'Overdue', amount: '$960' },
]

const SHADOWS = [
  { label: '2xs', class: 'shadow-2xs' },
  { label: 'xs', class: 'shadow-xs' },
  { label: 'sm', class: 'shadow-sm' },
  { label: 'md', class: 'shadow-md' },
  { label: 'lg', class: 'shadow-lg' },
  { label: 'xl', class: 'shadow-xl' },
  { label: '2xl', class: 'shadow-2xl' },
]

const RADII = [
  { label: 'xs', class: 'rounded-xs' },
  { label: 'sm', class: 'rounded-sm' },
  { label: 'md', class: 'rounded-md' },
  { label: 'lg', class: 'rounded-lg' },
  { label: 'xl', class: 'rounded-xl' },
  { label: '2xl', class: 'rounded-2xl' },
  { label: '3xl', class: 'rounded-3xl' },
]

const notify = ref(true)
const dialogOpen = ref(false)
const email = ref('ada@example.com')
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Navigation rail: the only place the eight sidebar tokens are visible. -->
    <div class="flex overflow-hidden rounded-xl border shadow-sm">
      <nav
        class="hidden w-44 shrink-0 flex-col gap-1 border-r border-sidebar-border bg-sidebar p-2 text-sidebar-foreground sm:flex"
        aria-label="Preview navigation"
      >
        <span class="px-2 py-1 text-[10px] font-semibold tracking-wider text-sidebar-foreground/60 uppercase">
          Workspace
        </span>
        <span class="rounded-md bg-sidebar-primary px-2 py-1.5 text-xs font-medium text-sidebar-primary-foreground">
          Overview
        </span>
        <span class="rounded-md bg-sidebar-accent px-2 py-1.5 text-xs text-sidebar-accent-foreground">
          Invoices
        </span>
        <span class="rounded-md px-2 py-1.5 text-xs">Customers</span>
        <span class="rounded-md px-2 py-1.5 text-xs">Settings</span>
      </nav>

      <div class="min-w-0 flex-1 bg-background p-4">
        <Tabs default-value="controls" class="gap-3">
          <TabsList>
            <TabsTrigger value="controls">Controls</TabsTrigger>
            <TabsTrigger value="data">Data</TabsTrigger>
            <TabsTrigger value="feedback">Feedback</TabsTrigger>
          </TabsList>

          <TabsContent value="controls" class="flex flex-col gap-4">
            <div class="flex flex-wrap items-center gap-2">
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Delete</Button>
              <Button variant="link">Link</Button>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <Button size="sm">Small</Button>
              <Button size="lg">Large</Button>
              <Button disabled>Disabled</Button>
              <Badge>Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="outline">Outline</Badge>
              <Badge variant="destructive">Overdue</Badge>
            </div>

            <Separator />

            <div class="grid gap-3 sm:grid-cols-2">
              <div class="flex flex-col gap-1.5">
                <Label for="preview-email">Work email</Label>
                <Input
                  id="preview-email"
                  :model-value="email"
                  type="email"
                  placeholder="you@example.com"
                  @update:model-value="email = String($event)"
                />
                <p class="text-xs text-muted-foreground">We use this for receipts only.</p>
              </div>
              <div class="flex flex-col gap-1.5">
                <Label for="preview-invalid">Invalid state</Label>
                <Input id="preview-invalid" model-value="not-an-email" aria-invalid="true" />
                <p class="text-xs text-destructive">Enter a full email address.</p>
              </div>
            </div>

            <div class="flex items-center gap-3 rounded-lg bg-muted p-3">
              <Switch id="preview-switch" v-model="notify" />
              <Label for="preview-switch" class="text-sm">Email me when a payment clears</Label>
            </div>
          </TabsContent>

          <TabsContent value="data" class="flex flex-col gap-4">
            <div class="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead class="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="row in ROWS" :key="row.id">
                    <TableCell class="font-mono text-xs">{{ row.id }}</TableCell>
                    <TableCell>{{ row.client }}</TableCell>
                    <TableCell>
                      <Badge :variant="row.status === 'Overdue' ? 'destructive' : 'secondary'">
                        {{ row.status }}
                      </Badge>
                    </TableCell>
                    <TableCell class="text-right tabular-nums">{{ row.amount }}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            <!-- Chart tokens, exercised as both a legend and the marks themselves. -->
            <div class="flex flex-col gap-2 rounded-lg border p-3">
              <div class="flex items-center gap-1.5 text-xs font-medium">
                <TrendingUp class="size-3.5 text-muted-foreground" aria-hidden="true" />
                Traffic by source
              </div>
              <div class="flex h-24 items-end gap-2" role="img" aria-label="Traffic by source, five series">
                <div v-for="series in SERIES" :key="series.label" class="flex-1">
                  <div
                    class="rounded-t-sm"
                    :class="series.bar"
                    :style="{ height: `${series.share * 2}px` }"
                  />
                </div>
              </div>
              <div class="flex flex-wrap gap-x-4 gap-y-1">
                <span
                  v-for="series in SERIES"
                  :key="series.label"
                  class="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <span class="size-2 rounded-full" :class="series.dot" aria-hidden="true" />
                  {{ series.label }}
                  <span class="tabular-nums">{{ series.share }}%</span>
                </span>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="feedback" class="flex flex-col gap-3">
            <Alert>
              <Info aria-hidden="true" />
              <AlertTitle>Draft saved</AlertTitle>
              <AlertDescription>
                Your changes are stored locally until you publish them.
              </AlertDescription>
            </Alert>

            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertTitle>Payment failed</AlertTitle>
              <AlertDescription>
                The card was declined. Update it to keep the subscription active.
              </AlertDescription>
            </Alert>

            <Dialog v-model:open="dialogOpen">
              <DialogTrigger as-child>
                <Button variant="outline">Open a dialog</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete this workspace?</DialogTitle>
                  <DialogDescription>
                    Everything inside it goes with it. This cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="ghost" @click="dialogOpen = false">Cancel</Button>
                  <Button variant="destructive" @click="dialogOpen = false">Delete</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>
        </Tabs>
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Pro plan</CardTitle>
          <CardDescription>Everything in Starter, plus unlimited palettes.</CardDescription>
          <CardAction>
            <Badge variant="secondary">Current</Badge>
          </CardAction>
        </CardHeader>
        <CardContent class="flex flex-col gap-2">
          <p class="text-3xl font-semibold tracking-tight tabular-nums">$18</p>
          <p class="text-sm text-muted-foreground">per editor, per month, billed yearly.</p>
        </CardContent>
        <CardFooter class="gap-2">
          <Button class="flex-1">Upgrade</Button>
          <Button variant="outline">Compare</Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Type and shape</CardTitle>
          <CardDescription>The tokens that are not colors, and are still felt.</CardDescription>
        </CardHeader>
        <CardContent class="flex flex-col gap-3">
          <p class="font-sans text-base">Sans — the interface voice</p>
          <p class="font-serif text-base">Serif — long-form and editorial</p>
          <p class="font-mono text-sm">Mono — oklch(0.54 0.21 294.8)</p>

          <Separator />

          <div class="flex flex-wrap items-end gap-2">
            <div v-for="radius in RADII" :key="radius.label" class="flex flex-col items-center gap-1">
              <span class="size-8 border bg-muted" :class="radius.class" />
              <span class="font-mono text-[9px] text-muted-foreground">{{ radius.label }}</span>
            </div>
          </div>

          <div class="flex flex-wrap items-end gap-2">
            <div v-for="shadow in SHADOWS" :key="shadow.label" class="flex flex-col items-center gap-1">
              <span class="size-8 rounded-md bg-card" :class="shadow.class" />
              <span class="font-mono text-[9px] text-muted-foreground">{{ shadow.label }}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Popover surfaces are otherwise only visible for as long as one is open. -->
    <div class="rounded-xl border bg-popover p-4 text-popover-foreground shadow-md">
      <p class="text-sm font-medium">Popover surface</p>
      <p class="mt-1 text-xs text-muted-foreground">
        Dropdowns, tooltips and the command palette all sit on this. It should read as being above
        the card, not beside it.
      </p>
    </div>
  </div>
</template>
