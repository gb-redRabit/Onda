import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  t: vi.fn((key: string, params?: unknown) => (params ? `${key}:${JSON.stringify(params)}` : key)),
  notify: vi.fn(),
  updatePlaylistItems: vi.fn(async () => undefined),
  resolveAll: vi.fn(),
  playAll: vi.fn(async () => undefined),
  toSaved: vi.fn((item: { id: string }) => ({ ...item, saved: true })),
  toItem: vi.fn((item: { id: string }) => ({ ...item, item: true }))
}));

vi.mock('@renderer/i18n', () => ({ i18n: { global: { t: h.t } } }));
vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => ({ notify: h.notify }) }));
vi.mock('@renderer/stores/saved', () => ({
  useSavedStore: () => ({ updatePlaylistItems: h.updatePlaylistItems })
}));
vi.mock('@renderer/utils/onlineHelpers', () => ({
  resolvedToSavedStream: h.toSaved,
  savedStreamToItem: h.toItem
}));
vi.mock('@renderer/utils/onlineResolveAll', () => ({
  resolveAllPlaylistItems: h.resolveAll
}));

import { createOnlineSaved } from '../saved';

function playlist(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    url: 'https://youtube.com/playlist?list=1',
    title: 'Mix',
    items: [
      { id: 'a', title: 'A' },
      { id: 'b', title: 'B' }
    ],
    ...overrides
  } as never;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
}

beforeEach(() => {
  h.t.mockClear();
  h.notify.mockReset();
  h.updatePlaylistItems.mockReset();
  h.updatePlaylistItems.mockResolvedValue(undefined);
  h.resolveAll.mockReset();
  h.playAll.mockReset();
  h.playAll.mockResolvedValue(undefined);
  h.toSaved.mockClear();
  h.toItem.mockClear();
});

describe('syncSavedPlaylist', () => {
  it('keeps, removes and appends items and reports changes', async () => {
    const { syncSavedPlaylist } = createOnlineSaved(h.playAll);
    h.resolveAll.mockResolvedValue({
      items: [
        { id: 'b', title: 'B' },
        { id: 'c', title: 'C' }
      ],
      totalItems: 8
    });

    await expect(syncSavedPlaylist(playlist())).resolves.toEqual({
      added: 1,
      removed: 1,
      total: 2
    });

    expect(h.updatePlaylistItems).toHaveBeenCalledWith(
      'p1',
      [
        { id: 'b', title: 'B' },
        { id: 'c', title: 'C', saved: true }
      ],
      8
    );
    expect(h.notify).toHaveBeenCalledWith(
      'info',
      'Mix',
      'saved.syncChanged:{"added":1,"removed":1}'
    );
  });

  it('skips writes when nothing changed', async () => {
    const { syncSavedPlaylist } = createOnlineSaved(h.playAll);
    h.resolveAll.mockResolvedValue({
      items: [{ id: 'a' }, { id: 'b' }],
      totalItems: 2
    });

    await expect(syncSavedPlaylist(playlist())).resolves.toEqual({
      added: 0,
      removed: 0,
      total: 2
    });
    expect(h.updatePlaylistItems).not.toHaveBeenCalled();
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('ignores a sync that is already running', async () => {
    const { syncSavedPlaylist, syncingSavedPlaylistState } = createOnlineSaved(h.playAll);
    let resolve!: (value: unknown) => void;
    h.resolveAll.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      })
    );

    const first = syncSavedPlaylist(playlist());
    await flush();
    expect(syncingSavedPlaylistState.value.has('p1')).toBe(true);

    await expect(syncSavedPlaylist(playlist())).resolves.toBeNull();

    resolve({ items: [], totalItems: 0 });
    await first;
    expect(syncingSavedPlaylistState.value.has('p1')).toBe(false);
  });

  it('returns null and clears the lock when resolving fails', async () => {
    const { syncSavedPlaylist, syncingSavedPlaylistState } = createOnlineSaved(h.playAll);
    h.resolveAll.mockRejectedValueOnce(new Error('offline'));

    await expect(syncSavedPlaylist(playlist())).resolves.toBeNull();
    expect(syncingSavedPlaylistState.value.size).toBe(0);

    h.resolveAll.mockResolvedValueOnce({ items: [], totalItems: 0 });
    await expect(syncSavedPlaylist(playlist())).resolves.not.toBeNull();
  });
});

describe('playSavedPlaylist', () => {
  it('plays stored items immediately and refreshes in the background', async () => {
    const { playSavedPlaylist } = createOnlineSaved(h.playAll);
    h.resolveAll.mockResolvedValue({ items: [], totalItems: 0 });

    await playSavedPlaylist(playlist());

    expect(h.playAll).toHaveBeenCalledWith([
      { id: 'a', title: 'A', item: true },
      { id: 'b', title: 'B', item: true }
    ]);
    await flush();
    expect(h.resolveAll).toHaveBeenCalledWith('https://youtube.com/playlist?list=1');
  });

  it('resolves and stores items when the snapshot is empty', async () => {
    const { playSavedPlaylist } = createOnlineSaved(h.playAll);
    h.resolveAll.mockResolvedValue({
      items: [{ id: 'x', title: 'X' }],
      totalItems: 1
    });

    await playSavedPlaylist(playlist({ items: [] }));

    expect(h.updatePlaylistItems).toHaveBeenCalledWith(
      'p1',
      [{ id: 'x', title: 'X', saved: true }],
      1
    );
    expect(h.playAll).toHaveBeenCalledWith([{ id: 'x', title: 'X', saved: true, item: true }]);
  });

  it('reports an empty playlist when resolving yields nothing', async () => {
    const { playSavedPlaylist } = createOnlineSaved(h.playAll);
    h.resolveAll.mockResolvedValue({ items: [], totalItems: 0 });

    await playSavedPlaylist(playlist({ items: [] }));

    expect(h.playAll).not.toHaveBeenCalled();
    expect(h.notify).toHaveBeenCalledWith('error', 'Mix', 'saved.playlistEmpty');
  });
});
