import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

const h = vi.hoisted(() => ({
  sources: null as any,
  player: null as any,
  buildTrack: vi.fn(
    (source: { id?: string }, item: { id?: string; title?: string }, index: number) => ({
      id: `track:${item.id}`,
      name: item.title ?? item.id,
      source: source.id,
      index
    })
  ),
  playable: vi.fn((..._args: any[]) => true),
  t: vi.fn((key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key
  ),
  showToast: vi.fn()
}));

vi.mock('@renderer/stores/sources', () => ({ useSourcesStore: () => h.sources }));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => h.player }));
vi.mock('@renderer/utils/sourceStream', () => ({
  buildSourceStreamTrack: h.buildTrack,
  isSourceItemPlayable: h.playable
}));

import { useSourcesActions } from '../useSourcesActions';

function item(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `Item ${id}`,
    type: 'video',
    mediaUrl: `https://s/${id}.mp4`,
    ...overrides
  } as never;
}

function setup(selected: unknown[] = []) {
  const selectedItems = ref(selected as never[]);
  const previewItem = ref(null);
  const clearSelection = vi.fn();
  const actions = useSourcesActions({
    sources: h.sources,
    player: h.player,
    t: h.t,
    showToast: h.showToast,
    selectedItems,
    clearSelection,
    previewItem
  });
  return { actions, selectedItems, previewItem, clearSelection };
}

beforeEach(() => {
  h.sources = {
    activeSource: { id: 'src1', name: 'Source' },
    enqueueDownload: vi.fn(async () => ({ ok: true })),
    enqueueAll: vi.fn(async () => ({ queued: 2, failed: 0 })),
    unmarkDownloaded: vi.fn(async () => true)
  };
  h.player = {
    addToQueueMultiple: vi.fn(),
    setTrack: vi.fn(),
    enrichTrack: vi.fn()
  };
  h.buildTrack.mockClear();
  h.playable.mockReset();
  h.playable.mockReturnValue(true);
  h.t.mockClear();
  h.showToast.mockReset();
});

describe('queueing', () => {
  it('returns zero without an active source', () => {
    h.sources.activeSource = null;
    const { actions } = setup();

    expect(actions.queueSourceItems([item('a')])).toBe(0);
    expect(h.player.addToQueueMultiple).not.toHaveBeenCalled();
  });

  it('filters unplayable items and numbers tracks per queue position', () => {
    h.playable.mockImplementation((entry: { id: string }) => entry.id !== 'skip');
    const { actions } = setup();

    const count = actions.queueSourceItems([item('a'), item('skip'), item('b')]);

    expect(count).toBe(2);
    expect(h.buildTrack).toHaveBeenNthCalledWith(
      1,
      h.sources.activeSource,
      expect.objectContaining({ id: 'a' }),
      0
    );
    expect(h.buildTrack).toHaveBeenNthCalledWith(
      2,
      h.sources.activeSource,
      expect.objectContaining({ id: 'b' }),
      1
    );
    expect(h.player.addToQueueMultiple).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'track:a' }),
      expect.objectContaining({ id: 'track:b' })
    ]);
  });

  it('does not queue when nothing is playable', () => {
    h.playable.mockReturnValue(false);
    const { actions } = setup();

    expect(actions.queueSourceItems([item('a')])).toBe(0);
    expect(h.player.addToQueueMultiple).not.toHaveBeenCalled();
  });

  it('adds a single item and shows a toast', () => {
    const { actions } = setup();

    actions.onAddToQueue(item('a'));

    expect(h.showToast).toHaveBeenCalledWith('sources.queueAddedOne');
  });

  it('skips the toast when the single item cannot be queued', () => {
    h.playable.mockReturnValue(false);
    const { actions } = setup();

    actions.onAddToQueue(item('a'));

    expect(h.showToast).not.toHaveBeenCalled();
  });

  it('queues selected items with a count toast', () => {
    const { actions } = setup([item('a'), item('b')]);

    actions.onBulkQueue();

    expect(h.showToast).toHaveBeenCalledWith('sources.queueAdded:{"n":2}');
  });

  it('skips the bulk queue toast when nothing was queued', () => {
    h.playable.mockReturnValue(false);
    const { actions } = setup([item('a')]);

    actions.onBulkQueue();

    expect(h.showToast).not.toHaveBeenCalled();
  });
});

