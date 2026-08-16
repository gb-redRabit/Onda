import { describe, expect, it } from 'vitest';
import { mapTableRows, tableArrayFromData } from '../generic-fetch';
import type { SourceTable } from '../../../renderer/src/types/sources';

function table(partial: Partial<SourceTable>): SourceTable {
  return { mode: 'endpoint', ...partial };
}

describe('tableArrayFromData', () => {
  it('mode=endpoint returns the root array', () => {
    const arr = [{ id: 1 }];
    expect(tableArrayFromData(arr, table({ mode: 'endpoint' }))).toBe(arr);
  });

  it('mode=endpoint returns undefined for a non-array response', () => {
    expect(tableArrayFromData({ data: [1] }, table({ mode: 'endpoint' }))).toBeUndefined();
  });

  it('mode=field returns the array at arrayField', () => {
    const arr = [{ n: 1 }];
    expect(
      tableArrayFromData({ episodes: arr }, table({ mode: 'field', arrayField: 'episodes' }))
    ).toBe(arr);
  });

  it('mode=field returns undefined when arrayField is missing', () => {
    expect(
      tableArrayFromData({}, table({ mode: 'field', arrayField: 'episodes' }))
    ).toBeUndefined();
  });
});

describe('mapTableRows', () => {
  const ROWS = [
    { anime_episode_number: 1, bg: 'https://x/1.jpg', created_at: '2026-01-01' },
    { anime_episode_number: 2, bg: 'https://x/2.jpg', created_at: '2026-01-02' }
  ];

  it('maps rows with title template {n} from rowKey and thumbnail', () => {
    const items = mapTableRows(
      ROWS,
      table({
        mode: 'endpoint',
        rowKey: 'anime_episode_number',
        title: 'Odcinek {n}',
        thumbnail: 'bg'
      })
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: '1',
      title: 'Odcinek 1',
      thumbnail: 'https://x/1.jpg',
      type: 'file',
      extra: ROWS[0]
    });
    expect(items[1]?.title).toBe('Odcinek 2');
  });

  it('resolves {a.b} placeholders from row fields in the title template', () => {
    const items = mapTableRows(
      [{ anime_episode_number: 1, info: { name: 'Pilot' } }],
      table({ mode: 'endpoint', rowKey: 'anime_episode_number', title: '{info.name} EP {n}' })
    );
    expect(items[0]?.title).toBe('Pilot EP 1');
  });

  it('keeps raw row data in extra (context for the child level)', () => {
    const items = mapTableRows(
      [{ anime_id: 'a1', anime_episode_number: 3 }],
      table({ mode: 'endpoint', rowKey: 'anime_episode_number', title: 'EP {n}' })
    );
    expect(items[0]?.extra).toMatchObject({ anime_id: 'a1', anime_episode_number: 3 });
  });

  it('maps playerUrl from row fields (embed/player links)', () => {
    const items = mapTableRows(
      [{ n: 1, embed_url: 'https://mega.nz/embed/abc', bg: 'https://x/1.jpg' }],
      table({ mode: 'endpoint', rowKey: 'n', title: 'EP {n}', thumbnail: 'bg', playerUrl: 'embed_url' })
    );
    expect(items[0]).toMatchObject({
      playerUrl: 'https://mega.nz/embed/abc',
      thumbnail: 'https://x/1.jpg'
    });
  });

  it('keeps rows whose title template leaves {n} unresolved (no rowKey match)', () => {
    const items = mapTableRows(
      [{ anime_episode_number: 1 }, { anime_episode_number: 2, bg: 'https://x/2.jpg' }],
      table({ mode: 'endpoint', rowKey: 'anime_episode_number', title: 'EP {n}', thumbnail: 'bg' })
    );
    expect(items).toHaveLength(2);
    expect(items[0]?.title).toBe('EP 1');
  });

  it('skips rows without title (no template) and without thumbnail', () => {
    const items = mapTableRows(
      [{ anime_episode_number: 1 }, { anime_episode_number: 2, bg: 'https://x/2.jpg' }],
      table({ mode: 'endpoint', thumbnail: 'bg' })
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.thumbnail).toBe('https://x/2.jpg');
  });

  it('treats a non-number rowKey value as string id', () => {
    const items = mapTableRows(
      [{ key: 'abc' }],
      table({ mode: 'endpoint', rowKey: 'key', title: '{key}' })
    );
    expect(items[0]).toMatchObject({ id: 'abc', title: 'abc' });
  });

  it('returns [] for a non-array input', () => {
    expect(mapTableRows({ data: [1] }, table({ mode: 'endpoint', title: 'EP {n}' }))).toEqual([]);
  });
});
