import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

// Cloning the whole image list with a JSON round-trip was needlessly expensive;
// the shared clonePlain (structuredClone) helper is used instead.

const VIEW = readFileSync(join(process.cwd(), 'src/renderer/src/views/LibraryView.vue'), 'utf8');

describe('LibraryView image export', () => {
  it('uses clonePlain instead of an ad-hoc JSON round-trip', () => {
    expect(VIEW).not.toMatch(/JSON\.parse\(\s*JSON\.stringify/);
    expect(VIEW).toMatch(/clonePlain\(/);
  });
});
