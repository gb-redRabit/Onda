import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import type { IpcSavedData } from '../../../shared/types/ipc';
import { loadSavedData, persistSaved } from '../saved-streams';

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'onda-saved-test-'));
  file = join(dir, 'saved-streams.json');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const data: IpcSavedData = {
  tracks: [
    {
      id: 'abc123',
      title: 'Some Song',
      thumbnail: 'https://i.ytimg.com/vi/abc123/hqdefault.jpg',
      channelTitle: 'Some Channel',
      channelId: 'UCxxx',
      duration: '3:45',
      savedAt: Date.now()
    }
  ],
  playlists: [
    {
      id: 'PLxyz',
      kind: 'playlist',
      url: 'https://www.youtube.com/playlist?list=PLxyz',
      title: 'My Mix',
      channelTitle: 'Some Channel',
      totalItems: 42,
      items: [
        { id: 'vid1', title: 'First', savedAt: Date.now() },
        { id: 'vid2', title: 'Second', savedAt: Date.now() }
      ],
      savedAt: Date.now()
    }
  ]
};

describe('saved-streams store', () => {
  it('returns empty data for a missing file', async () => {
    await expect(loadSavedData(file)).resolves.toEqual({ tracks: [], playlists: [] });
  });

  it('round-trips persisted data', async () => {
    await persistSaved(file, data);
    await expect(loadSavedData(file)).resolves.toEqual(data);
  });

  it('ignores a store with an unknown schema version', async () => {
    await persistSaved(file, data);
    const raw = JSON.parse(await readFile(file, 'utf-8')) as { version: number };
    raw.version = 99;
    await writeFile(file, JSON.stringify(raw), 'utf-8');
    await expect(loadSavedData(file)).resolves.toEqual({ tracks: [], playlists: [] });
  });

  it('drops malformed rows', async () => {
    const broken = {
      version: 1,
      tracks: [
        { id: 'no-title' },
        { title: 'no-id' },
        { id: 'ok', title: 'Fine' },
        null,
        'junk'
      ],
      playlists: [
        { id: 'a', url: 'https://youtube.com/playlist?list=a' },
        { id: 'b', url: 'https://youtube.com/playlist?list=b', kind: 'video', title: 'Bad kind' },
        { id: 'c', url: 'https://youtube.com/playlist?list=c', kind: 'playlist', title: 'Good' },
        null
      ]
    };
    await writeFile(file, JSON.stringify(broken), 'utf-8');
    const loaded = await loadSavedData(file);
    expect(loaded.tracks.map((t) => t.id)).toEqual(['ok']);
    expect(loaded.playlists.map((p) => p.id)).toEqual(['c']);
  });

  it('caps the persisted lists at the store limits', async () => {
    const many: IpcSavedData = {
      tracks: Array.from({ length: 600 }, (_, i) => ({
        id: `t${i}`,
        title: `Track ${i}`,
        savedAt: Date.now()
      })),
      playlists: Array.from({ length: 150 }, (_, i) => ({
        id: `p${i}`,
        kind: 'playlist' as const,
        url: `https://www.youtube.com/playlist?list=p${i}`,
        title: `Playlist ${i}`,
        savedAt: Date.now()
      }))
    };
    await persistSaved(file, many);
    const loaded = await loadSavedData(file);
    expect(loaded.tracks.length).toBeLessThanOrEqual(500);
    expect(loaded.playlists.length).toBeLessThanOrEqual(100);
  });

  it('sanitizes and caps playlist items on load', async () => {
    const broken = {
      version: 1,
      tracks: [],
      playlists: [
        {
          id: 'a',
          kind: 'playlist' as const,
          url: 'https://www.youtube.com/playlist?list=a',
          title: 'Big mix',
          items: [
            { id: 'ok1', title: 'Fine' },
            { id: 'no-title' },
            null,
            'junk',
            ...Array.from({ length: 600 }, (_, i) => ({
              id: `bulk${i}`,
              title: `Bulk ${i}`
            }))
          ],
          savedAt: Date.now()
        }
      ]
    };
    await writeFile(file, JSON.stringify(broken), 'utf-8');
    const loaded = await loadSavedData(file);
    expect(loaded.playlists[0]?.items?.length).toBeLessThanOrEqual(500);
    expect(loaded.playlists[0]?.items?.map((i) => i.id)).not.toContain('no-title');
    expect(loaded.playlists[0]?.items?.[0]?.id).toBe('ok1');
  });
});
