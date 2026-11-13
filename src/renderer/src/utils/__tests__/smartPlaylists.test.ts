import { describe, expect, it } from 'vitest';
import type { MediaFile } from '@shared/types/media';
import type { SmartPlaylist } from '@shared/types/smart-playlist';
import {
  SMART_FIELD_DEFS,
  SMART_PLAYLIST_TEMPLATES,
  countSmartPlaylist,
  matchesSmartPlaylist,
  resolveSmartPlaylist,
  ruleMatches
} from '../smartPlaylists';

const NOW = Date.UTC(2026, 9, 21);
const DAY = 86_400_000;

function track(overrides: Partial<MediaFile> = {}): MediaFile {
  return {
    id: overrides.path ?? 'id',
    name: 'Track',
    path: '/music/track.mp3',
    extension: 'mp3',
    mimeType: 'audio/mpeg',
    size: 1,
    type: 'audio',
    addedAt: NOW - 5 * DAY,
    playCount: 0,
    ...overrides,
    metadata: {
      title: 'Track',
      artist: 'Artist',
      album: 'Album',
      genre: 'Rock',
      year: 2001,
      lossless: false,
      ...overrides.metadata
    }
  };
}

const ctx = { favorites: new Set<string>(), now: NOW };

function playlist(overrides: Partial<SmartPlaylist> = {}): SmartPlaylist {
  return {
    id: 'smart-1',
    name: 'Test',
    match: 'all',
    rules: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides
  };
}

describe('smart playlist rules', () => {
  it('matches text fields case-insensitively', () => {
    const t = track();
    expect(ruleMatches(t, { field: 'genre', operator: 'contains', value: 'roc' }, ctx)).toBe(true);
    expect(ruleMatches(t, { field: 'artist', operator: 'equals', value: 'artist' }, ctx)).toBe(
      true
    );
    expect(ruleMatches(t, { field: 'album', operator: 'notEquals', value: 'Other' }, ctx)).toBe(
      true
    );
  });

  it('matches numeric fields, including between', () => {
    const t = track({ playCount: 7 });
    expect(ruleMatches(t, { field: 'playCount', operator: 'gte', value: 5 }, ctx)).toBe(true);
    expect(ruleMatches(t, { field: 'playCount', operator: 'lte', value: 5 }, ctx)).toBe(false);
    expect(ruleMatches(t, { field: 'year', operator: 'between', value: [2000, 2010] }, ctx)).toBe(
      true
    );
  });

  it('matches booleans and favorites', () => {
    const t = track({ metadata: { lossless: true } });
    const favorites = new Set([t.path]);
    expect(ruleMatches(t, { field: 'lossless', operator: 'isTrue', value: true }, ctx)).toBe(true);
    expect(
      ruleMatches(t, { field: 'favorite', operator: 'isTrue', value: true }, { ...ctx, favorites })
    ).toBe(true);
    expect(ruleMatches(t, { field: 'hasCover', operator: 'isFalse', value: false }, ctx)).toBe(
      true
    );
  });

  it('matches date windows and never played', () => {
    const recent = track({ lastPlayed: NOW - 2 * DAY });
    const old = track({ lastPlayed: NOW - 60 * DAY });
    const never = track({ lastPlayed: undefined });
    expect(
      ruleMatches(recent, { field: 'lastPlayed', operator: 'withinLastDays', value: 7 }, ctx)
    ).toBe(true);
    expect(
      ruleMatches(old, { field: 'lastPlayed', operator: 'olderThanDays', value: 30 }, ctx)
    ).toBe(true);
    expect(ruleMatches(never, { field: 'lastPlayed', operator: 'never', value: 0 }, ctx)).toBe(
      true
    );
  });

  it('combines rules with all/any', () => {
    const t = track({ playCount: 10 });
    const all = playlist({
      match: 'all',
      rules: [
        { field: 'genre', operator: 'contains', value: 'rock' },
        { field: 'playCount', operator: 'gte', value: 5 }
      ]
    });
    const any = playlist({
      match: 'any',
      rules: [
        { field: 'genre', operator: 'contains', value: 'jazz' },
        { field: 'playCount', operator: 'gte', value: 5 }
      ]
    });
    expect(matchesSmartPlaylist(t, all, ctx)).toBe(true);
    expect(matchesSmartPlaylist(t, any, ctx)).toBe(true);
  });

  it('ignores non-audio tracks and empty rule sets', () => {
    const video = track({ type: 'video' });
    const def = playlist({ rules: [{ field: 'genre', operator: 'contains', value: 'rock' }] });
    expect(matchesSmartPlaylist(video, def, ctx)).toBe(false);
    expect(matchesSmartPlaylist(track(), playlist(), ctx)).toBe(false);
  });
});

