import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { createOnlineQueue } from '../queue';

const state = vi.hoisted(() => ({
  notify: vi.fn(),
  buildSoundcloud: vi.fn((id: string) => `https://sc/${id}`),
  buildYouTube: vi.fn((id: string) => `https://yt/${id}`),
  buildJob: vi.fn(),
  buildChannelJobs: vi.fn(),
  resolveOnlineUrl: vi.fn(),
  resolveAll: vi.fn(),
  mapLimit: vi.fn(),
  invoke: vi.fn(),
  t: vi.fn((key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key
  )
}));

vi.mock('@shared/provider', () => ({
  buildSoundcloudProfileUrl: state.buildSoundcloud,
  buildYouTubeChannelUrl: state.buildYouTube
}));
vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => ({ notify: state.notify }) }));
vi.mock('@renderer/utils/onlineJob', () => ({ buildJob: state.buildJob }));
vi.mock('@renderer/utils/onlineChannelJobs', () => ({
  buildChannelJobs: state.buildChannelJobs
}));
vi.mock('@renderer/utils/onlineResolve', () => ({ resolveOnlineUrl: state.resolveOnlineUrl }));
vi.mock('@renderer/utils/onlineResolveAll', () => ({
  resolveAllPlaylistItems: state.resolveAll
}));
vi.mock('@renderer/utils/mapLimit', () => ({ mapLimit: state.mapLimit }));

function item(id: string, overrides: Record<string, unknown> = {}) {
  return { id, channelId: 'ch-item', channelTitle: 'Item channel', ...overrides } as never;
}

function task(id: string, videoId = id) {
  return { id, videoId } as never;
}

function setup(overrides: Record<string, unknown> = {}) {
  const channel = ref<any>(null);
  const resolved = ref<any>(null);
  const downloads = ref<any[]>([]);
  const getSubscription = vi.fn();
  const addSubscription = vi.fn();
  const submitJobs = vi.fn(async (jobs: any[]) =>
    jobs.map((job) => task(job.id ?? job.videoId, job.videoId))
  );
  const deps = {
    t: state.t,
    channel,
    resolved,
    downloads,
    getSubscription,
    addSubscription,
    submitJobs,
    ...overrides
  };
  const queue = createOnlineQueue(deps as never);
  return { queue, channel, resolved, downloads, getSubscription, addSubscription, submitJobs };
}

beforeEach(() => {
  state.notify.mockReset();
  state.buildJob.mockReset();
  state.buildJob.mockImplementation((video: any, prefs: any, extra: any) => ({
    id: video.id,
    videoId: video.id,
    channelId: video.channelId,
    channelTitle: video.channelTitle,
    prefs,
    ...extra
  }));
  state.buildChannelJobs.mockReset();
  state.buildChannelJobs.mockReturnValue([{ id: 'job-a', videoId: 'a' }]);
  state.resolveOnlineUrl.mockReset();
  state.resolveOnlineUrl.mockResolvedValue({ success: true, result: { kind: 'video', items: [] } });
  state.resolveAll.mockReset();
  state.resolveAll.mockResolvedValue([]);
  state.mapLimit.mockReset();
  state.mapLimit.mockImplementation(
    (items: unknown[], limit: number, fn: (item: unknown) => unknown) => {
      (state as any).lastLimit = limit;
      return Promise.all(items.map(fn));
    }
  );
  state.invoke.mockReset();
  state.invoke.mockResolvedValue(null);
  state.t.mockClear();
  (window as { api?: unknown }).api = { invoke: state.invoke };
});

describe('queueing flags', () => {
  it('marks a video while its job is submitted', async () => {
    let during = false;
    const { queue, submitJobs } = setup();
    submitJobs.mockImplementation(async () => {
      during = queue.isQueuing('v1');
      return [task('t', 'v1')];
    });

    await queue.queueVideo({ id: 'v1', channelId: 'ch' } as never);

    expect(during).toBe(true);
    expect(queue.isQueuing('v1')).toBe(false);
  });

  it('clears the video flag when submission fails', async () => {
    const { queue, submitJobs } = setup();
    submitJobs.mockRejectedValueOnce(new Error('ipc'));

    await expect(queue.queueVideo({ id: 'v1' } as never)).rejects.toThrow('ipc');
    expect(queue.isQueuing('v1')).toBe(false);
  });

  it('marks a channel while downloading all videos', async () => {
    let during = false;
    const { queue, submitJobs, getSubscription } = setup();
    getSubscription.mockReturnValue({ platform: 'youtube', downloadedVideoIds: [] });
    state.invoke.mockResolvedValueOnce({ success: true, items: [{}] });
    submitJobs.mockImplementation(async () => {
      during = queue.isChannelQueuing('ch');
      return [];
    });

    await queue.queueChannelVideos('ch');
    expect(during).toBe(true);
    expect(queue.isChannelQueuing('ch')).toBe(false);
  });

  it('delegates URL resolution', async () => {
    const { queue } = setup();
    state.resolveOnlineUrl.mockResolvedValueOnce({ success: true, result: { kind: 'video' } });
    await expect(queue.resolveOnline('https://x')).resolves.toEqual({
      success: true,
      result: { kind: 'video' }
    });

    state.resolveAll.mockResolvedValueOnce([item('a')]);
    await expect(queue.loadAllResolvedItems('https://list')).resolves.toEqual([item('a')]);
  });
});

