import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { saveAllSources, reorderSources } from '../sources/sources-store';
import type { MediaSource } from '../../../shared/types/sources';

function src(id: string): MediaSource {
  return {
    id,
    name: id,
    baseUrl: 'https://x.example',
    auth: { type: 'none' },
    createdAt: 0,
    endpoints: [{ id: `${id}-e`, name: 'E', method: 'GET', path: '/', mapping: { fields: {} } }]
  };
}

let dir = '';
let file = '';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'onda-reorder-'));
  file = join(dir, 'sources.json');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('reorderSources', () => {
  it('reorders by the given id list', async () => {
    await saveAllSources(file, [src('a'), src('b'), src('c')]);
    const out = await reorderSources(file, ['c', 'a', 'b']);
    expect(out.map((s) => s.id)).toEqual(['c', 'a', 'b']);
  });

  it('keeps ids absent from the input at the end (no source dropped)', async () => {
    await saveAllSources(file, [src('a'), src('b'), src('c')]);
    const out = await reorderSources(file, ['b']);
    expect(out.map((s) => s.id)).toEqual(['b', 'a', 'c']);
  });

  it('is a no-op for an empty order (keeps existing order)', async () => {
    await saveAllSources(file, [src('a'), src('b')]);
    const out = await reorderSources(file, []);
    expect(out.map((s) => s.id)).toEqual(['a', 'b']);
  });
});
