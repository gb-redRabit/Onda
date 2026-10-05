import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@renderer': resolve('src/renderer/src'), '@shared': resolve('src/shared') }
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    globals: true,
    setupFiles: ['src/renderer/src/vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary'],
      include: ['src/**/*.ts'],
      // Pomijamy to, co nie jest logiką: testy, deklaracje typów oraz słowniki
      // i18n (dane) — inaczej zaciemniają sygnał pokrycia. Komponenty `.vue`
      // też są poza zakresem: nie ma testów montujących, więc ich pokrycie
      // mierzy się przez E2E.
      exclude: [
        'src/**/__tests__/**',
        'src/**/*.test.ts',
        'src/**/*.d.ts',
        'src/renderer/src/locales/**'
      ],
      // Progi są minimalnym progiem regresji, ustawionym nieco poniżej
      // dzisiejszego pomiaru. Vitest 5 (provider v8) instrumentuje także pliki,
      // które nie ładują się w jsdom bez Electrona, więc pomiar jest niższy niż
      // przed aktualizacją (linie ~33.8%, instrukcje ~33.1%, funkcje ~31.6%,
      // gałęzie ~30.0%). Mają łapać spadki, nie blokować rozwoju.
      thresholds: {
        lines: 33,
        statements: 32,
        functions: 30,
        branches: 29
      }
    }
  }
});
