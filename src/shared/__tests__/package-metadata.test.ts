import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

// Guards against the electron-vite placeholder description coming back.

describe('package.json metadata', () => {
  const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8')) as {
    description?: string;
  };

  it('has a real project description', () => {
    expect(pkg.description).toBeTruthy();
    expect(pkg.description).not.toBe('An Electron application with Vue and TypeScript');
    expect((pkg.description ?? '').length).toBeGreaterThan(30);
  });
});
