import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

vi.mock('electron', () => ({
  app: { getPath: () => process.env.TEMP || '/tmp' }
}));

import { drainScrobbleQueue, enqueueScrobble, loadScrobbleQueue } from '../scrobble-queue';

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
});
