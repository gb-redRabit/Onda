import { defineConfig } from 'electron-vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

function wasmMime() {
  const setHeader = (req: any, res: any, next: () => void) => {
    const url = req.url || '';
    if (url.endsWith('.wasm') || url.includes('.wasm?')) {
      res.setHeader('Content-Type', 'application/wasm');
    }
    next();
  };
  return {
    name: 'wasm-mime',
    configureServer(server: any) {
      server.middlewares.use(setHeader);
    },
    configurePreviewServer(server: any) {
      server.middlewares.use(setHeader);
    }
  };
}

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        // Ostrzeżenie Rollupa „dynamic import will not move module into another chunk"
        // dotyczy modułów ładowanych dynamicznie CELOWO — żeby import modułu nie ciągnął
        // Electrona/`sharp`/`music-metadata` (izolacja testów), mimo że są też w statycznym
        // grafie (main to jeden bundle). To zamierzone i nieszkodliwe, więc wyciszamy tylko
        // to jedno ostrzeżenie; pozostałe przechodzą do domyślnego handlera.
        onwarn(warning, warn) {
          if (warning.message?.includes('dynamic import will not move module into another chunk')) {
            return;
          }
          warn(warning);
        }
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.ts'),
          pip: resolve('src/preload/pip.ts'),
          'audio-pip': resolve('src/preload/audio-pip.ts'),
          splash: resolve('src/preload/splash.ts')
        }
      }
    }
  },
  renderer: {
    base: './',
    plugins: [vue(), tailwindcss(), wasmMime()],
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    worker: { format: 'es' },
    css: { devSourcemap: false },
    build: {
      // Sourcemaps are generated as hidden (no `sourceMappingURL` comment) so
      // they are not loaded at runtime, but they still ship inside app.asar and
      // roughly double the packaged renderer size. Off by default for release
      // installers; enable with ONDA_SOURCEMAP=1 when a debuggable build is
      // needed (CI artifacts, local investigation).
      sourcemap: process.env.ONDA_SOURCEMAP === '1' ? 'hidden' : false,
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          pip: resolve('src/renderer/pip.html'),
          'audio-pip': resolve('src/renderer/audio-pip.html'),
          // Spike Fazy 1 (#23): ukryty Core + testowy shell. Do usunięcia po Fazie 1.
          core: resolve('src/renderer/core.html'),
          'core-test': resolve('src/renderer/core-test.html')
        },
        output: {
          manualChunks: {
            'vendor-vue': ['vue', 'vue-router', 'pinia', 'vue-i18n'],
            'vendor-ui': ['@lucide/vue', '@tanstack/vue-virtual']
          }
        }
      }
    },
    assetsInclude: ['**/*.wasm']
  }
});
