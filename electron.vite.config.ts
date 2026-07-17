import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

function wasmMime() {
  const setHeader = (req: any, res: any, next: () => void) => {
    const url = req.url || ''
    if (url.endsWith('.wasm') || url.includes('.wasm?')) {
      res.setHeader('Content-Type', 'application/wasm')
    }
    next()
  }
  return {
    name: 'wasm-mime',
    configureServer(server: any) {
      server.middlewares.use(setHeader)
    },
    configurePreviewServer(server: any) {
      server.middlewares.use(setHeader)
    }
  }
}

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: {
    plugins: [vue(), tailwindcss(), wasmMime()],
    resolve: { alias: { '@renderer': resolve('src/renderer/src') } },
    worker: { format: 'es' },
    css: { devSourcemap: false },
    build: {
      sourcemap: false
    },
    assetsInclude: ['**/*.wasm']
  }
})
