import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';
import type { MusicbrainzRelease } from '@shared/types/ipc';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}));
vi.mock('@shared/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() }
}));

const { useMusicBrainzLookup } = await import('../useMusicBrainzLookup');

function release(id: string, title = 'Album', score = 100): MusicbrainzRelease {
  return {
    id,
    title,
    score,
    date: '2001-03-12',
    'artist-credit': [{ name: 'Artist', artist: { name: 'Artist' } }],
    media: [{ tracks: [{ title: 'Track' }] }],
    genres: [{ name: 'Electronic' }]
  } as unknown as MusicbrainzRelease;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

let scopes: Array<{ stop: () => void }> = [];

function createLookup(onApply = vi.fn()) {
  const scope = effectScope();
  let api!: ReturnType<typeof useMusicBrainzLookup>;
  scope.run(() => {
    api = useMusicBrainzLookup({ onApply });
  });
  scopes.push(scope);
  return { api, onApply };
}

function apiMock() {
  return {
    musicbrainzSearchRelease: vi.fn(),
    musicbrainzLookupRelease: vi.fn(),
    musicbrainzGetCoverData: vi.fn()
  };
}

let api: ReturnType<typeof apiMock>;

beforeEach(() => {
  api = apiMock();
  api.musicbrainzGetCoverData.mockResolvedValue({ success: false });
  (window as { api?: unknown }).api = api;
  scopes = [];
});

afterEach(() => {
  for (const scope of scopes) scope.stop();
  delete (window as { api?: unknown }).api;
  vi.useRealTimers();
});

describe('query fields', () => {
  it('builds the query from individual fields', () => {
    const { api: lookup } = createLookup();
    lookup.queryArtist.value = 'Daft Punk';
    lookup.queryTitle.value = 'One More Time';
    lookup.queryAlbum.value = 'Discovery';
    lookup.queryYear.value = '2001';

    expect(lookup.query.value).toBe(
      'artist:"Daft Punk" AND release:"Discovery" AND "One More Time" AND date:2001'
    );
  });

  it('parses an initial query without clearing absent fields', () => {
    const { api: lookup } = createLookup();
    lookup.queryYear.value = '1999';

    lookup.parseInitial('Artist - Title');
    expect(lookup.queryArtist.value).toBe('Artist');
    expect(lookup.queryTitle.value).toBe('Title');
    expect(lookup.queryYear.value).toBe('1999');

    lookup.parseInitial('Just an album');
    expect(lookup.queryAlbum.value).toBe('Just an album');
  });
});

describe('search', () => {
  it('does nothing for an empty query', async () => {
    const { api: lookup } = createLookup();
    await lookup.search();
    expect(api.musicbrainzSearchRelease).not.toHaveBeenCalled();
  });

  it('stores releases and fetches cover thumbnails', async () => {
    const { api: lookup } = createLookup();
    lookup.queryArtist.value = 'Artist';
    api.musicbrainzSearchRelease.mockResolvedValue({
      success: true,
      releases: [release('a'), release('b')]
    });
    api.musicbrainzGetCoverData.mockResolvedValue({
      success: true,
      data: [1, 2, 3],
      mime: 'image/jpeg'
    });

    const pending = lookup.search();
    expect(lookup.loading.value).toBe(true);
    await pending;

    expect(lookup.releases.value).toHaveLength(2);
    expect(lookup.status.value).toBe('musicbrainz.found');
    expect(lookup.loading.value).toBe(false);

    await vi.waitFor(() => expect(Object.keys(lookup.coverThumbs.value)).toHaveLength(2));
    expect(lookup.coverThumbs.value.a).toContain('data:image/jpeg;base64,');
  });

  it('reports an API error and keeps no results', async () => {
    const { api: lookup } = createLookup();
    lookup.queryArtist.value = 'Artist';
    api.musicbrainzSearchRelease.mockResolvedValue({ success: false, error: 'boom' });

    await lookup.search();

    expect(lookup.error.value).toBe('boom');
    expect(lookup.status.value).toBe('');
    expect(lookup.releases.value).toEqual([]);
  });

  it('falls back to the localized no-results message', async () => {
    const { api: lookup } = createLookup();
    lookup.queryArtist.value = 'Artist';
    api.musicbrainzSearchRelease.mockResolvedValue({ success: true, releases: [] });

    await lookup.search();
    expect(lookup.error.value).toBe('musicbrainz.noResults');
  });

  it('retries without quotes after a timeout', async () => {
    const { api: lookup } = createLookup();
    lookup.queryArtist.value = 'The "Band"';
    api.musicbrainzSearchRelease
      .mockResolvedValueOnce({ success: false, error: 'Timeout while searching' })
      .mockResolvedValueOnce({ success: true, releases: [release('retry')] });

    await lookup.search();

    expect(api.musicbrainzSearchRelease).toHaveBeenCalledTimes(2);
    expect(api.musicbrainzSearchRelease.mock.calls[1][0]).not.toContain('"');
    expect(lookup.releases.value.map((r) => r.id)).toEqual(['retry']);
  });

  it('ignores a slower response from an older search', async () => {
    const { api: lookup } = createLookup();
    lookup.queryArtist.value = 'old';
    const first = deferred<unknown>();
    api.musicbrainzSearchRelease.mockReturnValueOnce(first.promise);

    const firstRun = lookup.search();

    lookup.queryArtist.value = 'new';
    api.musicbrainzSearchRelease.mockResolvedValueOnce({
      success: true,
      releases: [release('newer')]
    });
    await lookup.search();
    expect(lookup.releases.value.map((r) => r.id)).toEqual(['newer']);

    first.resolve({ success: true, releases: [release('older')] });
    await firstRun;
    expect(lookup.releases.value.map((r) => r.id)).toEqual(['newer']);
  });
});

describe('selectRelease', () => {
  it('loads details and embeds the cover', async () => {
    const { api: lookup } = createLookup();
    const rel = release('abc');
    api.musicbrainzLookupRelease.mockResolvedValue({ success: true, release: rel });
    api.musicbrainzGetCoverData.mockResolvedValue({
      success: true,
      data: [9, 8],
      mime: 'image/png'
    });

    await lookup.selectRelease(rel);

    expect(lookup.selectedId.value).toBe('abc');
    expect(lookup.lookingUp.value).toBeNull();
    expect(lookup.lookupResult.value).toMatchObject({
      _coverData: [9, 8],
      _coverMime: 'image/png'
    });
    expect(lookup.status.value).toBe('');
  });

  it('keeps the result when the cover is rate limited', async () => {
    const { api: lookup } = createLookup();
    const rel = release('abc');
    api.musicbrainzLookupRelease.mockResolvedValue({ success: true, release: rel });
    api.musicbrainzGetCoverData.mockResolvedValue({ success: false, rateLimited: true });

    await lookup.selectRelease(rel);

    expect(lookup.lookupResult.value).not.toBeNull();
    expect(lookup.lookupResult.value?._coverData).toBeUndefined();
  });

  it('reports a lookup failure', async () => {
    const { api: lookup } = createLookup();
    api.musicbrainzLookupRelease.mockResolvedValue({ success: false, error: 'nope' });

    await lookup.selectRelease(release('bad'));

    expect(lookup.error.value).toBe('nope');
    expect(lookup.lookupResult.value).toBeNull();
    expect(lookup.lookingUp.value).toBeNull();
  });

  it('ignores an older lookup response', async () => {
    const { api: lookup } = createLookup();
    const first = deferred<unknown>();
    api.musicbrainzLookupRelease.mockReturnValueOnce(first.promise);

    const firstRun = lookup.selectRelease(release('old'));
    api.musicbrainzLookupRelease.mockResolvedValueOnce({
      success: true,
      release: release('new')
    });
    api.musicbrainzGetCoverData.mockResolvedValue({ success: false });
    await lookup.selectRelease(release('new'));

    first.resolve({ success: true, release: release('old') });
    await firstRun;
    expect(lookup.lookupResult.value?.id).toBe('new');
  });
});

describe('applyTags', () => {
  it('does nothing without a lookup result', () => {
    const { api: lookup, onApply } = createLookup();
    lookup.applyTags();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('maps the selected fields and reports per-field outcomes', () => {
    const { api: lookup, onApply } = createLookup();
    lookup.lookupResult.value = {
      ...release('r'),
      _coverData: [1],
      _coverMime: 'image/jpeg'
    };

    lookup.applyTags();

    expect(onApply).toHaveBeenCalledWith({
      album: 'Album',
      year: 2001,
      artist: 'Artist',
      title: 'Track',
      track: { no: 1 },
      coverData: [1],
      coverMime: 'image/jpeg'
    });
    expect(lookup.applyResult.value).toMatchObject({
      title: true,
      artist: true,
      album: true,
      year: true,
      genre: 'pominięte',
      track: true,
      cover: false
    });
  });

  it('marks a missing cover and missing optional values', () => {
    const { api: lookup, onApply } = createLookup();
    lookup.lookupResult.value = {
      id: 'minimal',
      title: 'Album'
    } as unknown as MusicbrainzRelease;
    lookup.includeFields.value = { ...lookup.includeFields.value, genre: true, cover: true };

    lookup.applyTags();

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ album: 'Album', track: { no: 1 } })
    );
    expect(lookup.applyResult.value).toMatchObject({
      title: false,
      artist: false,
      genre: false,
      cover: 'brak okładki'
    });
  });

  it('clears the per-field result after three seconds', () => {
    vi.useFakeTimers();
    const { api: lookup } = createLookup();
    lookup.lookupResult.value = release('r');

    lookup.applyTags();
    expect(lookup.applyResult.value).not.toBeNull();

    vi.advanceTimersByTime(2999);
    expect(lookup.applyResult.value).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(lookup.applyResult.value).toBeNull();
  });
});

describe('scope disposal', () => {
  it('stops applying cover thumbnails after the scope is disposed', async () => {
    const { api: lookup } = createLookup();
    const cover = deferred<unknown>();
    lookup.queryArtist.value = 'Artist';
    api.musicbrainzSearchRelease.mockResolvedValue({ success: true, releases: [release('a')] });
    api.musicbrainzGetCoverData.mockReturnValue(cover.promise);

    await lookup.search();
    for (const scope of scopes) scope.stop();
    scopes = [];

    cover.resolve({ success: true, data: [1], mime: 'image/jpeg' });
    await Promise.resolve();
    await Promise.resolve();

    expect(lookup.coverThumbs.value).toEqual({});
  });
});
