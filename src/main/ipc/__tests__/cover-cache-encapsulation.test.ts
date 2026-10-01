import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

// The cover/duration maps used to be exported directly, so any caller could
// `set`/`clear`/`delete` and bypass the eviction cap. They are now private and
// reachable only through accessors.

const SOURCE = readFileSync(join(process.cwd(), 'src/main/ipc/cover-cache.ts'), 'utf8');

describe('cover cache encapsulation', () => {
  it('does not export the mutable caches or cacheSet', () => {
    expect(SOURCE).not.toMatch(/export const coverResultCache/);
    expect(SOURCE).not.toMatch(/export const durationCache/);
    expect(SOURCE).not.toMatch(/export function cacheSet/);
  });

  it('exposes accessors instead', () => {
    expect(SOURCE).toMatch(/export function invalidateCachedCover/);
    expect(SOURCE).toMatch(/export function getCachedDuration/);
    expect(SOURCE).toMatch(/export function setCachedDuration/);
    expect(SOURCE).toMatch(/export function deleteCachedDuration/);
  });
});
