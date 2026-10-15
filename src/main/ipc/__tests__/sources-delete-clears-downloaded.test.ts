import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import type { MediaSource } from '../../../shared/types/sources';

// Handler `sources:delete` ma też czyścić oznaczenia „pobrane" usuwanego źródła.
const handlers = new Map<string, (...args: unknown[]) => unknown>();
let userData = '';
let dialogPath = '';

vi.mock('electron', () => ({
  app: { getPath: () => userData, isPackaged: false, getVersion: () => '0.0.0-test' },
  ipcMain: { handle: (ch: string, fn: (...a: unknown[]) => unknown) => handlers.set(ch, fn) },
  BrowserWindow: { fromWebContents: () => null },
  dialog: {
    showSaveDialog: async () => ({ canceled: false, filePath: dialogPath }),
    showOpenDialog: async () => ({ canceled: false, filePaths: [dialogPath] })
  },
  shell: {}
}));
vi.mock('../cover/cover-cache', () => ({
  getStore: async () => ({ get: () => ({}), set: () => {} })
}));
vi.mock('../../downloads/download-manager', () => ({
  addDownloadJobs: async () => [],
  setSourceItemDownloadedHandler: () => {}
}));
vi.mock('../player-scraper', () => ({ scrapePlayerUrl: async () => null }));

const { registerSourcesHandlers } = await import('../sources/sources-handlers');
const { appendDownloadedItem, getDownloadedForSource } =
  await import('../sources/sources-downloaded-store');

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = handlers.get(channel);
  if (!handler) throw new Error(`channel ${channel} is not registered`);
  return Promise.resolve(handler({ sender: {} }, ...args));
}

const source: MediaSource = {
  id: 's1',
  name: 'S',
  baseUrl: 'https://x.example',
  auth: { type: 'none' },
  createdAt: 0,
  endpoints: [{ id: 'e', name: 'E', method: 'GET', path: '/', mapping: { fields: {} } }]
};

beforeEach(async () => {
  userData = await mkdtemp(join(tmpdir(), 'onda-src-del-'));
  handlers.clear();
  registerSourcesHandlers();
});

afterEach(async () => {
  await rm(userData, { recursive: true, force: true });
});

describe('sources:delete', () => {
  it('clears the downloaded marks of the removed source', async () => {
    await invoke('sources:save', source);
    const downloadedFile = join(userData, 'sources-downloaded.json');
    await appendDownloadedItem(downloadedFile, 's1', 'item-1');
    expect(await getDownloadedForSource(downloadedFile, 's1')).toEqual(['item-1']);

    await invoke('sources:delete', 's1');

    expect(await getDownloadedForSource(downloadedFile, 's1')).toEqual([]);
  });

  it('leaves other sources’ marks intact', async () => {
    await invoke('sources:save', source);
    await invoke('sources:save', { ...source, id: 's2', name: 'S2' });
    const downloadedFile = join(userData, 'sources-downloaded.json');
    await appendDownloadedItem(downloadedFile, 's1', 'item-1');
    await appendDownloadedItem(downloadedFile, 's2', 'item-2');

    await invoke('sources:delete', 's1');

    expect(await getDownloadedForSource(downloadedFile, 's1')).toEqual([]);
    expect(await getDownloadedForSource(downloadedFile, 's2')).toEqual(['item-2']);
  });

  it('exports sources as a resolved array (not an unawaited Promise) so import succeeds', async () => {
    await invoke('sources:save', source);
    dialogPath = join(userData, 'exported-sources.json');
    const exp = (await invoke('sources:export')) as { success: boolean };
    expect(exp).toEqual({ success: true });

    await invoke('sources:delete', 's1');
    expect(await invoke('sources:list')).toEqual([]);

    const imp = (await invoke('sources:import')) as { success: boolean; count?: number };
    expect(imp).toEqual({ success: true, count: 1 });
    const list = (await invoke('sources:list')) as MediaSource[];
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('S');
  });
});
