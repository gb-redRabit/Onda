import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { useMusicBrainzBatch } from '../useMusicBrainzBatch';

const state = vi.hoisted(() => ({
  writeTags: vi.fn(),
  writeCover: vi.fn()
}));

let wrapper: VueWrapper | null = null;
let batch: ReturnType<typeof useMusicBrainzBatch>;

function fieldSet(overrides: Record<string, boolean> = {}) {
  return {
    title: true,
    artist: true,
    album: true,
    year: true,
    genre: false,
    track: false,
    cover: false,
    ...overrides
  };
}

function track(id: string) {
  return { path: `C:/music/${id}.mp3`, name: `${id}.mp3` } as never;
}

function release(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Album',
    date: '1999-05-01',
    'artist-credit': [{ name: 'Artist' }],
    media: [{ tracks: [{ title: 'Track One' }, { title: 'Track Two' }] }],
    ...overrides
  } as never;
}

function setup(
  options: {
    release?: unknown;
    fields?: Record<string, boolean>;
    tracks?: unknown[];
  } = {}
) {
  let currentRelease: any = options.release === undefined ? release() : options.release;
  const fields = options.fields ?? fieldSet();
  const tracks = 'tracks' in options ? (options.tracks as unknown[]) : [track('a'), track('b')];
  const Comp = defineComponent({
    setup() {
      batch = useMusicBrainzBatch(
        () => currentRelease as never,
        () => fields as never,
        () => tracks as never
      );
      return () => h('div');
    }
  });
  wrapper = mount(Comp);
  return {
    setRelease(value: unknown) {
      currentRelease = value;
    }
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  state.writeTags.mockReset();
  state.writeTags.mockResolvedValue({ success: true });
  state.writeCover.mockReset();
  state.writeCover.mockResolvedValue(undefined);
  (window as { api?: unknown }).api = {
    writeTags: state.writeTags,
    writeCover: state.writeCover
  };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  delete (window as { api?: unknown }).api;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('starting a batch', () => {
  it('does nothing without a release, tracks or fields', () => {
    setup({ release: null });
    batch.startBatch();
    expect(batch.batchRunning.value).toBe(false);
    expect(batch.batchResults.value).toEqual([]);

    wrapper!.unmount();
    setup({ tracks: [] });
    batch.startBatch();
    expect(batch.batchRunning.value).toBe(false);

    wrapper!.unmount();
    setup({ tracks: undefined });
    batch.startBatch();
    expect(batch.batchRunning.value).toBe(false);
  });

  it('initialises results and processes the first track', async () => {
    setup();
    batch.startBatch();

    expect(batch.batchRunning.value).toBe(true);
    expect(batch.batchResults.value).toHaveLength(2);
    expect(batch.batchResults.value[0]).toMatchObject({
      path: 'C:/music/a.mp3',
      name: 'a.mp3',
      status: 'pending'
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(state.writeTags).toHaveBeenCalledWith('C:/music/a.mp3', {
      album: 'Album',
      artist: 'Artist',
      year: '1999',
      title: 'Track One'
    });
    expect(batch.batchResults.value[0].status).toBe('ok');
    expect(batch.batchProgress.value).toBe(1);
    expect(batch.batchRunning.value).toBe(true);
  });

  it('throttles steps to roughly one per 1.1s', async () => {
    setup();
    batch.startBatch();
    await vi.advanceTimersByTimeAsync(0);
    expect(state.writeTags).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1099);
    expect(state.writeTags).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(state.writeTags).toHaveBeenCalledTimes(2);
    expect(batch.batchProgress.value).toBe(2);
    await vi.advanceTimersByTimeAsync(1100);
    expect(batch.batchRunning.value).toBe(false);
  });

  it('falls back to the first release track and formats track numbers', async () => {
    setup({
      release: release({ media: [{ tracks: [{ title: 'Only' }] }] }),
      fields: fieldSet({ track: true })
    });
    batch.startBatch();
    await vi.advanceTimersByTimeAsync(0);
    expect(state.writeTags).toHaveBeenCalledWith('C:/music/a.mp3', {
      album: 'Album',
      artist: 'Artist',
      year: '1999',
      title: 'Only',
      track: '1'
    });
    await vi.advanceTimersByTimeAsync(1100);
    expect(state.writeTags).toHaveBeenLastCalledWith('C:/music/b.mp3', {
      album: 'Album',
      artist: 'Artist',
      year: '1999',
      title: 'Only',
      track: '2'
    });
  });

  it('omits disabled fields and missing metadata', async () => {
    setup({
      release: release({
        date: undefined,
        'artist-credit': [{ artist: { name: 'Credited' } }],
        media: [{ tracks: [] }]
      }),
      fields: fieldSet({ title: false, year: false, track: false, artist: true })
    });
    batch.startBatch();
    await vi.advanceTimersByTimeAsync(0);
    expect(state.writeTags).toHaveBeenCalledWith('C:/music/a.mp3', {
      album: 'Album',
      artist: 'Credited'
    });
  });

  it('writes the cover when enabled and available', async () => {
    setup({
      release: release({ _coverData: [1, 2, 3] }),
      fields: fieldSet({ cover: true })
    });
    batch.startBatch();
    await vi.advanceTimersByTimeAsync(0);
    expect(state.writeCover).toHaveBeenCalledWith('C:/music/a.mp3', [1, 2, 3]);
  });

  it('skips the cover without data or when disabled', async () => {
    setup({ fields: fieldSet({ cover: true }) });
    batch.startBatch();
    await vi.advanceTimersByTimeAsync(0);
    expect(state.writeCover).not.toHaveBeenCalled();

    wrapper!.unmount();
    setup({ release: release({ _coverData: [1] }) });
    batch.startBatch();
    await vi.advanceTimersByTimeAsync(0);
    expect(state.writeCover).not.toHaveBeenCalled();
  });

  it('resets previous state when restarted', async () => {
    setup();
    batch.startBatch();
    await vi.advanceTimersByTimeAsync(0);
    batch.cancelBatch();
    expect(batch.batchRunning.value).toBe(false);

    batch.startBatch();
    expect(batch.batchRunning.value).toBe(true);
    expect(batch.batchProgress.value).toBe(0);
    expect(batch.batchResults.value[0].status).toBe('pending');
  });
});

describe('errors', () => {
  it('records writeTags failures with a short message', async () => {
    state.writeTags.mockResolvedValueOnce({ success: false });
    setup();
    batch.startBatch();
    await vi.advanceTimersByTimeAsync(0);
    expect(batch.batchResults.value[0]).toMatchObject({
      status: 'error',
      msg: expect.stringContaining('writeTags failed')
    });
  });

  it('records thrown errors and truncates long messages', async () => {
    state.writeTags.mockRejectedValueOnce(new Error('x'.repeat(120)));
    setup();
    batch.startBatch();
    await vi.advanceTimersByTimeAsync(0);
    expect(batch.batchResults.value[0].status).toBe('error');
    expect(batch.batchResults.value[0].msg!.length).toBeLessThanOrEqual(80);
  });

  it('continues with the next track after an error', async () => {
    state.writeTags.mockRejectedValueOnce(new Error('first failed'));
    setup();
    batch.startBatch();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1100);
    expect(batch.batchProgress.value).toBe(2);
    expect(batch.batchResults.value[1].status).toBe('ok');
  });

  it('treats missing bridges as success', async () => {
    delete (window as { api?: unknown }).api;
    setup();
    batch.startBatch();
    await vi.advanceTimersByTimeAsync(0);
    expect(batch.batchResults.value[0].status).toBe('ok');
  });
});

describe('cancellation and disposal', () => {
  it('stops the batch and clears the timer', async () => {
    setup();
    batch.startBatch();
    await vi.advanceTimersByTimeAsync(0);
    expect(state.writeTags).toHaveBeenCalledTimes(1);

    batch.cancelBatch();
    expect(batch.batchCancelled.value).toBe(true);
    expect(batch.batchRunning.value).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(state.writeTags).toHaveBeenCalledTimes(1);
  });

  it('stops after an in-flight write when cancelled', async () => {
    let resolveTags: (value: unknown) => void = () => {};
    state.writeTags.mockImplementation(() => new Promise((resolve) => (resolveTags = resolve)));
    setup();
    batch.startBatch();
    await vi.advanceTimersByTimeAsync(0);

    batch.cancelBatch();
    resolveTags({ success: true });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5000);

    expect(batch.batchRunning.value).toBe(false);
    expect(state.writeTags).toHaveBeenCalledTimes(1);
    expect(batch.batchProgress.value).toBe(1);
  });

  it('cancels pending work when the scope is disposed', async () => {
    setup();
    batch.startBatch();
    await vi.advanceTimersByTimeAsync(0);

    wrapper!.unmount();
    wrapper = null;
    await vi.advanceTimersByTimeAsync(5000);
    expect(state.writeTags).toHaveBeenCalledTimes(1);
  });
});