describe('queueVideo', () => {
  it('applies channel fallbacks and extras', async () => {
    const { queue, channel, submitJobs } = setup();
    channel.value = { id: 'active', title: 'Active channel' };

    await queue.queueVideo({ id: 'v1' } as never, undefined, { playlistTitle: 'List' });

    expect(state.buildJob).toHaveBeenCalledWith({ id: 'v1' }, undefined, {
      playlistTitle: 'List'
    });
    expect(submitJobs).toHaveBeenCalledWith([
      expect.objectContaining({ channelId: 'active', channelTitle: 'Active channel' })
    ]);
  });

  it('keeps explicit channel data', async () => {
    const { queue, channel } = setup();
    channel.value = { id: 'active', title: 'Active' };
    await queue.queueVideo({ id: 'v1', channelId: 'own', channelTitle: 'Own' } as never);
    expect(state.buildJob).toHaveBeenCalled();
  });
});

describe('queueFromResolved', () => {
  it('does nothing without a resolution or ids', async () => {
    const { queue, submitJobs } = setup();
    await queue.queueFromResolved(['a']);
    expect(submitJobs).not.toHaveBeenCalled();

    const withResult = setup();
    withResult.resolved.value = { kind: 'video', items: [item('a')], meta: {} };
    await withResult.queue.queueFromResolved([]);
    expect(withResult.submitJobs).not.toHaveBeenCalled();
  });

  it('builds jobs with playlist/channel context and skips unknown ids', async () => {
    const { queue, resolved, submitJobs } = setup();
    resolved.value = {
      kind: 'playlist',
      title: 'Playlist title',
      items: [item('a'), item('b')],
      meta: { channelTitle: 'Meta channel' }
    };

    await queue.queueFromResolved(['a', 'missing'], undefined, { playlistTitle: 'Explicit' });

    expect(state.buildJob).toHaveBeenCalledTimes(1);
    expect(state.buildJob).toHaveBeenCalledWith(item('a'), undefined, {
      playlistTitle: 'Explicit',
      channelTitle: 'Meta channel'
    });
    expect(submitJobs).toHaveBeenCalledWith([expect.anything()]);
  });

  it('prefers extra context and item channel titles', async () => {
    const { queue, resolved } = setup();
    resolved.value = {
      kind: 'video',
      items: [item('a', { channelTitle: 'Item channel' })],
      meta: {}
    };

    await queue.queueFromResolved(['a'], undefined, {
      channelTitle: 'Extra channel'
    });

    expect(state.buildJob).toHaveBeenCalledWith(
      item('a', { channelTitle: 'Item channel' }),
      undefined,
      expect.objectContaining({ channelTitle: 'Extra channel' })
    );
  });
});

