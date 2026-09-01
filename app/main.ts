import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
// vue-sonner ships its own stylesheet and does not inline it. Without this the
// toaster renders as unstyled, unpositioned markup with no z-index, so a toast
// raised from a dialog paints *behind* the dialog overlay. It is imported
// before our own sheet so Tailwind utilities still win where they overlap.
import 'vue-sonner/style.css'
import './assets/main.css'

/*
 * Every page and preview template is a lazily loaded chunk with a content hash
 * in its name. An installation that updates itself replaces those files under
 * any tab that is still open, and the next template the visitor picks then
 * fails to load with nothing but a console error — the pane simply stays
 * blank. Vite reports that failure as `vite:preloadError`; reloading once
 * fetches the index that names the new chunks. Guarded against a loop, so a
 * chunk that is genuinely gone reloads once and then is left to the console.
 */
window.addEventListener('vite:preloadError', (event) => {
  const key = 'devcolorz:reloaded-for-chunk'
  try {
    if (sessionStorage.getItem(key) === location.href) return
    sessionStorage.setItem(key, location.href)
  } catch {
    // Without storage the guard is gone, but a reload is still the right call.
  }
  event.preventDefault()
  location.reload()
})

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
