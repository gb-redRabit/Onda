import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { appendDownloadedItem, getDownloadedForSource } from '../sources/sources-downloaded-store';

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'onda-src-dl-test-'));
  file = join(dir, 'sources-downloaded.json');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('sources-downloaded-store', () => {
  it('returns an empty list for a missing file', async () => {
    await expect(getDownloadedForSource(file, 'src-a')).resolves.toEqual([]);
  });

  it('records and reads back per source', async () => {
    await appendDownloadedItem(file, 'src-a', 'item-1');
    await appendDownloadedItem(file, 'src-a', 'item-2');
    await appendDownloadedItem(file, 'src-b', 'item-1');

    expect(await getDownloadedForSource(file, 'src-a')).toEqual(['item-1', 'item-2']);
    expect(await getDownloadedForSource(file, 'src-b')).toEqual(['item-1']);
    expect(await getDownloadedForSource(file, 'src-c')).toEqual([]);
  });

  it('is idempotent', async () => {
    await appendDownloadedItem(file, 'src-a', 'item-1');
    await appendDownloadedItem(file, 'src-a', 'item-1');
    expect(await getDownloadedForSource(file, 'src-a')).toEqual(['item-1']);
  });

  it('ignores empty ids', async () => {
    await appendDownloadedItem(file, 'src-a', '');
    await appendDownloadedItem(file, '', 'item-1');
    expect(await getDownloadedForSource(file, 'src-a')).toEqual([]);
    await expect(readFile(file, 'utf-8')).rejects.toThrow();
  });

  it('survives a corrupt file', async () => {
    await writeFile(file, '{not json', 'utf-8');
    await expect(getDownloadedForSource(file, 'src-a')).resolves.toEqual([]);
    await appendDownloadedItem(file, 'src-a', 'item-1');
    expect(await getDownloadedForSource(file, 'src-a')).toEqual(['item-1']);
  });

  it('never loses an entry when writes overlap', async () => {
    await Promise.all([
      appendDownloadedItem(file, 'src-a', 'item-1'),
      appendDownloadedItem(file, 'src-a', 'item-2'),
      appendDownloadedItem(file, 'src-a', 'item-3')
    ]);
    const ids = await getDownloadedForSource(file, 'src-a');
    expect(ids.sort()).toEqual(['item-1', 'item-2', 'item-3']);
  });
});
