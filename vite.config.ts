import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type ProxyOptions } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

const apiTarget = (process.env.DEVCOLORZ_API ?? 'http://127.0.0.1:8080').replace(/\/+$/, '')

/*
 * The API refuses a write whose Origin is not its own host, and `changeOrigin`
 * only rewrites Host — so every sign-in from the dev server arrived as
 * "http://localhost:5273" at a backend that expected "http://127.0.0.1:8080"
 * and was refused as a cross-site request. Rewriting Origin here keeps the
 * server as strict as it is in production and lets the documented dev setup
 * actually sign in.
 */
const rewriteOrigin: ProxyOptions['configure'] = (proxy) => {
  proxy.on('proxyReq', (proxyReq, req) => {
    if (req.headers.origin) proxyReq.setHeader('origin', apiTarget)
  })
}

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./app', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    cssCodeSplit: true,
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return
          if (id.includes('culori')) return 'color'
          if (id.includes('reka-ui')) return 'ui'
          if (id.includes('@lucide')) return 'icons'
          if (id.includes('/vue/') || id.includes('vue-router') || id.includes('pinia')) return 'vendor'
        },
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  server: {
    port: 5273,
    strictPort: false,
    // The local backend writes its database, sessions and setup files under
    // server/storage, and every write made the dev server reload the page.
    watch: { ignored: ['**/server/storage/**'] },
    proxy: {
      '/api': {
        // Point this at wherever the PHP backend is running. The local
        // default matches scripts/dev-router.php; set DEVCOLORZ_API to develop
        // the front end against a deployed instance instead.
        target: apiTarget,
        changeOrigin: true,
        secure: true,
        configure: rewriteOrigin,
      },
    },
  },
  test: {
    environment: 'node',
    include: ['app/**/*.spec.ts'],
  },
} as never)
