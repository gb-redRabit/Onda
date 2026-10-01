import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// App.vue posiada okablowanie na poziomie aplikacji, które trudno zamontować w teście jednostkowym (brak
// @vue/test-utils w tym repo), więc te kontrole strukturalne chronią dokładnie te
// regresje, które wskazał audyt.

const ROOT = process.cwd();
const APP = readFileSync(join(ROOT, 'src/renderer/src/App.vue'), 'utf8');
const EN = readFileSync(join(ROOT, 'src/renderer/src/locales/en.ts'), 'utf8');
const PL = readFileSync(join(ROOT, 'src/renderer/src/locales/pl.ts'), 'utf8');

describe('App.vue wiring', () => {
  it('updates the narrow layout on resize without debouncing', () => {
    expect(APP).toMatch(/applyNarrowLayout\(/);
    expect(APP).toMatch(/addEventListener\('resize'/);
    expect(APP).not.toMatch(/debounce\(/);
  });

  it('renders a single QueuePanel across layouts', () => {
    // Dwie instancje (szeroka + wąska) odmontowywały się/montowały przy resize i gubiły
    // pozycję przewinięcia kolejki.
    const instances = APP.match(/<QueuePanel\b/g) ?? [];
    expect(instances).toHaveLength(1);
  });

  it('precomputes navigation shortcut bindings', () => {
    expect(APP).toMatch(/navShortcutBindings/);
    // Tabela akcji per keydown zniknęła.
    expect(APP).not.toMatch(/const navActions/);
  });

  it('gives feedback when the view-search shortcut is unavailable', () => {
    // Gałąź skrótu musi powiadamiać zamiast po cichu zwracać.
    expect(APP).toMatch(/ui\.notify\(/);
    expect(APP).toMatch(/menu\.viewSearchUnavailable/);
    expect(EN).toContain('viewSearchUnavailable');
    expect(PL).toContain('viewSearchUnavailable');
  });
});