describe('resolveSmartPlaylist', () => {
  const tracks = [
    track({ path: '/a.mp3', playCount: 1, metadata: { title: 'A' } }),
    track({ path: '/b.mp3', playCount: 9, metadata: { title: 'B' } }),
    track({ path: '/c.mp3', playCount: 5, metadata: { title: 'C' } })
  ];

  it('sorts and limits results', () => {
    const def = playlist({
      rules: [{ field: 'playCount', operator: 'gte', value: 1 }],
      sort: 'playCount',
      sortDir: 'desc',
      limit: 2
    });
    expect(resolveSmartPlaylist(def, tracks, ctx).map((t) => t.path)).toEqual(['/b.mp3', '/c.mp3']);
  });

  it('counts all matches regardless of limit', () => {
    const def = playlist({
      rules: [{ field: 'playCount', operator: 'gte', value: 1 }],
      limit: 1
    });
    expect(countSmartPlaylist(def, tracks, ctx)).toBe(3);
  });

  it('does not count tracks that fail the rules', () => {
    const def = playlist({ rules: [{ field: 'playCount', operator: 'gte', value: 5 }] });

    expect(countSmartPlaylist(def, tracks, ctx)).toBe(2);
  });
});

describe('smart playlist field coverage', () => {
  it('reads every text field', () => {
    const t = track({ path: '/x/song.mp3' });
    expect(ruleMatches(t, { field: 'title', operator: 'contains', value: 'rack' }, ctx)).toBe(true);
    expect(ruleMatches(t, { field: 'path', operator: 'equals', value: '/x/song.mp3' }, ctx)).toBe(
      true
    );
  });

  it('reads every numeric field', () => {
    const t = track({
      duration: 200,
      metadata: { bitrate: 320 },
      addedAt: NOW - 10 * DAY,
      lastPlayed: NOW - 10 * DAY
    });

    expect(ruleMatches(t, { field: 'duration', operator: 'gte', value: 100 }, ctx)).toBe(true);
    expect(ruleMatches(t, { field: 'bitrate', operator: 'lte', value: 320 }, ctx)).toBe(true);
    expect(ruleMatches(t, { field: 'addedAt', operator: 'withinLastDays', value: 30 }, ctx)).toBe(
      true
    );
    expect(ruleMatches(t, { field: 'lastPlayed', operator: 'olderThanDays', value: 5 }, ctx)).toBe(
      true
    );
  });

  it('rejects unknown fields and unsupported operators', () => {
    const t = track();
    expect(ruleMatches(t, { field: 'bogus' as never, operator: 'contains', value: 'x' }, ctx)).toBe(
      false
    );
    expect(ruleMatches(t, { field: 'title', operator: 'gte', value: 1 }, ctx)).toBe(false);
    expect(ruleMatches(t, { field: 'playCount', operator: 'contains', value: 'x' }, ctx)).toBe(
      false
    );
    expect(ruleMatches(track(), null as never, ctx)).toBe(false);
    expect(
      ruleMatches(t, { field: 'title', operator: 'contains', value: undefined as never }, ctx)
    ).toBe(true);
  });

  it('requires an array for between and a finite target', () => {
    const t = track({ playCount: 5 });
    expect(ruleMatches(t, { field: 'playCount', operator: 'between', value: 5 }, ctx)).toBe(false);
    expect(ruleMatches(t, { field: 'playCount', operator: 'gte', value: 'many' }, ctx)).toBe(false);
  });

  it('handles favorites and false booleans', () => {
    const t = track();
    const favorites = new Set([t.path]);
    expect(
      ruleMatches(
        t,
        { field: 'favorite', operator: 'isFalse', value: false },
        { ...ctx, favorites }
      )
    ).toBe(false);
    expect(ruleMatches(t, { field: 'lossless', operator: 'isFalse', value: false }, ctx)).toBe(
      true
    );
  });

  it('rejects invalid or missing date windows', () => {
    const played = track({ lastPlayed: NOW - DAY });
    expect(
      ruleMatches(played, { field: 'lastPlayed', operator: 'withinLastDays', value: 'soon' }, ctx)
    ).toBe(false);
    expect(
      ruleMatches(played, { field: 'lastPlayed', operator: 'withinLastDays', value: -1 }, ctx)
    ).toBe(false);
    expect(
      ruleMatches(played, { field: 'lastPlayed', operator: 'olderThanDays', value: 1 }, ctx)
    ).toBe(false);
    expect(
      ruleMatches(
        track({ lastPlayed: undefined }),
        { field: 'lastPlayed', operator: 'never', value: 0 },
        ctx
      )
    ).toBe(true);
    expect(ruleMatches(played, { field: 'lastPlayed', operator: 'never', value: 0 }, ctx)).toBe(
      false
    );
    expect(
      ruleMatches(
        track({ lastPlayed: undefined }),
        { field: 'lastPlayed', operator: 'withinLastDays', value: 7 },
        ctx
      )
    ).toBe(false);
  });

  it('falls back to empty metadata values', () => {
    const bare = track({
      name: 'Bare',
      metadata: {
        title: undefined,
        artist: undefined,
        album: undefined,
        genre: undefined,
        year: undefined,
        bitrate: undefined,
        lossless: undefined
      } as never,
      duration: undefined,
      playCount: undefined,
      addedAt: undefined,
      lastPlayed: undefined
    });

    expect(ruleMatches(bare, { field: 'title', operator: 'equals', value: 'Bare' }, ctx)).toBe(
      true
    );
    expect(ruleMatches(bare, { field: 'artist', operator: 'equals', value: '' }, ctx)).toBe(true);
    expect(ruleMatches(bare, { field: 'album', operator: 'equals', value: '' }, ctx)).toBe(true);
    expect(ruleMatches(bare, { field: 'genre', operator: 'equals', value: '' }, ctx)).toBe(true);
    expect(ruleMatches(bare, { field: 'duration', operator: 'gte', value: 0 }, ctx)).toBe(true);
    expect(ruleMatches(bare, { field: 'bitrate', operator: 'lte', value: 0 }, ctx)).toBe(true);
    expect(ruleMatches(bare, { field: 'playCount', operator: 'lte', value: 0 }, ctx)).toBe(true);
    expect(ruleMatches(bare, { field: 'year', operator: 'between', value: [0, 0] }, ctx)).toBe(
      true
    );
  });
});

