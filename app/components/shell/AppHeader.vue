<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  Compass,
  LayoutGrid,
  LogOut,
  Menu,
  Palette,
  Settings,
  Shield,
  Sparkles,
  User,
} from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import AppearanceToggle from '@/components/shell/AppearanceToggle.vue'
import GithubLink from '@/components/shell/GithubLink.vue'
import MileloLink from '@/components/shell/MileloLink.vue'
import BrandMark from '@/components/shell/BrandMark.vue'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const route = useRoute()
const router = useRouter()

const links = computed(() =>
  [
    { name: 'studio', label: 'Generator', icon: Sparkles },
    { name: 'theme', label: 'Theme', icon: Palette },
    { name: 'explore', label: 'Explore', icon: Compass, hidden: !session.meta?.features.explore },
    { name: 'library', label: 'Library', icon: LayoutGrid, hidden: !session.isAuthenticated },
  ].filter((link) => !link.hidden),
)

const initials = computed(() => {
  const name = session.user?.displayName || session.user?.email || ''
  return name.slice(0, 2).toUpperCase() || '?'
})

const isActive = (name: string) =>
  route.name === name || (name === 'studio' && route.name === 'shared')

async function signOut() {
  // logout() clears the local session in a `finally`, so the header always
  // updates — but if the request never reached the server the cookie is still
  // valid there. Saying "Signed out" then would be a lie, and without a catch
  // the redirect never ran either, leaving the user sitting on a page they no
  // longer appear to have access to.
  let reachedServer = true
  try {
    await session.logout()
  } catch {
    reachedServer = false
  }
  if (!reachedServer) {
    toast.warning('Signed out on this device only', {
      description: 'The server could not be reached, so the session may still be open elsewhere.',
    })
    if (route.meta.requiresAuth || route.meta.requiresAdmin) void router.push({ name: 'studio' })
    return
  }
  toast.success('Signed out')
  if (route.meta.requiresAuth || route.meta.requiresAdmin) void router.push({ name: 'studio' })
}
</script>

<template>
  <!--
    Every mark on the right is `shrink-0`, and the gaps close up below `sm`:
    on a 375px screen the row used to be about 45px too wide, and flex took
    the difference out of the one item that had no minimum — the MILELO link,
    whose mark was crushed to nothing while the wordmark beside it kept its
    space. What gives now is the brand text, which truncates, and the "Sign
    in" caption, which becomes its icon.
  -->
  <header
    class="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-1 border-b bg-background/85 px-3 backdrop-blur-sm supports-[backdrop-filter]:bg-background/70 sm:gap-2 md:px-4"
  >
    <Sheet>
      <SheetTrigger as-child>
        <Button variant="ghost" size="icon" class="md:hidden" aria-label="Open navigation">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" class="w-64 p-0">
        <SheetHeader class="border-b px-4 py-3">
          <SheetTitle><BrandMark /></SheetTitle>
        </SheetHeader>
        <nav class="flex flex-col gap-1 p-2">
          <RouterLink
            v-for="link in links"
            :key="link.name"
            :to="{ name: link.name }"
            class="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
            :class="isActive(link.name) && 'bg-accent text-accent-foreground'"
          >
            <component :is="link.icon" class="size-4" />
            {{ link.label }}
          </RouterLink>
        </nav>
      </SheetContent>
    </Sheet>

    <RouterLink :to="{ name: 'studio' }" class="flex min-w-0 items-center gap-2 rounded-md pr-1 sm:pr-2">
      <BrandMark />
    </RouterLink>

    <nav class="ml-2 hidden items-center gap-1 md:flex">
      <Button
        v-for="link in links"
        :key="link.name"
        as-child
        variant="ghost"
        size="sm"
        :class="isActive(link.name) ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'"
      >
        <RouterLink :to="{ name: link.name }">
          <component :is="link.icon" />
          {{ link.label }}
        </RouterLink>
      </Button>
    </nav>

    <div class="min-w-2 flex-1" />

    <MileloLink />
    <GithubLink />
    <AppearanceToggle />

    <template v-if="session.ready">
      <DropdownMenu v-if="session.isAuthenticated">
        <DropdownMenuTrigger as-child>
          <Button variant="ghost" size="icon" class="shrink-0 rounded-full" aria-label="Account menu">
            <span
              class="flex size-7 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground"
            >
              {{ initials }}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-56">
          <DropdownMenuLabel class="truncate font-normal">
            <span class="block text-sm font-medium">{{ session.user?.displayName || 'Account' }}</span>
            <span class="block truncate text-xs text-muted-foreground">{{ session.user?.email }}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem as-child>
            <RouterLink :to="{ name: 'library' }"><LayoutGrid /> My palettes</RouterLink>
          </DropdownMenuItem>
          <DropdownMenuItem as-child>
            <RouterLink :to="{ name: 'account' }"><Settings /> Account settings</RouterLink>
          </DropdownMenuItem>
          <DropdownMenuItem v-if="session.isAdmin" as-child>
            <RouterLink :to="{ name: 'admin' }"><Shield /> Admin</RouterLink>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" @select="signOut">
            <LogOut /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div v-else-if="session.meta?.installed" class="flex shrink-0 items-center gap-1">
        <Button as-child variant="ghost" size="sm">
          <RouterLink :to="{ name: 'login' }" aria-label="Sign in" title="Sign in">
            <User /><span class="hidden sm:inline">Sign in</span>
          </RouterLink>
        </Button>
        <Button v-if="session.canRegister" as-child size="sm" class="hidden sm:inline-flex">
          <RouterLink :to="{ name: 'register' }">Create account</RouterLink>
        </Button>
      </div>

      <Button v-else-if="session.needsSetup" as-child size="sm" variant="destructive" class="shrink-0">
        <RouterLink :to="{ name: 'setup' }"><Shield /> Finish setup</RouterLink>
      </Button>
    </template>
  </header>
</template>
