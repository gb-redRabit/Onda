import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { GLASS_WINDOW_OPTS } from '../window-presets';

const ROOT = process.cwd();
const read = (relative: string): string => readFileSync(join(ROOT, relative), 'utf8');

describe('GLASS_WINDOW_OPTS', () => {
  it('describes a frameless transparent window', () => {
    expect(GLASS_WINDOW_OPTS.frame).toBe(false);
    expect(GLASS_WINDOW_OPTS.titleBarStyle).toBe('hidden');
    expect(GLASS_WINDOW_OPTS.hasShadow).toBe(false);
    expect(GLASS_WINDOW_OPTS.transparent).toBe(true);
    expect(GLASS_WINDOW_OPTS.backgroundColor).toBe('#00000000');
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
