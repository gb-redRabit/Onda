import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  loadSubscriptions,
  addSubscription,
  removeSubscription,
  updateSubscription,
  appendDownloadedVideos
} from '../subscriptions-store';

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'onda-subs-test-'));
  file = join(dir, 'subscriptions.json');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('subscriptions-store', () => {
  it('returns an empty list for a missing file', async () => {
    await expect(loadSubscriptions(file)).resolves.toEqual([]);
  });

  it('adds a subscription and persists it', async () => {
    const sub = await addSubscription(file, {
      channelId: 'UC123',
      channelTitle: 'Test Channel',
      channelThumbnail: 'https://example.com/thumb.jpg'
    });
    expect(sub).not.toBeNull();
    expect(sub!.channelId).toBe('UC123');
    expect(sub!.autoDownload).toBe(true);
    expect(sub!.downloadedVideoIds).toEqual([]);

    const list = await loadSubscriptions(file);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ channelId: 'UC123', channelTitle: 'Test Channel' });

    const onDisk = JSON.parse(await readFile(file, 'utf-8'));
    expect(onDisk).toHaveLength(1);
  });

  it('is idempotent for the same channel', async () => {
    const first = await addSubscription(file, {
      channelId: 'UC123',
      channelTitle: 'Test Channel',
      channelThumbnail: ''
    });
    const second = await addSubscription(file, {
      channelId: 'UC123',
      channelTitle: 'Different Name',
      channelThumbnail: 'x'
    });
    expect(second!.channelId).toBe(first!.channelId);
    expect(second!.channelTitle).toBe(first!.channelTitle);
    expect(await loadSubscriptions(file)).toHaveLength(1);
  });

  it('rejects a subscription without a channelId', async () => {
    await expect(
      addSubscription(file, { channelId: '', channelTitle: 'X', channelThumbnail: '' })
    ).resolves.toBeNull();
    await expect(loadSubscriptions(file)).resolves.toEqual([]);
  });

  it('removes a subscription', async () => {
    await addSubscription(file, {
      channelId: 'UC123',
      channelTitle: 'Test Channel',
      channelThumbnail: ''
    });
    await expect(removeSubscription(file, 'UC123')).resolves.toBe(true);
    await expect(removeSubscription(file, 'UC123')).resolves.toBe(false);
    await expect(loadSubscriptions(file)).resolves.toEqual([]);
  });

  it('updates a subscription with a patch', async () => {
    await addSubscription(file, {
      channelId: 'UC123',
      channelTitle: 'Test Channel',
      channelThumbnail: ''
    });
    const updated = await updateSubscription(file, 'UC123', {
      autoDownload: false,
      lastChecked: 42,
      lastVideoId: 'vid9'
    });
    expect(updated).not.toBeNull();
    expect(updated!.autoDownload).toBe(false);
    expect(updated!.lastChecked).toBe(42);
    expect(updated!.lastVideoId).toBe('vid9');

    const list = await loadSubscriptions(file);
    expect(list[0]).toMatchObject({ autoDownload: false, lastChecked: 42, lastVideoId: 'vid9' });
  });

  it('returns null when updating an unknown channel', async () => {
    await expect(updateSubscription(file, 'nope', { autoDownload: false })).resolves.toBeNull();
  });

  it('appends to downloadedVideoIds on patch', async () => {
    const sub = await addSubscription(file, {
      channelId: 'UC123',
      channelTitle: 'Test Channel',
      channelThumbnail: ''
    });
    const updated = await updateSubscription(file, sub!.channelId, {
      downloadedVideoIds: [...(sub!.downloadedVideoIds || []), 'newVid']
    });
    expect(updated!.downloadedVideoIds).toContain('newVid');
  });

  it('persists pendingCount and downloadPrefs', async () => {
    await addSubscription(file, {
      channelId: 'UC123',
      channelTitle: 'Test Channel',
      channelThumbnail: ''
    });
    const updated = await updateSubscription(file, 'UC123', {
      pendingCount: 3,
      downloadPrefs: { kind: 'video', quality: '1080p', format: 'video' }
    });
    expect(updated).not.toBeNull();
    expect(updated!.pendingCount).toBe(3);
    expect(updated!.downloadPrefs).toEqual({ kind: 'video', quality: '1080p', format: 'video' });

    const list = await loadSubscriptions(file);
    expect(list[0].pendingCount).toBe(3);
    expect(list[0].downloadPrefs).toEqual({ kind: 'video', quality: '1080p', format: 'video' });
  });

  it('appendDownloadedVideos grows downloadedVideoIds without duplicates', async () => {
    await addSubscription(file, {
      channelId: 'UC123',
      channelTitle: 'Test Channel',
      channelThumbnail: ''
    });
    await appendDownloadedVideos(file, 'UC123', ['vid-a', 'vid-b', 'vid-a']);
    const list = await loadSubscriptions(file);
    expect(list[0].downloadedVideoIds).toEqual(['vid-a', 'vid-b']);
  });

  it('appendDownloadedVideos drops finished ids from queuedVideoIds', async () => {
    await addSubscription(file, {
      channelId: 'UC123',
      channelTitle: 'Test Channel',
      channelThumbnail: ''
    });
    await updateSubscription(file, 'UC123', {
      queuedVideoIds: ['vid-a', 'vid-b', 'vid-c']
    });
    await appendDownloadedVideos(file, 'UC123', ['vid-a', 'vid-c']);
    const list = await loadSubscriptions(file);
    expect(list[0].downloadedVideoIds).toEqual(['vid-a', 'vid-c']);
    expect(list[0].queuedVideoIds).toEqual(['vid-b']);
  });

  it('appendDownloadedVideos decrements pendingCount by freshly downloaded ids only', async () => {
    await addSubscription(file, {
      channelId: 'UC123',
      channelTitle: 'Test Channel',
      channelThumbnail: ''
    });
    await updateSubscription(file, 'UC123', {
      pendingCount: 5,
      queuedVideoIds: ['vid-a', 'vid-b', 'vid-c', 'vid-d', 'vid-e']
    });
    await appendDownloadedVideos(file, 'UC123', ['vid-a', 'vid-b']);
    let list = await loadSubscriptions(file);
    expect(list[0].pendingCount).toBe(3);
    // Re-appending an already downloaded id must not decrement twice.
    await appendDownloadedVideos(file, 'UC123', ['vid-a']);
    list = await loadSubscriptions(file);
    expect(list[0].pendingCount).toBe(3);

    // Multiple concurrent completions keep the count live under the write lock.
    await Promise.all(
      ['vid-c', 'vid-d', 'vid-e'].map((id) => appendDownloadedVideos(file, 'UC123', [id]))
    );
    list = await loadSubscriptions(file);
    expect(list[0].pendingCount).toBe(0);
  });

  it('appendDownloadedVideos never drives pendingCount below zero', async () => {
    await addSubscription(file, {
      channelId: 'UC123',
      channelTitle: 'Test Channel',
      channelThumbnail: ''
    });
    await updateSubscription(file, 'UC123', { pendingCount: 1 });
    await appendDownloadedVideos(file, 'UC123', ['vid-a', 'vid-b']);
    const list = await loadSubscriptions(file);
    expect(list[0].pendingCount).toBe(0);
  });

  it('appendDownloadedVideos is null for an unknown channel', async () => {
    const result = await appendDownloadedVideos(file, 'nope', ['vid-a']);
    expect(result).toBeNull();
  });

  it('serializes concurrent writes so no downloadedVideoIds entry is lost', async () => {
    await addSubscription(file, {
      channelId: 'UC123',
      channelTitle: 'Test Channel',
      channelThumbnail: ''
    });
    const ids = Array.from({ length: 25 }, (_, i) => `vid-${i}`);
    await Promise.all(ids.map((id) => appendDownloadedVideos(file, 'UC123', [id])));
    const list = await loadSubscriptions(file);
    expect(list[0].downloadedVideoIds).toHaveLength(25);
    for (const id of ids) {
      expect(list[0].downloadedVideoIds).toContain(id);
    }
  });

  it('persists baselineVideoId on patch', async () => {
    await addSubscription(file, {
      channelId: 'UC123',
      channelTitle: 'Test Channel',
      channelThumbnail: ''
    });
    const updated = await updateSubscription(file, 'UC123', { baselineVideoId: 'baseline-vid' });
    expect(updated!.baselineVideoId).toBe('baseline-vid');
    const list = await loadSubscriptions(file);
    expect(list[0].baselineVideoId).toBe('baseline-vid');
  });
});
