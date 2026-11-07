import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOnlineChannel } from '../channel';

const state = vi.hoisted(() => ({
  invoke: vi.fn(),
  detectPlatform: vi.fn()
}));

vi.mock('@shared/platform', () => ({ detectPlatform: state.detectPlatform }));

function video(id: string) {
  return { id, title: id } as never;
}

beforeEach(() => {
  state.invoke.mockReset();
  state.detectPlatform.mockReset();
  state.detectPlatform.mockReturnValue({ platform: 'youtube' });
  (window as { api?: unknown }).api = { invoke: state.invoke };
});

describe('initial state and computed values', () => {
  it('starts empty and exposes tab-dependent computed values', () => {
    const c = createOnlineChannel();

    expect(c.channel.value).toBeNull();
    expect(c.channelInput.value).toBe('');
    expect(c.channelTab.value).toBe('videos');
    expect(c.channelHasShorts.value).toBe(true);
    expect(c.channelViewMode.value).toBe('grid');
    expect(c.channelItems.value).toEqual([]);
    expect(c.channelHasMore.value).toBe(false);

    c.channelShorts.value = [video('s1')];
    c.channelShortsHasMore.value = true;
    c.channelTab.value = 'shorts';
    expect(c.channelItems.value).toEqual([video('s1')]);
    expect(c.channelHasMore.value).toBe(true);
  });
});

describe('openChannel', () => {
  it('loads the videos tab for a YouTube channel', async () => {
    const c = createOnlineChannel();
    state.invoke.mockResolvedValueOnce({
      success: true,
      channel: { id: 'ch1', title: 'Channel' },
      items: [video('v1')],
      hasMore: true
    });

    await c.openChannel('https://youtube.com/@x');

    expect(state.invoke).toHaveBeenCalledWith('yt:channel', {
      url: 'https://youtube.com/@x',
      tab: 'videos'
    });
    expect(c.channel.value).toEqual({ id: 'ch1', title: 'Channel' });
    expect(c.channelInput.value).toBe('https://youtube.com/@x');
    expect(c.channelVideos.value).toEqual([video('v1')]);
    expect(c.channelVideosHasMore.value).toBe(true);
    expect(c.channelVideosOffset.value).toBe(1);
    expect(c.channelVideosLoaded.value).toBe(true);
    expect(c.channelLoading.value).toBe(false);
    expect(c.channelIsSc.value).toBe(false);
  });

  it('loads SoundCloud profiles without shorts', async () => {
    state.detectPlatform.mockReturnValue({ platform: 'soundcloud' });
    const c = createOnlineChannel();
    state.invoke.mockResolvedValueOnce({
      success: true,
      channel: { id: 'sc1' },
      items: [video('s1')],
      hasMore: false
    });

    await c.openChannel('https://soundcloud.com/artist');

    expect(state.invoke).toHaveBeenCalledWith('sc:channel', {
      url: 'https://soundcloud.com/artist'
    });
    expect(c.channelIsSc.value).toBe(true);
    expect(c.channelHasShorts.value).toBe(false);
    expect(c.channelVideosLoaded.value).toBe(true);
  });

  it('clears previous state before loading', async () => {
    const c = createOnlineChannel();
    c.channel.value = { id: 'old' } as never;
    c.channelVideos.value = [video('old')];
    c.channelShorts.value = [video('old-short')];
    c.channelError.value = 'old error';
    state.invoke.mockResolvedValueOnce({ success: true, channel: { id: 'new' }, items: [] });

    await c.openChannel('new');

    expect(c.channel.value).toEqual({ id: 'new' });
    expect(c.channelShorts.value).toEqual([]);
    expect(c.channelError.value).toBe('');
    expect(c.channelShortsLoaded.value).toBe(false);
  });
});