describe('smart playlist sorting', () => {
  const a = track({ path: '/a.mp3', metadata: { title: 'Alpha', artist: 'Zed', album: 'Two' } });
  const b = track({ path: '/b.mp3', metadata: { title: 'beta', artist: 'Amy', album: 'One' } });

  function sorted(sort: SmartPlaylist['sort'], sortDir?: 'asc' | 'desc', limit?: number) {
    const def = playlist({
      rules: [{ field: 'playCount', operator: 'gte', value: 0 }],
      sort,
      sortDir,
      limit
    });
    return resolveSmartPlaylist(def, [a, b], ctx).map((t) => t.path);
  }

  it('sorts text fields case-insensitively with an ascending default', () => {
    expect(sorted('title')).toEqual(['/a.mp3', '/b.mp3']);
    expect(sorted('artist')).toEqual(['/b.mp3', '/a.mp3']);
    expect(sorted('album')).toEqual(['/b.mp3', '/a.mp3']);
    expect(sorted('title', 'desc')).toEqual(['/b.mp3', '/a.mp3']);
  });

  it('sorts numeric fields descending by default and respects an explicit direction', () => {
    const quiet = track({ path: '/quiet.mp3', playCount: 1 });
    const loud = track({ path: '/loud.mp3', playCount: 9 });
    const def = playlist({
      rules: [{ field: 'playCount', operator: 'gte', value: 0 }],
      sort: 'playCount'
    });

    expect(resolveSmartPlaylist(def, [quiet, loud], ctx).map((t) => t.path)).toEqual([
      '/loud.mp3',
      '/quiet.mp3'
    ]);
    expect(sorted('playCount', 'asc')).toEqual(['/a.mp3', '/b.mp3']);
  });

  it('keeps all matches when there is no limit', () => {
    expect(sorted('title', 'asc', 0)).toHaveLength(2);
  });

  it('returns matches without sorting when no sort is configured', () => {
    const def = playlist({
      rules: [{ field: 'playCount', operator: 'gte', value: 0 }]
    });

    expect(resolveSmartPlaylist(def, [a, b], ctx)).toHaveLength(2);
  });

  it('sorts metadata-less tracks by their filenames', () => {
    const bareMetadata = {
      title: undefined,
      artist: undefined,
      album: undefined
    } as never;
    const bareA = track({ path: '/z.mp3', name: 'Zeta', metadata: bareMetadata });
    const bareB = track({ path: '/y.mp3', name: 'Alpha', metadata: bareMetadata });

    for (const sort of ['title', 'artist', 'album'] as const) {
      const def = playlist({
        rules: [{ field: 'playCount', operator: 'gte', value: 0 }],
        sort
      });
      const order = resolveSmartPlaylist(def, [bareA, bareB], ctx).map((t) => t.path);
      expect(order).toEqual(sort === 'title' ? ['/y.mp3', '/z.mp3'] : ['/z.mp3', '/y.mp3']);
    }
  });
});

describe('smart playlist metadata', () => {
  it('exposes field definitions and operator lists', () => {
    expect(SMART_FIELD_DEFS.length).toBeGreaterThan(0);
    expect(SMART_FIELD_DEFS.every((def) => def.operators.length > 0)).toBe(true);
  });

  it('builds every template with a rule and a sort', () => {
    for (const template of SMART_PLAYLIST_TEMPLATES) {
      const built = template.build();
      expect(built.rules.length).toBeGreaterThan(0);
      expect(built.sort).toBeTruthy();
    }
  });
});
