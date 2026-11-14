import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// Siatka regresyjna dla checker'a subskrypcji (główny proces): seed baseline,
// wykrywanie nowych pozycji, automatyczne kolejkowanie (YT i SC), ponowne
// kolejkowanie "zawieszonych" pozycji, ochrona przed nakładaniem się i per-kanał.
// Zależności zewnętrzne (yt-dlp, API SC, kolejka pobierania, store) są mockowane.

const h = vi.hoisted(() => ({ download: undefined as Record<string, unknown> | undefined }));

vi.mock('../youtube/youtube-handlers', () => ({
  fetchChannelItems: vi.fn(),
  fetchChannelAll: vi.fn()
}));

vi.mock('../soundcloud/soundcloud-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../soundcloud/soundcloud-client')>();
  return { ...actual, scProfileSnapshot: vi.fn() };
});

vi.mock('../../downloads/download-manager', () => ({
  addDownloadJobs: vi.fn(async () => []),
  listDownloadJobs: vi.fn(() => [])
}));

vi.mock('../cover/cover-cache', () => ({
  getStore: vi.fn(async () => ({
    get: (key: string) => (key === 'download' ? h.download : undefined)
  }))
}));

vi.mock('../../utils/broadcast', () => ({ broadcastToAllWindows: vi.fn() }));

import { fetchChannelItems, fetchChannelAll } from '../youtube/youtube-handlers';
import { scProfileSnapshot } from '../soundcloud/soundcloud-client';
import { getStore } from '../cover/cover-cache';
import { addDownloadJobs, listDownloadJobs } from '../../downloads/download-manager';
import { broadcastToAllWindows } from '../../utils/broadcast';
import {
  seedSubscriptionBaseline,
  checkSubscriptions,
  checkSingleChannel,
  startSubscriptionChecker,
  stopSubscriptionChecker
} from '../subscriptions/subscription-checker';
import {
  loadSubscriptions,
  addSubscription,
  updateSubscription
} from '../subscriptions/subscriptions-store';

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'onda-subs-checker-'));
  file = join(dir, 'subscriptions.json');
  h.download = undefined;
  vi.clearAllMocks();
  vi.mocked(listDownloadJobs).mockReturnValue([]);
  vi.mocked(addDownloadJobs).mockResolvedValue([]);
});

