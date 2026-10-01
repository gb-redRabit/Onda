import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

// Podczas budowania DMG dmgbuild koduje plik licencji do `mac_roman`. Znak BOM
// (U+FEFF) lub dowolny znak spoza mac_roman przerywa budowę DMG na macOS.
// Te pliki są też używane przez NSIS (Windows) i AppImage.

const ROOT = process.cwd();
const LICENSE_FILES = ['build/license_en.txt', 'build/license_pl.txt'];

describe('installer license files', () => {
  it.each(LICENSE_FILES)('%s has no UTF-8 BOM', (relative) => {
    const bytes = readFileSync(join(ROOT, relative));
    expect(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf).toBe(false);
  });

  it('build/license_en.txt is ASCII so the DMG (mac_roman) can encode it', () => {
    const text = readFileSync(join(ROOT, 'build/license_en.txt'), 'utf-8');
    // eslint-disable-next-line no-control-regex
    expect(/^[\x09\x0a\x0d\x20-\x7e]*$/.test(text)).toBe(true);
  });
});
