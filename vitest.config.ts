import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

const alias = {
  '@renderer': resolve('src/renderer/src'),
  '@shared': resolve('src/shared')
};

// Dwa „projekty”: testy procesu głównego/scripts działają w środowisku `node`,
// a renderer (komponenty .vue, DOM) w `jsdom`. Wcześniej WSZYSTKIE testy tworzyły
// jsdom (~280×, ~70% czasu testów), mimo że main go nie potrzebuje.
// `extends: false` — każdy projekt definiuje własne opcje, żeby nie dziedziczyć
// (`setupFiles`/`include`) drugiego środowiska.
export default defineConfig({
  test: {
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
    },
    projects: [
      {
        // Proces główny + skrypty narzędziowe: bez DOM.
        extends: false,
        resolve: { alias },
        test: {
          name: 'main',
          environment: 'node',
          globals: true,
          include: ['src/main/**/*.test.ts', 'scripts/**/*.test.ts']
        }
      },
      {
        // Renderer: komponenty .vue + DOM.
        extends: false,
        plugins: [vue()],
        resolve: { alias },
        test: {
          name: 'renderer',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['src/renderer/src/vitest.setup.ts'],
          include: ['src/renderer/**/*.test.ts', 'src/shared/**/*.test.ts']
        }
      }
    ]
  }
});