afterEach(async () => {
  stopSubscriptionChecker();
  // Odpornie na ENOTEMPTY: natychmiastowy check jest fire-and-forget i może
  // jeszcze dopisywać plik, gdy sprzątamy katalog.
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

async function seedYtSub(overrides: Record<string, unknown> = {}) {
  await addSubscription(file, {
    channelId: 'UC1',
    channelTitle: 'Chan',
    channelThumbnail: ''
  });
  if (Object.keys(overrides).length) await updateSubscription(file, 'UC1', overrides);
}

const ytSnapshot = (items: Array<{ id: string; title: string }>) => ({
  success: true,
  channel: {
    id: 'UC1',
    url: 'https://www.youtube.com/channel/UC1',
    title: 'Chan',
    thumbnail: 'thumb'
  },
  items: items.map((i) => ({ id: i.id, title: i.title, thumbnail: `${i.id}-t` }))
});

describe('seedSubscriptionBaseline', () => {
  it('records the newest YouTube video as the baseline', async () => {
    await seedYtSub();
    vi.mocked(fetchChannelItems).mockResolvedValueOnce(
      ytSnapshot([{ id: 'newest', title: 'N' }]) as never
    );
    await seedSubscriptionBaseline(file, 'UC1');
    const sub = (await loadSubscriptions(file))[0];
    expect(sub.baselineVideoId).toBe('newest');
    expect(sub.pendingCount).toBe(0);
  });

  it('records the newest SoundCloud track as the baseline', async () => {
    await addSubscription(file, {
      channelId: 'artist',
      channelTitle: 'A',
      channelThumbnail: '',
      platform: 'soundcloud'
    });
    vi.mocked(scProfileSnapshot).mockResolvedValueOnce({
      channel: { id: 'artist', url: '', title: 'A', thumbnail: '' },
      items: [
        {
          id: '99',
          title: 'New',
          description: '',
          thumbnail: '',
          channelTitle: '',
          channelId: '',
          publishedAt: ''
        }
      ]
    });
    await seedSubscriptionBaseline(file, 'artist');
    const sub = (await loadSubscriptions(file))[0];
    expect(sub.baselineVideoId).toBe('99');
  });

  it('handles legacy subscriptions without id lists', async () => {
    await mkdir(dir, { recursive: true });
    await writeFile(
      file,
      JSON.stringify([
        {
          channelId: 'UC1',
          channelTitle: 'Chan',
          channelThumbnail: '',
          baselineVideoId: 'v1',
          autoDownload: false,
          addedAt: 1
        }
      ])
    );
    vi.mocked(fetchChannelAll).mockResolvedValueOnce(
      ytSnapshot([
        { id: 'v2', title: 'New one' },
        { id: 'v1', title: 'Baseline' }
      ]) as never
    );

    const res = await checkSubscriptions(file);

    expect(res).toMatchObject({ checked: 1, newVideos: 1, errors: 0 });
  });

  it('handles legacy downloadedFiles during reconcile', async () => {
    await mkdir(dir, { recursive: true });
    const existing = join(dir, 'subscriptions.json');
    await writeFile(
      file,
      JSON.stringify([
        {
          channelId: 'UC1',
          channelTitle: 'Chan',
          channelThumbnail: '',
          baselineVideoId: 'v1',
          autoDownload: false,
          downloadedFiles: { v2: existing },
          addedAt: 1
        }
      ])
    );
    vi.mocked(fetchChannelAll).mockResolvedValueOnce(
      ytSnapshot([
        { id: 'v2', title: 'Two' },
        { id: 'v1', title: 'One' }
      ]) as never
    );

    const res = await checkSubscriptions(file, undefined, true);

    expect(res).toMatchObject({ checked: 1, errors: 0 });
  });

  it('skips the SoundCloud baseline when the profile has no tracks', async () => {
    await addSubscription(file, {
      channelId: 'empty',
      channelTitle: 'E',
      channelThumbnail: '',
      platform: 'soundcloud'
    });
    vi.mocked(scProfileSnapshot).mockResolvedValueOnce({
      channel: { id: 'empty', url: '', title: 'E', thumbnail: '' },
      items: []
    });

    await seedSubscriptionBaseline(file, 'empty');

    const sub = (await loadSubscriptions(file))[0];
    expect(sub.baselineVideoId).toBeUndefined();
    expect(fetchChannelItems).not.toHaveBeenCalled();
  });

  it('skips the YouTube baseline for empty or failed fetches and swallows errors', async () => {
    await seedYtSub();
    vi.mocked(fetchChannelItems).mockResolvedValueOnce({ success: false, items: [] } as never);
    await seedSubscriptionBaseline(file, 'UC1');
    expect((await loadSubscriptions(file))[0].baselineVideoId).toBeUndefined();

    vi.mocked(fetchChannelItems).mockRejectedValueOnce(new Error('down'));
    await expect(seedSubscriptionBaseline(file, 'UC1')).resolves.toBeUndefined();
  });

  it('treats an unknown channel as YouTube and tolerates a no-op update', async () => {
    vi.mocked(fetchChannelItems).mockResolvedValueOnce(
      ytSnapshot([{ id: 'newest', title: 'N' }]) as never
    );

    await expect(seedSubscriptionBaseline(file, 'missing')).resolves.toBeUndefined();
    expect(fetchChannelItems).toHaveBeenCalled();
  });
});

describe('checkSubscriptions', () => {
  it('reports new arrivals above the baseline without queueing when auto-download is off', async () => {
    await seedYtSub({ baselineVideoId: 'v1' });
    vi.mocked(fetchChannelAll).mockResolvedValueOnce(
      ytSnapshot([
        { id: 'v2', title: 'New one' },
        { id: 'v1', title: 'Baseline' }
      ]) as never
    );
    const res = await checkSubscriptions(file);
    expect(res).toMatchObject({ checked: 1, newVideos: 1, queued: 0, errors: 0 });
    expect(addDownloadJobs).not.toHaveBeenCalled();
    expect(broadcastToAllWindows).toHaveBeenCalledWith(
      'yt:newVideos',
      expect.objectContaining({ channelId: 'UC1', count: 1 })
    );
    const sub = (await loadSubscriptions(file))[0];
    expect(sub.pendingCount).toBe(2); // pozostaje liczba niepobranych (v1 i v2)
    expect(sub.newArrivals).toBe(1);
  });

  it('falls back to stored metadata when the channel snapshot is bare', async () => {
    await seedYtSub({ baselineVideoId: 'v1' });
    vi.mocked(fetchChannelAll).mockResolvedValueOnce({
      success: true,
      channel: { id: 'UC1', url: '', title: '', thumbnail: '' },
      items: [{ id: 'v2', title: 'New', thumbnail: '' }]
    } as never);

    const res = await checkSubscriptions(file);

    expect(res).toMatchObject({ newVideos: 1 });
    expect(broadcastToAllWindows).toHaveBeenCalledWith(
      'yt:newVideos',
      expect.objectContaining({ channelTitle: 'Chan' })
    );
    const sub = (await loadSubscriptions(file))[0];
    expect(sub.channelTitle).toBe('Chan');
    expect(sub.channelThumbnail).toBe('');
  });

  it('queues new YouTube videos and remembers them in queuedVideoIds', async () => {
    h.download = {
      autoDownloadSubscriptions: true,
      defaultPath: 'C:/dl',
      filenameTemplate: '{title}'
    };
    await seedYtSub({ baselineVideoId: 'v1', autoDownload: true });
    vi.mocked(fetchChannelAll).mockResolvedValueOnce(
      ytSnapshot([
        { id: 'v2', title: 'New one' },
        { id: 'v1', title: 'Baseline' }
      ]) as never
    );
    vi.mocked(addDownloadJobs).mockImplementationOnce(async (jobs) => jobs as never);
    const res = await checkSubscriptions(file);
    expect(res.queued).toBe(1);
    const jobs = vi.mocked(addDownloadJobs).mock.calls[0][0] as Array<{
      videoId: string;
      url: string;
    }>;
    expect(jobs[0].videoId).toBe('v2');
    expect(jobs[0].url).toBe('https://www.youtube.com/watch?v=v2');
    const sub = (await loadSubscriptions(file))[0];
    expect(sub.queuedVideoIds).toContain('v2');
    expect(sub.downloadedVideoIds).toEqual([]);
  });

  it('queues new SoundCloud tracks as soundcloud-mode jobs with a raw MP3 filename', async () => {
    h.download = {
      autoDownloadSubscriptions: true,
      defaultPath: 'C:/dl',
      filenameTemplate: '{title}'
    };
    await addSubscription(file, {
      channelId: 'artist',
      channelTitle: 'A',
      channelThumbnail: '',
      platform: 'soundcloud'
    });
    await updateSubscription(file, 'artist', { baselineVideoId: 't1', autoDownload: true });
    vi.mocked(scProfileSnapshot).mockResolvedValueOnce({
      channel: { id: 'artist', url: 'https://soundcloud.com/artist', title: 'A', thumbnail: 'th' },
      items: [
        {
          id: 't2',
          title: 'Fresh',
          description: '',
          thumbnail: 'x',
          channelTitle: 'A',
          channelId: 'artist',
          publishedAt: '',
          url: 'https://soundcloud.com/artist/fresh'
        },
        {
          id: 't1',
          title: 'Old',
          description: '',
          thumbnail: 'y',
          channelTitle: 'A',
          channelId: 'artist',
          publishedAt: '',
          url: 'https://soundcloud.com/artist/old'
        }
      ]
    });
    vi.mocked(addDownloadJobs).mockImplementationOnce(async (jobs) => jobs as never);
    const res = await checkSubscriptions(file);
    expect(res.queued).toBe(1);
    const jobs = vi.mocked(addDownloadJobs).mock.calls[0][0] as Array<{
      videoId: string;
      source?: { mode: string; fileName?: string };
    }>;
    expect(jobs[0].videoId).toBe('t2');
    expect(jobs[0].source?.mode).toBe('soundcloud');
    expect(jobs[0].source?.fileName).toMatch(/\.mp3$/);
  });

  it('applies every global auto-download default', async () => {
    h.download = {
      autoDownloadSubscriptions: true,
      defaultPath: 'C:/dl',
      defaultAudioFormat: 'm4a',
      defaultVideoQuality: '720',
      filenameTemplate: '{title}',
      defaultKind: 'video',
      defaultSubs: true,
      defaultSubsLangs: 'en,de',
      defaultAudioQuality: 'high'
    };
    await seedYtSub({ baselineVideoId: 'v1', autoDownload: true });
    vi.mocked(fetchChannelAll).mockResolvedValueOnce(
      ytSnapshot([
        { id: 'v2', title: 'New one' },
        { id: 'v1', title: 'Baseline' }
      ]) as never
    );
    vi.mocked(addDownloadJobs).mockImplementationOnce(async (jobs) => jobs as never);

    await checkSubscriptions(file);

    const job = (
      vi.mocked(addDownloadJobs).mock.calls[0][0] as unknown as Array<Record<string, unknown>>
    )[0];
    expect(job).toMatchObject({
      kind: 'video',
      format: 'm4a',
      quality: '720',
      outputDir: 'C:/dl',
      filenameTemplate: '{title}',
      audioQuality: 'high',
      subsLangs: 'en,de'
    });
  });

  it('prefers per-subscription download prefs over globals', async () => {
    h.download = { autoDownloadSubscriptions: true, defaultSubs: false };
    await seedYtSub({
      baselineVideoId: 'v1',
      autoDownload: true,
      downloadPrefs: {
        kind: 'audio',
        format: 'mp3',
        quality: 'best',
        outputDir: 'D:/prefs',
        filenameTemplate: '{artist}',
        audioQuality: 'low',
        subsLangs: 'fr',
        addToLibrary: true
      }
    });
    vi.mocked(fetchChannelAll).mockResolvedValueOnce(
      ytSnapshot([
        { id: 'v2', title: 'New one' },
        { id: 'v1', title: 'Baseline' }
      ]) as never
    );
    vi.mocked(addDownloadJobs).mockImplementationOnce(async (jobs) => jobs as never);

    await checkSubscriptions(file);

    const job = (
      vi.mocked(addDownloadJobs).mock.calls[0][0] as unknown as Array<Record<string, unknown>>
    )[0];
    expect(job).toMatchObject({
      format: 'mp3',
      outputDir: 'D:/prefs',
      filenameTemplate: '{artist}',
      audioQuality: 'low',
      subsLangs: 'fr',
      addToLibrary: true
    });
  });

  it('does not queue when global auto-download is disabled', async () => {
    h.download = { autoDownloadSubscriptions: false };
    await seedYtSub({ baselineVideoId: 'v1', autoDownload: true });
    vi.mocked(fetchChannelAll).mockResolvedValueOnce(
      ytSnapshot([
        { id: 'v2', title: 'New one' },
        { id: 'v1', title: 'Baseline' }
      ]) as never
    );

    const res = await checkSubscriptions(file);

    expect(res.queued).toBe(0);
    expect(addDownloadJobs).not.toHaveBeenCalled();
  });

  it('falls back to built-in defaults when the settings store fails', async () => {
    vi.mocked(getStore).mockRejectedValueOnce(new Error('store down'));
    await seedYtSub({ baselineVideoId: 'v1' });
    vi.mocked(fetchChannelAll).mockResolvedValueOnce(
      ytSnapshot([{ id: 'v1', title: 'Baseline' }]) as never
    );

    const res = await checkSubscriptions(file);

    expect(res).toMatchObject({ checked: 1, errors: 0 });
  });

  it('queues SoundCloud tracks without a canonical url using the profile url', async () => {
    h.download = { autoDownloadSubscriptions: true, defaultPath: 'C:/dl' };
    await addSubscription(file, {
      channelId: 'artist',
      channelTitle: 'A',
      channelThumbnail: '',
      platform: 'soundcloud'
    });
    await updateSubscription(file, 'artist', { baselineVideoId: 't1', autoDownload: true });
    vi.mocked(scProfileSnapshot).mockResolvedValueOnce({
      channel: { id: 'artist', url: '', title: '', thumbnail: '' },
      items: [
        {
          id: 't2',
          title: 'Fresh',
          description: '',
          thumbnail: '',
          channelTitle: '',
          channelId: 'artist',
          publishedAt: ''
        }
      ]
    });
    vi.mocked(addDownloadJobs).mockImplementationOnce(async (jobs) => jobs as never);

    await checkSubscriptions(file);

    const job = (
      vi.mocked(addDownloadJobs).mock.calls[0][0] as unknown as Array<Record<string, unknown>>
    )[0];
    expect(job).toMatchObject({
      url: 'https://soundcloud.com/artist',
      channelTitle: 'A',
      thumbnail: ''
    });
  });

  it('re-queues stale queuedVideoIds whose download task vanished', async () => {
    h.download = { autoDownloadSubscriptions: true };
    // v2 jest w kolejce, ale nie ma aktywnego zadania i nie jest pobrane → ponowne zakolejkowanie.
    await seedYtSub({ baselineVideoId: 'v1', autoDownload: true, queuedVideoIds: ['v2'] });
    vi.mocked(fetchChannelAll).mockResolvedValueOnce(
      ytSnapshot([
        { id: 'v2', title: 'New one' },
        { id: 'v1', title: 'Baseline' }
      ]) as never
    );
    vi.mocked(listDownloadJobs).mockReturnValue([]);
    vi.mocked(addDownloadJobs).mockImplementationOnce(async (jobs) => jobs as never);
    const res = await checkSubscriptions(file);
    expect(res.queued).toBe(1);
  });

  it('does not re-queue a queuedVideoId that still has an active download task', async () => {
    h.download = { autoDownloadSubscriptions: true };
    await seedYtSub({ baselineVideoId: 'v1', autoDownload: true, queuedVideoIds: ['v2'] });
    vi.mocked(fetchChannelAll).mockResolvedValueOnce(
      ytSnapshot([
        { id: 'v2', title: 'New one' },
        { id: 'v1', title: 'Baseline' }
      ]) as never
    );
    vi.mocked(listDownloadJobs).mockReturnValue([
      { id: 'job1', videoId: 'v2', status: 'downloading' } as never
    ]);
    const res = await checkSubscriptions(file);
    expect(res.queued).toBe(0);
    expect(addDownloadJobs).not.toHaveBeenCalled();
  });

  it('treats paused and missing job ids as inactive', async () => {
    h.download = { autoDownloadSubscriptions: true };
    await seedYtSub({ baselineVideoId: 'v1', autoDownload: true, queuedVideoIds: ['v2'] });
    vi.mocked(fetchChannelAll).mockResolvedValueOnce(
      ytSnapshot([
        { id: 'v2', title: 'New one' },
        { id: 'v1', title: 'Baseline' }
      ]) as never
    );
    vi.mocked(listDownloadJobs).mockReturnValue([
      { id: 'job1', status: 'pending' } as never,
      { id: 'job2', videoId: 'v2', status: 'paused' } as never
    ]);

    const res = await checkSubscriptions(file);

    expect(res.queued).toBe(0);
    expect(addDownloadJobs).not.toHaveBeenCalled();
  });

  it('counts an error and continues when a channel fetch fails', async () => {
    await seedYtSub({ baselineVideoId: 'v1' });
    vi.mocked(fetchChannelAll).mockRejectedValueOnce(new Error('down'));
    const res = await checkSubscriptions(file);
    expect(res).toMatchObject({ checked: 0, errors: 1 });
  });

  it('guards against overlapping runs', async () => {
    await seedYtSub({ baselineVideoId: 'v1' });
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    vi.mocked(fetchChannelAll).mockImplementationOnce(async () => {
      await gate;
      return ytSnapshot([{ id: 'v1', title: 'Baseline' }]) as never;
    });
    const first = checkSubscriptions(file);
    const second = await checkSubscriptions(file); // widzi checkRunning = true
    expect(second).toEqual({ checked: 0, newVideos: 0, queued: 0, errors: 0, busy: true });
    release();
    await first;
  });
});

describe('file reconciliation (manual checks)', () => {
  it('manual check unmarks missing files without re-queueing them in the same run', async () => {
    h.download = { autoDownloadSubscriptions: true, defaultPath: 'C:/dl' };
    await seedYtSub({
      baselineVideoId: 'v1',
      autoDownload: true,
      downloadedVideoIds: ['v2'],
      downloadedFiles: { v2: join(dir, 'missing.mp3') }
    });
    vi.mocked(fetchChannelAll).mockResolvedValueOnce(
      ytSnapshot([
        { id: 'v2', title: 'Two' },
        { id: 'v1', title: 'One' }
      ]) as never
    );

    const res = await checkSubscriptions(file, undefined, true);

    const sub = (await loadSubscriptions(file))[0];
    expect(sub.downloadedVideoIds).toEqual([]); // odznaczony — pliku nie ma
    expect(sub.downloadedFiles).toEqual({});
    expect(sub.pendingCount).toBe(2); // oba znów „do pobrania"
    expect(res.queued).toBe(0);
    // Diff liczy „nowe" na starym zbiorze → odznaczony film NIE trafia do kolejki w tym przebiegu.
    expect(addDownloadJobs).not.toHaveBeenCalled();
  });

  it('backfills downloadedFiles from the output folder and reports the deleted video', async () => {
    const outputDir = join(dir, 'out');
    await mkdir(outputDir, { recursive: true });
    const existing = join(outputDir, 'Two - Chan.mp3');
    await writeFile(existing, 'x');
    await seedYtSub({
      baselineVideoId: 'v1',
      downloadedVideoIds: ['v2', 'v3'],
      downloadPrefs: { outputDir }
    });
    vi.mocked(fetchChannelAll).mockResolvedValueOnce(
      ytSnapshot([
        { id: 'v3', title: 'Three' },
        { id: 'v2', title: 'Two' },
        { id: 'v1', title: 'One' }
      ]) as never
    );

    const res = await checkSubscriptions(file, undefined, true);

    const sub = (await loadSubscriptions(file))[0];
    expect(sub.downloadedVideoIds).toEqual(['v2']);
    expect(sub.downloadedFiles).toEqual({ v2: existing });
    expect(sub.pendingCount).toBe(2);
    expect(res.missing).toEqual([{ id: 'v3', title: 'Three' }]);
  });

  it('ignores a missing output folder during backfill', async () => {
    await seedYtSub({
      baselineVideoId: 'v1',
      downloadedVideoIds: ['v2'],
      downloadPrefs: { outputDir: join(dir, 'does-not-exist') }
    });
    vi.mocked(fetchChannelAll).mockResolvedValueOnce(
      ytSnapshot([
        { id: 'v2', title: 'Two' },
        { id: 'v1', title: 'One' }
      ]) as never
    );

    await checkSubscriptions(file, undefined, true);

    const sub = (await loadSubscriptions(file))[0];
    expect(sub.downloadedVideoIds).toEqual(['v2']);
  });

  it('walks nested output folders only up to the depth limit', async () => {
    const outputDir = join(dir, 'out');
    const deep = join(outputDir, 'a', 'b', 'c', 'd');
    const tooDeep = join(deep, 'e');
    await mkdir(tooDeep, { recursive: true });
    const two = join(deep, 'Two - Chan.mp3');
    await writeFile(two, 'x');
    await writeFile(join(tooDeep, 'Three - Chan.mp3'), 'x');
    await writeFile(join(outputDir, 'notes.txt'), 'x');
    await seedYtSub({
      baselineVideoId: 'v1',
      downloadedVideoIds: ['v2', 'v3'],
      downloadPrefs: { outputDir }
    });
    vi.mocked(fetchChannelAll).mockResolvedValueOnce(
      ytSnapshot([
        { id: 'v3', title: 'Three' },
        { id: 'v2', title: 'Two' },
        { id: 'v1', title: 'One' }
      ]) as never
    );

    const res = await checkSubscriptions(file, undefined, true);

    const sub = (await loadSubscriptions(file))[0];
    expect(sub.downloadedFiles).toEqual({ v2: two });
    expect(res.missing).toEqual([{ id: 'v3', title: 'Three' }]);
  });

  it('uses the video extension preference when matching files', async () => {
    const outputDir = join(dir, 'out-video');
    await mkdir(outputDir, { recursive: true });
    const filePath = join(outputDir, 'Two - Chan.mp4');
    await writeFile(filePath, 'x');
    await seedYtSub({
      baselineVideoId: 'v1',
      downloadedVideoIds: ['v2'],
      downloadPrefs: { outputDir, kind: 'video' }
    });
    vi.mocked(fetchChannelAll).mockResolvedValueOnce(
      ytSnapshot([
        { id: 'v2', title: 'Two' },
        { id: 'v1', title: 'One' }
      ]) as never
    );

    await checkSubscriptions(file, undefined, true);

    const sub = (await loadSubscriptions(file))[0];
    expect(sub.downloadedFiles).toEqual({ v2: filePath });
  });

  it('skips backfill when no file matches', async () => {
    const outputDir = join(dir, 'out-nomatch');
    await mkdir(outputDir, { recursive: true });
    await writeFile(join(outputDir, 'Unknown - Chan.mp3'), 'x');
    await seedYtSub({
      baselineVideoId: 'v1',
      downloadedVideoIds: ['v2'],
      downloadPrefs: { outputDir, format: 'mp3' }
    });
    vi.mocked(fetchChannelAll).mockResolvedValueOnce(
      ytSnapshot([
        { id: 'v2', title: 'Two' },
        { id: 'v1', title: 'One' }
      ]) as never
    );

    await checkSubscriptions(file, undefined, true);

    const sub = (await loadSubscriptions(file))[0];
    expect(sub.downloadedFiles ?? {}).toEqual({});
  });

  it('reports removed files that are no longer in the channel list', async () => {
    await seedYtSub({
      baselineVideoId: 'v1',
      downloadedVideoIds: ['ghost'],
      downloadedFiles: { ghost: join(dir, 'gone.mp3') }
    });
    vi.mocked(fetchChannelAll).mockResolvedValueOnce(
      ytSnapshot([{ id: 'v1', title: 'One' }]) as never
    );

    const res = await checkSubscriptions(file, undefined, true);

    expect(res.missing).toEqual([{ id: 'ghost', title: 'ghost' }]);
    const sub = (await loadSubscriptions(file))[0];
    expect(sub.downloadedVideoIds).toEqual([]);
  });

  it('suppresses mass-missing reports when matching is unreliable', async () => {
    const outputDir = join(dir, 'out-mass');
    await mkdir(outputDir, { recursive: true });
    await writeFile(join(outputDir, 'Episode 0 - Chan.mp3'), 'x');
    const ids = Array.from({ length: 20 }, (_, i) => `v${i}`);
    const items = ids.map((id, i) => ({ id, title: `Episode ${i}` }));
    await seedYtSub({
      baselineVideoId: 'base',
      downloadedVideoIds: ids,
      downloadPrefs: { outputDir }
    });
    vi.mocked(fetchChannelAll).mockResolvedValueOnce(
      ytSnapshot([...items, { id: 'base', title: 'Base' }]) as never
    );

    const res = await checkSubscriptions(file, undefined, true);

    expect(res.missing).toBeUndefined();
  });

  it('uses the stored channel title when the snapshot has none', async () => {
    const outputDir = join(dir, 'out-title');
    await mkdir(outputDir, { recursive: true });
    const filePath = join(outputDir, 'Two - Chan.mp3');
    await writeFile(filePath, 'x');
    await seedYtSub({
      baselineVideoId: 'v1',
      downloadedVideoIds: ['v2'],
      downloadPrefs: { outputDir }
    });
    vi.mocked(fetchChannelAll).mockResolvedValueOnce({
      success: true,
      channel: { id: 'UC1', url: '', title: '', thumbnail: '' },
      items: [
        { id: 'v2', title: 'Two', thumbnail: '' },
        { id: 'v1', title: 'One', thumbnail: '' }
      ]
    } as never);

    await checkSubscriptions(file, undefined, true);

    const sub = (await loadSubscriptions(file))[0];
    expect(sub.downloadedFiles).toEqual({ v2: filePath });
  });

  it('tolerates a subscription removed mid-check', async () => {
    await seedYtSub({
      baselineVideoId: 'v1',
      downloadedVideoIds: ['v2'],
      downloadedFiles: { v2: join(dir, 'subscriptions.json') }
    });
    vi.mocked(fetchChannelAll).mockImplementationOnce(async () => {
      await rm(file, { force: true });
      return ytSnapshot([
        { id: 'v2', title: 'Two' },
        { id: 'v1', title: 'One' }
      ]) as never;
    });

    const res = await checkSubscriptions(file, undefined, true);

    expect(res).toMatchObject({ checked: 1, errors: 0 });
  });

  it('skips non-file entries in output folders', async (ctx) => {
    const outputDir = join(dir, 'out-links');
    await mkdir(outputDir, { recursive: true });
    const target = join(outputDir, 'Two - Chan.mp3');
    await writeFile(target, 'x');
    const link = join(outputDir, 'link.mp3');
    try {
      await symlink(target, link, 'file');
    } catch {
      ctx.skip();
      return;
    }
    await seedYtSub({
      baselineVideoId: 'v1',
      downloadedVideoIds: ['v2'],
      downloadPrefs: { outputDir }
    });
    vi.mocked(fetchChannelAll).mockResolvedValueOnce(
      ytSnapshot([
        { id: 'v2', title: 'Two' },
        { id: 'v1', title: 'One' }
      ]) as never
    );

    await checkSubscriptions(file, undefined, true);

    expect(fetchChannelAll).toHaveBeenCalled();
  });

  it('keeps downloaded entries whose files still exist', async () => {
    await seedYtSub({
      baselineVideoId: 'v1',
      downloadedVideoIds: ['v2'],
      downloadedFiles: { v2: join(dir, 'subscriptions.json') }
    });
    vi.mocked(fetchChannelAll).mockResolvedValueOnce(
      ytSnapshot([
        { id: 'v2', title: 'Two' },
        { id: 'v1', title: 'One' }
      ]) as never
    );

    await checkSubscriptions(file, undefined, true);

    const sub = (await loadSubscriptions(file))[0];
    expect(sub.downloadedVideoIds).toEqual(['v2']);
  });

  it('does not reconcile on a scheduled check (reconcile defaults to off)', async () => {
    await seedYtSub({
      baselineVideoId: 'v1',
      downloadedVideoIds: ['v2'],
      downloadedFiles: { v2: join(dir, 'missing.mp3') }
    });
    vi.mocked(fetchChannelAll).mockResolvedValueOnce(
      ytSnapshot([
        { id: 'v2', title: 'Two' },
        { id: 'v1', title: 'One' }
      ]) as never
    );

    await checkSubscriptions(file);

    const sub = (await loadSubscriptions(file))[0];
    expect(sub.downloadedVideoIds).toEqual(['v2']);
  });

  it('checkSingleChannel reconciles the requested channel', async () => {
    await seedYtSub({
      baselineVideoId: 'v1',
      downloadedVideoIds: ['v2'],
      downloadedFiles: { v2: join(dir, 'missing.mp3') }
    });
    vi.mocked(fetchChannelAll).mockResolvedValueOnce(
      ytSnapshot([
        { id: 'v2', title: 'Two' },
        { id: 'v1', title: 'One' }
      ]) as never
    );

    await checkSingleChannel(file, 'UC1');

    const sub = (await loadSubscriptions(file))[0];
    expect(sub.downloadedVideoIds).toEqual([]);
  });
});

describe('checkSingleChannel', () => {
  it('only checks the requested channel', async () => {
    await seedYtSub({ baselineVideoId: 'v1' });
    await addSubscription(file, { channelId: 'UC2', channelTitle: 'Other', channelThumbnail: '' });
    vi.mocked(fetchChannelAll).mockResolvedValue(ytSnapshot([]) as never);
    const res = await checkSingleChannel(file, 'UC2');
    expect(res.checked).toBe(1);
    expect(fetchChannelAll).toHaveBeenCalledTimes(1);
    expect(String((vi.mocked(fetchChannelAll).mock.calls[0][0] as { url: string }).url)).toContain(
      'UC2'
    );
  });
});

describe('startSubscriptionChecker', () => {
  it('runs an immediate check and can be stopped', async () => {
    await seedYtSub({ baselineVideoId: 'v1' });
    vi.mocked(fetchChannelAll).mockResolvedValue(ytSnapshot([]) as never);
    startSubscriptionChecker(file, 60_000);
    // Natychmiastowy check jest fire-and-forget — poczekaj aż efekt się pojawi.
    for (let i = 0; i < 100 && !vi.mocked(fetchChannelAll).mock.calls.length; i++) {
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(fetchChannelAll).toHaveBeenCalled();
    stopSubscriptionChecker();
    stopSubscriptionChecker();
  });

  it('uses the default interval when none is provided', async () => {
    await seedYtSub({ baselineVideoId: 'v1' });
    vi.mocked(fetchChannelAll).mockResolvedValue(ytSnapshot([]) as never);

    startSubscriptionChecker(file);

    for (let i = 0; i < 100 && !vi.mocked(fetchChannelAll).mock.calls.length; i++) {
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(fetchChannelAll).toHaveBeenCalled();
    stopSubscriptionChecker();
  });

  it('runs another check on the configured interval', async () => {
    await seedYtSub({ baselineVideoId: 'v1' });
    vi.mocked(fetchChannelAll).mockResolvedValue(ytSnapshot([]) as never);

    startSubscriptionChecker(file, 20);
    for (let i = 0; i < 200 && vi.mocked(fetchChannelAll).mock.calls.length < 2; i += 1) {
      await new Promise((r) => setTimeout(r, 10));
    }

    expect(vi.mocked(fetchChannelAll).mock.calls.length).toBeGreaterThanOrEqual(2);
    stopSubscriptionChecker();
  });
});
