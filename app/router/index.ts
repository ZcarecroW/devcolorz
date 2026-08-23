import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import { useSessionStore } from '@/stores/session'

/**
 * Hash history, deliberately.
 *
 * The app deploys to shared Apache hosting where a rewrite rule is the only
 * way to make history mode work, and a single mis-copied `.htaccess` turns
 * every deep link into a 404. Hash routing has no server-side requirement at
 * all, and it also means palette state in the fragment never reaches the
 * server — palettes stay out of access logs.
 */
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'studio',
    component: () => import('@/pages/StudioPage.vue'),
    meta: { title: 'Generator' },
  },
  {
    // The same page as `studio`, with the palette in the path. The studio
    // rewrites the address bar as you work, so this is the record the app
    // spends most of its time on — hence the same title, not "Palette".
    path: '/p/:state',
    name: 'shared',
    component: () => import('@/pages/StudioPage.vue'),
    meta: { title: 'Generator' },
  },
  {
    path: '/theme',
    name: 'theme',
    component: () => import('@/pages/ThemePage.vue'),
    meta: { title: 'Theme editor' },
  },
  {
    path: '/explore',
    name: 'explore',
    component: () => import('@/pages/ExplorePage.vue'),
    meta: { title: 'Explore' },
  },
  {
    path: '/library',
    name: 'library',
    component: () => import('@/pages/LibraryPage.vue'),
    meta: { title: 'My palettes', requiresAuth: true },
  },
  {
    path: '/s/:slug',
    name: 'public-palette',
    component: () => import('@/pages/PublicPalettePage.vue'),
    meta: { title: 'Palette' },
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/pages/auth/LoginPage.vue'),
    meta: { title: 'Sign in', guestOnly: true },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('@/pages/auth/RegisterPage.vue'),
    meta: { title: 'Create account', guestOnly: true },
  },
  {
    path: '/verify',
    name: 'verify',
    component: () => import('@/pages/auth/VerifyPage.vue'),
    meta: { title: 'Confirm email' },
  },
  {
    path: '/forgot',
    name: 'forgot',
    component: () => import('@/pages/auth/ForgotPage.vue'),
    meta: { title: 'Reset password', guestOnly: true },
  },
  {
    path: '/reset',
    name: 'reset',
    component: () => import('@/pages/auth/ResetPage.vue'),
    meta: { title: 'Choose a new password' },
  },
  {
    path: '/account',
    name: 'account',
    component: () => import('@/pages/AccountPage.vue'),
    meta: { title: 'Account', requiresAuth: true },
  },
  {
    path: '/admin',
    name: 'admin',
    component: () => import('@/pages/admin/AdminPage.vue'),
    meta: { title: 'Admin', requiresAdmin: true },
  },
  {
    path: '/setup',
    name: 'setup',
    component: () => import('@/pages/SetupPage.vue'),
    meta: { title: 'Set up DevColorz' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/pages/NotFoundPage.vue'),
    meta: { title: 'Not found' },
  },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior(_to, _from, saved) {
    return saved ?? { top: 0 }
  },
})

/**
 * Enforce the route metadata.
 *
 * `requiresAuth`, `requiresAdmin` and `guestOnly` were declared on the records
 * and read by nothing — every page carried its own copy of the check, so a
 * signed-in visitor could open the sign-in form and an anonymous one landed on
 * the admin console's "you cannot see this" panel instead of being sent
 * somewhere useful.
 *
 * The guard awaits `bootstrap()` rather than reading `ready`: it runs on the
 * very first navigation, before the app has mounted, so the answer does not
 * exist yet. `bootstrap()` is idempotent, so this costs one request in total.
 *
 * It only waits for routes whose answer depends on who you are. The studio
 * needs no backend, and holding first paint behind two round-trips to a server
 * that may not be there is a worse failure than a redirect arriving a moment
 * late. The sign-in wall is applied again from `App.vue` once the metadata has
 * landed, which is what covers the very first navigation.
 */
const OPEN_TO_ALL = ['login', 'register', 'forgot', 'reset', 'verify', 'setup', 'not-found']

/** True when this instance refuses anonymous visitors and this is not an auth page. */
export function blockedForAnonymous(
  session: ReturnType<typeof useSessionStore>,
  name: unknown,
): boolean {
  return Boolean(
    session.meta?.installed &&
      session.meta.features.anonymous === false &&
      !session.isAuthenticated &&
      !OPEN_TO_ALL.includes(String(name)),
  )
}

router.beforeEach(async (to) => {
  const session = useSessionStore()

  // Only the routes whose answer depends on who you are wait for the server.
  // Everything else — the studio above all, which needs no backend at all —
  // renders immediately and picks up the session when it arrives.
  const needsSession =
    Boolean(to.meta.requiresAuth || to.meta.requiresAdmin || to.meta.guestOnly) ||
    blockedForAnonymous(session, to.name)
  if (!needsSession) {
    void session.bootstrap()
    return true
  }
  await session.bootstrap()

  // No forced redirect to the wizard: the generator is fully usable before
  // anyone installs anything, and the header already offers "Finish setup".
  // The wizard itself says so when it is opened on an installed instance.
  if (to.meta.guestOnly && session.isAuthenticated) {
    return { name: 'studio' }
  }
  if (to.meta.requiresAdmin && !session.isAdmin) {
    return session.isAuthenticated
      ? { name: 'studio' }
      : { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.meta.requiresAuth && !session.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  /*
   * The sign-in wall the "Anonymous use" setting promises.
   *
   * Only meaningful client-side: the generator never talks to the server, so
   * there is no endpoint to gate. Auth and the setup wizard stay reachable, or
   * there would be no way through the wall.
   */
  if (blockedForAnonymous(session, to.name)) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  return true
})

router.afterEach((to) => {
  const title = (to.meta.title as string | undefined) ?? ''
  document.title = title ? `${title} · DevColorz` : 'DevColorz'
})
