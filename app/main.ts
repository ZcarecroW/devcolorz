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

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
