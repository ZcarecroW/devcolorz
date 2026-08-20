import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

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
    proxy: {
      '/api': {
        target: process.env.DEVCOLORZ_API ?? 'https://devcolorz.fabula.vision',
        changeOrigin: true,
        secure: true,
      },
    },
  },
  test: {
    environment: 'node',
    include: ['app/**/*.spec.ts'],
  },
} as never)
