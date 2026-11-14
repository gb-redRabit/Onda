import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

vi.mock('electron', () => ({
  app: { getPath: () => process.env.TEMP || '/tmp' }
}));

import {
  drainScrobbleQueue,
  enqueueScrobble,
  loadScrobbleQueue,
  scrobbleQueuePath
} from '../scrobble-queue';

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'onda-scrobble-queue-'));
  file = join(dir, 'scrobble-queue.json');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const track = { artist: 'Artist', title: 'Title', durationSec: 120 };

describe('scrobble queue', () => {
  it('persists queued scrobbles', async () => {
    await enqueueScrobble(file, 'lastfm', track);
    await enqueueScrobble(file, 'listenbrainz', track);

    const entries = await loadScrobbleQueue(file);
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.service)).toEqual(['lastfm', 'listenbrainz']);
    expect(entries[0].track).toEqual(track);
  });

  it('removes entries accepted by the sender and keeps failures', async () => {
    await enqueueScrobble(file, 'lastfm', track);
    await enqueueScrobble(file, 'listenbrainz', track);

    await drainScrobbleQueue(file, async (service) => service === 'lastfm');

    const entries = await loadScrobbleQueue(file);
    expect(entries).toHaveLength(1);
    expect(entries[0].service).toBe('listenbrainz');
  });

  it('retries entries when the sender throws', async () => {
    await enqueueScrobble(file, 'lastfm', track);

    await drainScrobbleQueue(file, async () => {
      throw new Error('offline');
    });

    expect(await loadScrobbleQueue(file)).toHaveLength(1);
  });

  it('resolves the queue file inside userData', () => {
    expect(scrobbleQueuePath()).toBe(join(process.env.TEMP || '/tmp', 'scrobble-queue.json'));
  });

  it('ignores a non-array payload', async () => {
    await writeFile(file, 'null');
    await expect(loadScrobbleQueue(file)).resolves.toEqual([]);
  });

  it('caps the queue at 500 entries', async () => {
    const entries = Array.from({ length: 500 }, (_, index) => ({
      service: 'lastfm',
      track,
      queuedAt: index
    }));
    await writeFile(file, JSON.stringify(entries));

    await enqueueScrobble(file, 'listenbrainz', track);

    const loaded = await loadScrobbleQueue(file);
    expect(loaded).toHaveLength(500);
    expect(loaded[0]?.queuedAt).toBe(1);
    expect(loaded.at(-1)?.service).toBe('listenbrainz');
  });

  it('drains an empty queue without calling the sender', async () => {
    const send = vi.fn(async () => true);
    await drainScrobbleQueue(file, send);
    expect(send).not.toHaveBeenCalled();
  });

  it('clears the queue when every entry is accepted', async () => {
    await enqueueScrobble(file, 'lastfm', track);

    await drainScrobbleQueue(file, async () => true);

    await expect(loadScrobbleQueue(file)).resolves.toEqual([]);
  });

  it('keeps the write chain usable after a failed save', async () => {
    const blocked = join(dir, 'blocked');
    await mkdir(blocked);
    await expect(enqueueScrobble(blocked, 'lastfm', track)).rejects.toThrow();

    await enqueueScrobble(file, 'lastfm', track);
    await expect(loadScrobbleQueue(file)).resolves.toHaveLength(1);
  });
});
