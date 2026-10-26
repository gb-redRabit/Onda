import { describe, expect, it } from 'vitest';
import type { MediaFile } from '@shared/types/media';
import type { SmartPlaylist } from '@shared/types/smart-playlist';
import {
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
});