describe('queueChannelVideos', () => {
  it('queues YouTube channel videos and records ids', async () => {
    const { queue, channel, downloads, getSubscription, addSubscription, submitJobs } = setup();
    channel.value = { title: 'Active title' };
    downloads.value = [
      { videoId: 'active', status: 'downloading' },
      { videoId: 'done', status: 'completed' }
    ];
    getSubscription.mockReturnValue({
      platform: 'youtube',
      downloadedVideoIds: ['done'],
      queuedVideoIds: ['old'],
      pendingCount: 5
    });
    submitJobs.mockResolvedValueOnce([task('t1', 'a'), task('t2', '')]);
    state.invoke
      .mockResolvedValueOnce({ success: true, items: [{}] })
      .mockResolvedValueOnce({ queuedVideoIds: ['old', 'a'], pendingCount: 3 });

    await queue.queueChannelVideos('ch', { quality: 'best' });

    expect(state.invoke).toHaveBeenCalledWith('yt:channelAll', {
      url: 'https://yt/ch',
      tab: 'videos'
    });
    expect(state.buildChannelJobs).toHaveBeenCalledWith(
      expect.anything(),
      'ch',
      'Active title',
      { quality: 'best' },
      new Set(['active']),
      new Set(['done'])
    );
    expect(state.notify).toHaveBeenCalledWith(
      'success',
      'youtube.downloadAll',
      expect.stringContaining('youtube.channelQueued')
    );
    expect(addSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        queuedVideoIds: ['old', 'a'],
        pendingCount: 3
      })
    );
  });

  it('uses the SoundCloud endpoint and lets includeDownloaded bypass the set', async () => {
    const { queue, getSubscription } = setup();
    getSubscription.mockReturnValue({ platform: 'soundcloud', downloadedVideoIds: ['x'] });
    state.invoke.mockResolvedValueOnce({ success: true, items: [] });
    state.mapLimit.mockImplementation(() => Promise.resolve([]));

    await queue.queueChannelVideos('sc', undefined, true);

    expect(state.invoke).toHaveBeenCalledWith('sc:channelAll', {
      url: 'https://sc/sc'
    });
    expect(state.buildChannelJobs).toHaveBeenCalledWith(
      expect.anything(),
      'sc',
      undefined,
      undefined,
      expect.any(Set),
      new Set()
    );
  });

  it('notifies when the channel cannot be loaded', async () => {
    const { queue, getSubscription } = setup();
    getSubscription.mockReturnValue(undefined);
    state.invoke.mockResolvedValueOnce({ success: false });

    await queue.queueChannelVideos('ch');

    expect(state.notify).toHaveBeenCalledWith(
      'warning',
      'youtube.downloadAll',
      'youtube.channelQueueFailed'
    );
  });

  it('notifies when nothing new can be queued', async () => {
    const { queue, getSubscription } = setup();
    getSubscription.mockReturnValue(undefined);
    state.invoke.mockResolvedValueOnce({ success: true, items: [] });
    state.buildChannelJobs.mockReturnValueOnce([]);

    await queue.queueChannelVideos('ch');

    expect(state.notify).toHaveBeenCalledWith(
      'info',
      'youtube.downloadAll',
      'youtube.nothingToQueue'
    );
  });

  it('ignores subscription update failures', async () => {
    const { queue, getSubscription, addSubscription } = setup();
    getSubscription.mockReturnValue({ queuedVideoIds: [] });
    state.invoke
      .mockResolvedValueOnce({ success: true, items: [{}] })
      .mockRejectedValueOnce(new Error('ipc'));

    await expect(queue.queueChannelVideos('ch')).resolves.toBeUndefined();
    expect(addSubscription).toHaveBeenCalledTimes(1);
  });

  it('clears the channel flag even on failure', async () => {
    const { queue, getSubscription } = setup();
    getSubscription.mockReturnValue(undefined);
    state.invoke.mockRejectedValueOnce(new Error('boom'));

    await expect(queue.queueChannelVideos('ch')).rejects.toThrow('boom');
    expect(queue.isChannelQueuing('ch')).toBe(false);
  });
});

describe('queueBatch', () => {
  it('resolves links with concurrency and submits a single batch', async () => {
    const { queue, channel, submitJobs } = setup();
    channel.value = { id: 'active', title: 'Active' };
    state.resolveOnlineUrl
      .mockResolvedValueOnce({
        success: true,
        result: { kind: 'video', items: [item('v1'), item('v2')] }
      })
      .mockResolvedValueOnce({
        success: true,
        result: { kind: 'playlist', items: [item('p1'), item('p2')] }
      })
      .mockResolvedValueOnce({
        success: true,
        result: { kind: 'channel', items: [item('c1')] }
      })
      .mockRejectedValueOnce(new Error('resolve failed'));

    const count = await queue.queueBatch(['https://v', 'https://p', 'https://c', 'https://bad'], {
      playlistTitle: 'Batch list'
    });

    expect((state as any).lastLimit).toBe(4);
    expect(count).toBe(3);
    expect(state.buildJob).toHaveBeenCalledTimes(3);
    expect(state.buildJob).toHaveBeenCalledWith(item('v1'), undefined, {
      playlistTitle: 'Batch list'
    });
    expect(submitJobs).toHaveBeenCalledTimes(1);
    expect((submitJobs.mock.calls[0][0] as unknown[]).length).toBe(3);
  });

  it('skips failed resolutions and returns zero without jobs', async () => {
    const { queue, submitJobs } = setup();
    state.resolveOnlineUrl.mockResolvedValue({ success: false });

    expect(await queue.queueBatch(['https://a'])).toBe(0);
    expect(submitJobs).not.toHaveBeenCalled();
  });

  it('applies the active channel fallback', async () => {
    const { queue, channel } = setup();
    channel.value = { id: 'active', title: 'Active' };
    state.resolveOnlineUrl.mockResolvedValueOnce({
      success: true,
      result: {
        kind: 'video',
        items: [item('v', { channelId: undefined, channelTitle: undefined })]
      }
    });

    await queue.queueBatch(['https://v']);
    expect(state.buildJob.mock.results[0].value).toMatchObject({
      channelId: 'active',
      channelTitle: 'Active'
    });
  });
});
