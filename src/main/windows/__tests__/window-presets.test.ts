import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { GLASS_WINDOW_OPTS } from '../window-presets';

const PLATFORM = process.platform;

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value, configurable: true });
}

afterEach(() => {
  setPlatform(PLATFORM);
  vi.resetModules();
});

const ROOT = process.cwd();
const read = (relative: string): string => readFileSync(join(ROOT, relative), 'utf8');

describe('GLASS_WINDOW_OPTS', () => {
  it('describes a frameless, snap-friendly window', () => {
    expect(GLASS_WINDOW_OPTS.frame).toBe(false);
    expect(GLASS_WINDOW_OPTS.titleBarStyle).toBe('hidden');
    // Windows nie robi Aero Snap dla okien warstwowych (transparent: true).
    expect(GLASS_WINDOW_OPTS.transparent).toBe(false);
    expect(GLASS_WINDOW_OPTS.hasShadow).toBe(true);
    expect(GLASS_WINDOW_OPTS.backgroundColor).toBeTruthy();
  });

  it('adds macOS vibrancy only on darwin', async () => {
    setPlatform('darwin');
    vi.resetModules();
    const mod = await import('../window-presets');

    expect(mod.GLASS_WINDOW_OPTS).toMatchObject({
      vibrancy: 'sidebar',
      visualEffectState: 'active'
    });
    expect(mod.GLASS_WINDOW_OPTS).not.toHaveProperty('backgroundMaterial');
  });

  it('omits platform materials on other systems', async () => {
    setPlatform('linux');
    vi.resetModules();
    const mod = await import('../window-presets');

    expect(mod.GLASS_WINDOW_OPTS).not.toHaveProperty('vibrancy');
    expect(mod.GLASS_WINDOW_OPTS).not.toHaveProperty('backgroundMaterial');
  });
});

describe('glass window options are shared, not copied', () => {
  const index = read('src/main/index.ts');
  const explorer = read('src/main/windows/explorer-windows.ts');

  it.each([
    ['src/main/index.ts', index],
    ['src/main/windows/explorer-windows.ts', explorer]
  ])('%s uses GLASS_WINDOW_OPTS', (_name, source) => {
    expect(source).toContain('GLASS_WINDOW_OPTS');
  });

  it('does not re-inline the acrylic/vibrancy block', () => {
    expect(index).not.toMatch(/backgroundMaterial: 'acrylic'/);
    expect(explorer).not.toMatch(/backgroundMaterial: 'acrylic'/);
  });
});