describe('tabs', () => {
  it('ignores SoundCloud, same-tab and missing-shorts switches', async () => {
    const c = createOnlineChannel();
    c.channelIsSc.value = true;
    await c.switchChannelTab('shorts');
    expect(c.channelTab.value).toBe('videos');

    c.channelIsSc.value = false;
    await c.switchChannelTab('videos');
    expect(state.invoke).not.toHaveBeenCalled();

    c.channelHasShorts.value = false;
    await c.switchChannelTab('shorts');
    expect(c.channelTab.value).toBe('videos');
    expect(state.invoke).not.toHaveBeenCalled();
  });

  it('loads shorts on first switch and reuses them later', async () => {
    const c = createOnlineChannel();
    state.invoke.mockResolvedValueOnce({
      success: true,
      channel: { id: 'ch' },
      items: [video('s1')],
      hasMore: false
    });

    await c.switchChannelTab('shorts');
    expect(c.channelTab.value).toBe('shorts');
    expect(c.channelShorts.value).toEqual([video('s1')]);
    expect(c.channelShortsLoaded.value).toBe(true);

    await c.switchChannelTab('videos');
    state.invoke.mockClear();
    await c.switchChannelTab('shorts');
    expect(state.invoke).not.toHaveBeenCalled();
  });

  it('falls back to videos when shorts are unavailable', async () => {
    const c = createOnlineChannel();
    state.invoke
      .mockResolvedValueOnce({ success: false, error: 'no_shorts_tab' })
      .mockResolvedValueOnce({ success: true, channel: { id: 'ch' }, items: [] });

    await c.switchChannelTab('shorts');

    expect(c.channelHasShorts.value).toBe(false);
    expect(c.channelTab.value).toBe('videos');
    expect(c.channelVideosLoaded.value).toBe(true);
    expect(state.invoke).toHaveBeenLastCalledWith('yt:channel', {
      url: '',
      tab: 'videos'
    });
  });

  it('does not reload videos when they are already loaded', async () => {
    const c = createOnlineChannel();
    c.channelVideosLoaded.value = true;
    state.invoke.mockResolvedValueOnce({ success: false, error: 'no_shorts_tab' });

    await c.switchChannelTab('shorts');
    expect(c.channelTab.value).toBe('videos');
    expect(state.invoke).toHaveBeenCalledTimes(1);
  });
});

describe('load errors and stale responses', () => {
  it('stores error messages and codes', async () => {
    const c = createOnlineChannel();
    state.invoke.mockResolvedValueOnce({ success: false, error: 'blocked', code: 'E_BLOCK' });

    await c.loadChannelTab('videos');
    expect(c.channelError.value).toBe('blocked');
    expect(c.channelErrorCode.value).toBe('E_BLOCK');
    expect(c.channelLoading.value).toBe(false);
  });

  it('falls back to the default message', async () => {
    const c = createOnlineChannel();
    state.invoke.mockResolvedValueOnce({ success: false });
    await c.loadChannelTab('videos');
    expect(c.channelError.value).toBe('Could not load this channel');
    expect(c.channelErrorCode.value).toBe('');
  });

  it('captures thrown failures', async () => {
    const c = createOnlineChannel();
    state.invoke.mockRejectedValueOnce(new Error('network'));
    await c.loadChannelTab('videos');
    expect(c.channelError.value).toBe('Could not load this channel');
  });

  it('ignores stale responses', async () => {
    const c = createOnlineChannel();
    let resolveFirst!: (value: unknown) => void;
    state.invoke
      .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce({ success: true, channel: { id: 'second' }, items: [] });

    const first = c.loadChannelTab('videos');
    const second = c.loadChannelTab('videos');
    await second;
    resolveFirst({ success: true, channel: { id: 'first' }, items: [video('stale')] });
    await first;

    expect(c.channel.value).toEqual({ id: 'second' });
    expect(c.channelVideos.value).toEqual([]);
  });
});

