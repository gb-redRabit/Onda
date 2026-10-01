import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// App.vue owns app-level wiring that is hard to mount in a unit test (no
// @vue/test-utils in this repo), so these structural checks guard the exact
// regressions the audit called out.

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
    // Two instances (wide + narrow) unmounted/remounted on resize and dropped
    // the queue scroll position.
    const instances = APP.match(/<QueuePanel\b/g) ?? [];
    expect(instances).toHaveLength(1);
  });

  it('precomputes navigation shortcut bindings', () => {
    expect(APP).toMatch(/navShortcutBindings/);
    // The per-keydown action table is gone.
    expect(APP).not.toMatch(/const navActions/);
  });

  it('gives feedback when the view-search shortcut is unavailable', () => {
    // The shortcut branch must notify instead of silently returning.
    expect(APP).toMatch(/ui\.notify\(/);
    expect(APP).toMatch(/menu\.viewSearchUnavailable/);
    expect(EN).toContain('viewSearchUnavailable');
    expect(PL).toContain('viewSearchUnavailable');
  });
});