describe('playback', () => {
  it('ignores missing sources and unplayable items', () => {
    const { actions } = setup();
    h.sources.activeSource = null;
    actions.onPlayNow(item('a'));
    expect(h.player.setTrack).not.toHaveBeenCalled();

    h.sources.activeSource = { id: 'src1' };
    h.playable.mockReturnValue(false);
    actions.onPlayNow(item('a'));
    expect(h.player.setTrack).not.toHaveBeenCalled();
  });

  it('plays an item immediately and reports it', () => {
    const { actions } = setup();

    actions.onPlayNow(item('a'));

    expect(h.player.setTrack).toHaveBeenCalledWith(expect.objectContaining({ id: 'track:a' }));
    expect(h.player.enrichTrack).toHaveBeenCalledWith(expect.objectContaining({ id: 'track:a' }));
    expect(h.showToast).toHaveBeenCalledWith('sources.nowPlaying:{"title":"Item a"}');
  });

  it('plays the first selected item and queues the rest', () => {
    const { actions } = setup([item('a'), item('b'), item('c')]);

    actions.onBulkPlay();

    expect(h.player.setTrack).toHaveBeenCalledWith(expect.objectContaining({ id: 'track:a' }));
    expect(h.player.addToQueueMultiple).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'track:b' }),
      expect.objectContaining({ id: 'track:c' })
    ]);
  });

  it('does not queue when only one item is selected', () => {
    const { actions } = setup([item('a')]);

    actions.onBulkPlay();

    expect(h.player.setTrack).toHaveBeenCalledTimes(1);
    expect(h.player.addToQueueMultiple).not.toHaveBeenCalled();
  });

  it('does nothing when no selected item is playable', () => {
    h.playable.mockReturnValue(false);
    const { actions } = setup([item('a')]);

    actions.onBulkPlay();

    expect(h.player.setTrack).not.toHaveBeenCalled();
  });
});

describe('downloads', () => {
  it('tracks the downloading item and reports success', async () => {
    let release!: (value: unknown) => void;
    h.sources.enqueueDownload.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      })
    );
    const { actions } = setup();
    const target = item('a');

    const promise = actions.onDownload(target);
    expect(actions.downloadingItem.value).toEqual(target);

    release({ ok: true });
    await promise;

    expect(h.showToast).toHaveBeenCalledWith('sources.toastQueuedOne', true);
    expect(actions.downloadingItem.value).toBeNull();
  });

  it('reports download failures with the error', async () => {
    h.sources.enqueueDownload.mockResolvedValueOnce({ ok: false, error: 'quota' });
    const { actions } = setup();

    await actions.onDownload(item('a'));

    expect(h.showToast).toHaveBeenCalledWith('sources.toastFailed:{"err":"quota"}', false);
    expect(actions.downloadingItem.value).toBeNull();
  });

  it('resets the flag when enqueueing throws', async () => {
    h.sources.enqueueDownload.mockRejectedValueOnce(new Error('boom'));
    const { actions } = setup();

    await expect(actions.onDownload(item('a'))).rejects.toThrow('boom');
    expect(actions.downloadingItem.value).toBeNull();
  });

  it('reports bulk success and clears the selection', async () => {
    const { actions, clearSelection } = setup([item('a')]);

    await actions.onBulkDownload();

    expect(h.sources.enqueueAll).toHaveBeenCalledWith([expect.objectContaining({ id: 'a' })]);
    expect(h.showToast).toHaveBeenCalledWith('sources.toastQueued:{"n":2}', true);
    expect(clearSelection).toHaveBeenCalled();
    expect(actions.downloadingAll.value).toBe(false);
  });

  it('reports partial bulk failures', async () => {
    h.sources.enqueueAll.mockResolvedValueOnce({ queued: 1, failed: 2 });
    const { actions } = setup();

    await actions.onDownloadAll([item('a')]);

    expect(h.showToast).toHaveBeenCalledWith('sources.toastQueuedSome:{"q":1,"f":2}', false);
    expect(actions.downloadingAll.value).toBe(false);
  });

  it('skips empty bulk downloads', async () => {
    const { actions, clearSelection } = setup([]);

    await actions.onBulkDownload();

    expect(h.sources.enqueueAll).not.toHaveBeenCalled();
    expect(clearSelection).not.toHaveBeenCalled();
  });

  it('resets the bulk flag when enqueueing throws', async () => {
    h.sources.enqueueAll.mockRejectedValueOnce(new Error('boom'));
    const { actions } = setup();

    await expect(actions.onDownloadAll([item('a')])).rejects.toThrow('boom');
    expect(actions.downloadingAll.value).toBe(false);
  });
});

describe('unmark downloaded', () => {
  it('ignores items without an id', async () => {
    const { actions } = setup();

    await actions.onUnmarkDownloaded(item('a', { id: undefined }));

    expect(h.sources.unmarkDownloaded).not.toHaveBeenCalled();
  });

  it('clears the preview on success', async () => {
    const { actions, previewItem } = setup();
    previewItem.value = item('a') as never;

    await actions.onUnmarkDownloaded(item('a'));

    expect(h.sources.unmarkDownloaded).toHaveBeenCalledWith('a');
    expect(h.showToast).toHaveBeenCalledWith('sources.toastUnmarked', true);
    expect(previewItem.value).toBeNull();
  });

  it('reports failure without clearing the preview', async () => {
    h.sources.unmarkDownloaded.mockResolvedValueOnce(false);
    const { actions, previewItem } = setup();
    previewItem.value = item('a') as never;

    await actions.onUnmarkDownloaded(item('a'));

    expect(h.showToast).toHaveBeenCalledWith('sources.toastFailed:{"err":"unknown"}', false);
    expect(previewItem.value).not.toBeNull();
  });
});
