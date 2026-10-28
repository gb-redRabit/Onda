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
      // Progi są minimalnym progiem regresji. Po włączeniu `.vue` do pomiaru
      // mianownik urósł o ~11.6k linii (w tym nieprzetestowane widoki narzędzi),
      // więc progi są przeliczone na nowy mianownik, a nie obniżone względem
      // pokrytego kodu.
      // Pomiar (2026-10-28): linie 33.38%, instrukcje 32.63%, funkcje 26.52%, gałęzie 28.98%.
      thresholds: {
        lines: 32,
        statements: 31,
        functions: 26,
        branches: 28
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
