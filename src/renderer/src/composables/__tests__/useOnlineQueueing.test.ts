import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

const state = vi.hoisted(() => ({
  yt: null as any,
  settings: null as any,
  buildQueueExtra: vi.fn((payload: unknown) => ({ extra: payload })),
  toastAdded: vi.fn()
}));

vi.mock('@renderer/stores/online', () => ({ useOnlineStore: () => state.yt }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('@renderer/utils/onlineQueueExtra', () => ({
  buildQueueExtra: state.buildQueueExtra
}));

import { useOnlineQueueing } from '../useOnlineQueueing';

function item(id: string, playable = true) {
  return { id, isPlayable: playable } as never;
}

function resolved(ids: string[], playable: Record<string, boolean> = {}) {
  return {
    items: ids.map((id) => item(id, playable[id] ?? true))
  } as never;
}

function setup() {
  const configTarget = ref<any>(null);
  const rangeStart = ref<any>(1);
  const rangeEnd = ref<any>(100);
  const api = useOnlineQueueing(configTarget, rangeStart, rangeEnd, state.toastAdded);
  return { api, configTarget, rangeStart, rangeEnd };
}

beforeEach(() => {
  state.yt = {
    resolved: null,
    selectedResolved: new Set<string>(),
    queueFromResolved: vi.fn(),
    queueVideo: vi.fn()
  };
  state.settings = { download: { smartMode: false } };
  state.buildQueueExtra.mockClear();
  state.toastAdded.mockClear();
});

describe('selection', () => {
  it('adds and removes ids without mutating the old set', () => {
    const { api } = setup();
    const before = state.yt.selectedResolved;

    api.toggleSelect('a');
    expect([...state.yt.selectedResolved]).toEqual(['a']);
    expect(state.yt.selectedResolved).not.toBe(before);

    api.toggleSelect('b');
    api.toggleSelect('a');
    expect([...state.yt.selectedResolved]).toEqual(['b']);
  });

  it('selects and clears everything', () => {
    const { api } = setup();
    state.yt.resolved = resolved(['a', 'b']);

    api.toggleSelectAll();
    expect([...state.yt.selectedResolved]).toEqual(['a', 'b']);

    api.toggleSelectAll();
    expect(state.yt.selectedResolved.size).toBe(0);
  });

  it('does nothing without a resolved list', () => {
    const { api } = setup();
    api.toggleSelectAll();
    expect(state.yt.selectedResolved.size).toBe(0);
  });

  it('ignores select-all on an empty list', () => {
    const { api } = setup();
    state.yt.resolved = resolved([]);
    api.toggleSelectAll();
    expect(state.yt.selectedResolved.size).toBe(0);
  });
});

describe('range selection', () => {
  it('selects a 1-indexed inclusive range of playable items', () => {
    const { api, rangeStart, rangeEnd } = setup();
    state.yt.resolved = resolved(['a', 'b', 'c', 'd', 'e'], { c: false });
    rangeStart.value = 2;
    rangeEnd.value = 4;

    api.selectRange();

    expect([...state.yt.selectedResolved]).toEqual(['b', 'd']);
  });

  it('clamps values to the list bounds', () => {
    const { api, rangeStart, rangeEnd } = setup();
    state.yt.resolved = resolved(['a', 'b', 'c']);

    rangeStart.value = 0;
    rangeEnd.value = 99;
    api.selectRange();
    expect([...state.yt.selectedResolved]).toEqual(['a', 'b', 'c']);

    rangeStart.value = 2;
    rangeEnd.value = 1;
    api.selectRange();
    expect([...state.yt.selectedResolved]).toEqual(['b']);
  });

  it('falls back for non-numeric and missing values', () => {
    const { api, rangeStart, rangeEnd } = setup();
    state.yt.resolved = resolved(['a', 'b', 'c']);

    rangeStart.value = 'nope';
    rangeEnd.value = undefined;
    api.selectRange();
    expect([...state.yt.selectedResolved]).toEqual(['a', 'b', 'c']);
  });

  it('does nothing without a resolved list', () => {
    const { api } = setup();
    api.selectRange();
    expect(state.yt.selectedResolved.size).toBe(0);
  });
});

describe('queueing selected items', () => {
  it('queues immediately in smart mode', () => {
    state.settings.download.smartMode = true;
    const { api, configTarget } = setup();
    state.yt.resolved = resolved(['a']);
    state.yt.selectedResolved = new Set(['a', 'b']);

    api.addSelectedToQueue();

    expect(state.yt.queueFromResolved).toHaveBeenCalledWith(['a', 'b']);
    expect(state.toastAdded).toHaveBeenCalledTimes(1);
    expect(configTarget.value).toBeNull();
  });

  it('opens the config dialog otherwise', () => {
    const { api, configTarget } = setup();
    state.yt.resolved = resolved(['a']);
    state.yt.selectedResolved = new Set(['a']);

    api.addSelectedToQueue();

    expect(state.yt.queueFromResolved).not.toHaveBeenCalled();
    expect(configTarget.value).toEqual({ mode: 'resolved' });
  });

  it('needs a selection and a resolved list', () => {
    const { api, configTarget } = setup();
    api.addSelectedToQueue();
    expect(configTarget.value).toBeNull();

    state.yt.resolved = resolved(['a']);
    api.addSelectedToQueue();
    expect(configTarget.value).toBeNull();
  });
});

describe('single items', () => {
  it('opens config for a resolved item or a channel video', () => {
    const { api, configTarget } = setup();
    const entry = item('a');
    const video = { id: 'v' };

    api.queueResolvedItem(entry);
    expect(configTarget.value).toEqual({ mode: 'single', video: entry });

    api.queueChannelVideo(video as never);
    expect(configTarget.value).toEqual({ mode: 'single', video });
  });

  it('queues quickly in smart mode', () => {
    state.settings.download.smartMode = true;
    const { api, configTarget } = setup();
    const entry = item('a');
    const video = { id: 'v' };

    api.quickQueueResolved(entry);
    api.quickQueueVideo(video as never);

    expect(state.yt.queueVideo.mock.calls).toEqual([[entry], [video]]);
    expect(state.toastAdded).toHaveBeenCalledTimes(2);
    expect(configTarget.value).toBeNull();
  });

  it('opens config outside smart mode', () => {
    const { api, configTarget } = setup();
    const entry = item('a');
    const video = { id: 'v' };

    api.quickQueueResolved(entry);
    expect(configTarget.value).toEqual({ mode: 'single', video: entry });

    api.quickQueueVideo(video as never);
    expect(configTarget.value).toEqual({ mode: 'single', video });
    expect(state.yt.queueVideo).not.toHaveBeenCalled();
  });
});

describe('confirming the config dialog', () => {
  const payload = { quality: 'best' } as never;

  it('queues the selected list', () => {
    const { api, configTarget } = setup();
    state.yt.selectedResolved = new Set(['a', 'b']);
    configTarget.value = { mode: 'resolved' };

    api.confirmQueueConfig(payload);

    expect(state.buildQueueExtra).toHaveBeenCalledWith(payload);
    expect(state.yt.queueFromResolved).toHaveBeenCalledWith(['a', 'b'], undefined, {
      extra: payload
    });
    expect(configTarget.value).toBeNull();
    expect(state.toastAdded).toHaveBeenCalledTimes(1);
  });

  it('queues a single video', () => {
    const { api, configTarget } = setup();
    const video = item('a');
    configTarget.value = { mode: 'single', video };

    api.confirmQueueConfig(payload);

    expect(state.yt.queueVideo).toHaveBeenCalledWith(video, undefined, { extra: payload });
    expect(configTarget.value).toBeNull();
  });

  it('closes without queueing when the target disappeared', () => {
    const { api, configTarget } = setup();

    api.confirmQueueConfig(payload);

    expect(state.yt.queueFromResolved).not.toHaveBeenCalled();
    expect(state.yt.queueVideo).not.toHaveBeenCalled();
    expect(configTarget.value).toBeNull();
    expect(state.toastAdded).toHaveBeenCalledTimes(1);
  });

  it('closes on request', () => {
    const { api, configTarget } = setup();
    configTarget.value = { mode: 'resolved' };

    api.closeQueueConfig();

    expect(configTarget.value).toBeNull();
  });
});
