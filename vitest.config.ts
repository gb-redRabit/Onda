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
      // Mierzymy też `.vue` (skrypt komponentu): testy montujące istnieją, a bez
      // tego wpisu ich pokrycie było niewidoczne. Progi ustawiamy po pomiarze.
      include: ['src/**/*.ts', 'src/**/*.vue'],
      // Pomijamy to, co nie jest logiką: testy, deklaracje typów oraz słowniki
      // i18n (dane) — inaczej zaciemniają sygnał pokrycia. Komponenty `.vue`
      // są mierzone; testy montujące pokrywają krytyczne z nich.
      exclude: [
        'src/**/__tests__/**',
        'src/**/*.test.ts',
        'src/**/*.d.ts',
        'src/renderer/src/locales/**'
      ],
      // Progi są ratchetem: trzymają pokrycie blisko aktualnego poziomu, żeby
      // kolejne zmiany nie mogły go po cichu obniżyć. Próg gałęzi musi jednak
      // mieścić różnice platformowe: Ubuntu ma inne ścieżki systemowe i wypada
      // niżej niż Windows.
      // Pomiar (2026-11-21): Windows linie 99.82%, instrukcje 99.44%,
      // funkcje 99.77%, gałęzie 97.76%; Ubuntu gałęzie 97.71%. Próg 97.65
      // zostawia ~0.06 pp zapasu i nadal wyłapuje realny spadek.
      thresholds: {
        lines: 99.7,
        statements: 99.35,
        functions: 99.75,
        branches: 97.65
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
          include: ['src/main/**/*.test.ts', 'src/preload/**/*.test.ts', 'scripts/**/*.test.ts']
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
          // vmThreads tworzy jedno środowisko jsdom na wątek zamiast na plik:
          // pomiar na tym repo to ~5.5 s vs ~19.8 s (162 pliki), przy zachowanej
          // izolacji plików. Testy nie mogą podmieniać całego `window` —
          // stubuj tylko `window.api`.
          pool: 'vmThreads',
          globals: true,
          setupFiles: ['src/renderer/src/vitest.setup.ts'],
          include: ['src/renderer/**/*.test.ts', 'src/shared/**/*.test.ts']
        }
      }
    ]
  }
});