describe('loadMoreChannel', () => {
  it('requires a channel, idle loader and a loaded tab', async () => {
    const c = createOnlineChannel();
    await c.loadMoreChannel();
    expect(state.invoke).not.toHaveBeenCalled();

    c.channel.value = { id: 'ch' } as never;
    c.channelLoading.value = true;
    await c.loadMoreChannel();
    expect(state.invoke).not.toHaveBeenCalled();

    c.channelLoading.value = false;
    c.channelVideosLoaded.value = false;
    await c.loadMoreChannel();
    expect(state.invoke).not.toHaveBeenCalled();
  });

  it('appends videos without duplicates', async () => {
    const c = createOnlineChannel();
    c.channel.value = { id: 'ch' } as never;
    c.channelVideosLoaded.value = true;
    c.channelVideos.value = [video('a')];
    c.channelVideosOffset.value = 1;
    state.invoke.mockResolvedValueOnce({
      success: true,
      items: [video('a'), video('b')],
      hasMore: true
    });

    await c.loadMoreChannel();

    expect(state.invoke).toHaveBeenCalledWith('yt:channel', {
      url: '',
      tab: 'videos',
      start: 2,
      end: 31
    });
    expect(c.channelVideos.value.map((v) => v.id)).toEqual(['a', 'b']);
    expect(c.channelVideosOffset.value).toBe(3);
    expect(c.channelVideosHasMore.value).toBe(true);
  });

  it('appends shorts and uses the SoundCloud endpoint', async () => {
    const c = createOnlineChannel();
    c.channel.value = { id: 'ch' } as never;
    c.channelIsSc.value = true;
    c.channelTab.value = 'shorts';
    c.channelShortsLoaded.value = true;
    c.channelShorts.value = [video('s1')];
    c.channelShortsOffset.value = 1;
    state.invoke.mockResolvedValueOnce({
      success: true,
      items: [video('s1'), video('s2')],
      hasMore: false
    });

    await c.loadMoreChannel();

    expect(state.invoke).toHaveBeenCalledWith('sc:channel', {
      url: '',
      start: 2,
      end: 31
    });
    expect(c.channelShorts.value.map((v) => v.id)).toEqual(['s1', 's2']);
    expect(c.channelShortsHasMore.value).toBe(false);
  });

  it('captures thrown failures and ignores stale responses', async () => {
    const c = createOnlineChannel();
    c.channel.value = { id: 'ch' } as never;
    c.channelVideosLoaded.value = true;
    state.invoke.mockRejectedValueOnce(new Error('network'));
    await c.loadMoreChannel();
    expect(c.channelError.value).toBe('Could not load this channel');

    let resolveMore!: (value: unknown) => void;
    state.invoke.mockReturnValueOnce(new Promise((resolve) => (resolveMore = resolve)));
    const more = c.loadMoreChannel();
    c.closeChannel();
    resolveMore({ success: true, items: [video('stale')], hasMore: true });
    await more;
    expect(c.channelVideos.value).toEqual([]);
  });
});

describe('view mode and close', () => {
  it('changes the view mode', () => {
    const c = createOnlineChannel();
    c.setChannelViewMode('list');
    expect(c.channelViewMode.value).toBe('list');
  });

  it('resets everything on close', () => {
    const c = createOnlineChannel();
    c.channel.value = { id: 'ch' } as never;
    c.channelInput.value = 'url';
    c.channelIsSc.value = true;
    c.channelTab.value = 'shorts';
    c.channelHasShorts.value = false;
    c.channelError.value = 'err';
    c.channelErrorCode.value = 'code';
    c.channelVideos.value = [video('v')];
    c.channelVideosHasMore.value = true;
    c.channelVideosOffset.value = 5;
    c.channelVideosLoaded.value = true;
    c.channelShorts.value = [video('s')];
    c.channelShortsHasMore.value = true;
    c.channelShortsOffset.value = 3;
    c.channelShortsLoaded.value = true;
    c.channelLoading.value = true;

    c.closeChannel();

    expect(c.channel.value).toBeNull();
    expect(c.channelInput.value).toBe('');
    expect(c.channelIsSc.value).toBe(false);
    expect(c.channelTab.value).toBe('videos');
    expect(c.channelHasShorts.value).toBe(true);
    expect(c.channelError.value).toBe('');
    expect(c.channelErrorCode.value).toBe('');
    expect(c.channelVideos.value).toEqual([]);
    expect(c.channelVideosHasMore.value).toBe(false);
    expect(c.channelVideosOffset.value).toBe(0);
    expect(c.channelVideosLoaded.value).toBe(false);
    expect(c.channelShorts.value).toEqual([]);
    expect(c.channelShortsHasMore.value).toBe(false);
    expect(c.channelShortsOffset.value).toBe(0);
    expect(c.channelShortsLoaded.value).toBe(false);
    expect(c.channelLoading.value).toBe(false);
  });
});
