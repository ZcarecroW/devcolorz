import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

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
    path: '/p/:state',
    name: 'shared',
    component: () => import('@/pages/StudioPage.vue'),
    meta: { title: 'Palette' },
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

router.afterEach((to) => {
  const title = (to.meta.title as string | undefined) ?? ''
  document.title = title ? `${title} · DevColorz` : 'DevColorz'
})
