import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

// Klonowanie całej listy obrazów przez rundę JSON było niepotrzebnie kosztowne;
// zamiast tego używany jest współdzielony helper clonePlain (structuredClone).

const VIEW = readFileSync(join(process.cwd(), 'src/renderer/src/views/LibraryView.vue'), 'utf8');

describe('LibraryView image export', () => {
  it('uses clonePlain instead of an ad-hoc JSON round-trip', () => {
    expect(VIEW).not.toMatch(/JSON\.parse\(\s*JSON\.stringify/);
    expect(VIEW).toMatch(/clonePlain\(/);
  });
});
