import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Klient OpenSubtitles: normalizacja wyników, ścieżka pliku obok wideo oraz
// przepływ search/download z zamockowanym transportem HTTP (bez sieci).

const state = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  requests: [] as Array<{ url: string; options?: Record<string, unknown> }>,
  responses: [] as Array<{ status: number; text: string }>,
  keys: [] as Array<{ id: string; service: string; key: string; isActive: boolean }>,
  appVersionThrows: false,
  storeThrows: false,
  nextError: null as unknown
}));

vi.mock('electron', () => ({
  app: {
    getVersion: () => {
      if (state.appVersionThrows) throw new Error('not ready');
      return '9.9.9';
    }
  },
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
      state.handlers.set(channel, fn);
    }
  }
}));

vi.mock('../http-request', () => ({
  httpRequest: async (url: string, options?: Record<string, unknown>) => {
    state.requests.push({ url, options });
    if (state.nextError !== null) {
      const error = state.nextError;
      state.nextError = null;
      throw error;
    }
    const next = state.responses.shift();
    if (!next) throw new Error('no mocked response');
    if (next.status < 200 || next.status >= 300) throw new Error(`HTTP ${next.status}`);
    return { status: next.status, statusText: 'OK', headers: {}, text: next.text };
  }
}));

vi.mock('../cover/cover-cache', () => ({
  getStore: async () => {
    if (state.storeThrows) throw new Error('store locked');
    return { get: () => ({ keys: state.keys }) };
  }
}));

vi.mock('../settings/settings-crypto', () => ({
  decryptApiKeys: (value: unknown) => value
}));

const { registerOpenSubtitlesHandlers, normalizeOsResults, subtitleSidecarPath } =
  await import('../opensubtitles');

function result(fileId: number, language = 'pl', fileName = 'movie.pl.srt') {
  return {
    attributes: {
      language,
      release: 'Movie.2010.1080p.BluRay',
      download_count: 1234,
      ratings: 8.5,
      files: [{ file_id: fileId, file_name: fileName }]
    }
  };
}

afterEach(() => {
  state.keys = [];
  state.requests.length = 0;
  state.responses.length = 0;
  state.appVersionThrows = false;
  state.storeThrows = false;
  state.nextError = null;
});

describe('normalizeOsResults', () => {
  it('flattens valid entries and keeps the first file', () => {
    expect(normalizeOsResults({ data: [result(11)] })).toEqual([
      {
        fileId: 11,
        language: 'pl',
        release: 'Movie.2010.1080p.BluRay',
        downloads: 1234,
        rating: 8.5,
        format: 'srt',
        fileName: 'movie.pl.srt'
      }
    ]);
  });

  it('skips entries without a usable file id', () => {
    expect(normalizeOsResults({ data: [{ attributes: { files: [] } }, { nope: true }] })).toEqual(
      []
    );
    expect(normalizeOsResults(null)).toEqual([]);
    expect(normalizeOsResults({ data: 'nope' })).toEqual([]);
  });

  it('falls back to srt for unknown extensions', () => {
    const [r] = normalizeOsResults({ data: [result(1, 'en', 'x.unknown')] });
    expect(r.format).toBe('srt');
  });
});

describe('subtitleSidecarPath', () => {
  it('builds <base>.<lang>.<ext> next to the video', () => {
    const out = subtitleSidecarPath(join('C:', 'media', 'Movie.mkv'), 'pl', 'srt');
    expect(out).toBe(join('C:', 'media', 'Movie.pl.srt'));
  });

  it('sanitizes the language and falls back to srt/und', () => {
    expect(subtitleSidecarPath(join('C:', 'media', 'Movie.mkv'), 'p/l', 'srt')).toBe(
      join('C:', 'media', 'Movie.pl.srt')
    );
    expect(subtitleSidecarPath(join('C:', 'media', 'Movie.mkv'), '///', 'exe')).toBe(
      join('C:', 'media', 'Movie.und.srt')
    );
  });
});

describe('opensubtitles handlers', () => {
  beforeEach(() => {
    state.handlers.clear();
    registerOpenSubtitlesHandlers();
  });

  it('reports a missing API key without any request', async () => {
    const search = state.handlers.get('opensubtitles:search')!;
    await expect(search({}, { query: 'Movie' })).resolves.toEqual({
      success: false,
      results: [],
      error: 'missing-api-key'
    });
    expect(state.requests).toHaveLength(0);
  });

  it('searches with the key header and returns normalized results', async () => {
    state.keys = [{ id: 'k1', service: 'opensubtitles', key: 'secret', isActive: true }];
    state.responses = [{ status: 200, text: JSON.stringify({ data: [result(7)] }) }];

    const search = state.handlers.get('opensubtitles:search')!;
    const res = (await search({}, { query: 'Movie', languages: 'pl' })) as {
      success: boolean;
      results: unknown[];
    };
    expect(res.success).toBe(true);
    expect(res.results).toHaveLength(1);
    const headers = state.requests[0].options?.headers as Record<string, string>;
    expect(headers['Api-Key']).toBe('secret');
    expect(state.requests[0].url).toContain('/subtitles?');
    expect(state.requests[0].url).toContain('query=Movie');
  });

  it('maps 429 to a rate-limit error', async () => {
    state.keys = [{ id: 'k1', service: 'opensubtitles', key: 'secret', isActive: true }];
    state.responses = [{ status: 429, text: '' }];
    const search = state.handlers.get('opensubtitles:search')!;
    await expect(search({}, { query: 'Movie' })).resolves.toEqual({
      success: false,
      results: [],
      error: 'rate-limit'
    });
  });

  it('downloads via file_id and writes the sidecar next to the video', async () => {
    state.keys = [{ id: 'k1', service: 'opensubtitles', key: 'secret', isActive: true }];
    const dir = mkdtempSync(join(tmpdir(), 'onda-os-'));
    const video = join(dir, 'Movie.mkv');
    try {
      state.responses = [
        { status: 200, text: JSON.stringify({ link: 'https://dl/x', file_name: 'sub.pl.srt' }) },
        { status: 200, text: '1\n00:00:01,000 --> 00:00:02,000\nHi\n' }
      ];
      const download = state.handlers.get('opensubtitles:download')!;
      const res = (await download({}, { fileId: 7, videoPath: video, language: 'pl' })) as {
        success: boolean;
        path?: string;
      };
      expect(res.success).toBe(true);
      expect(res.path).toBe(join(dir, 'Movie.pl.srt'));
      expect(existsSync(res.path!)).toBe(true);
      expect(readFileSync(res.path!, 'utf-8')).toContain('Hi');
      expect(state.requests[1].url).toBe('https://dl/x');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('normalizes defensively across malformed entries', () => {
    const results = normalizeOsResults({
      data: [
        { attributes: null },
        { attributes: { files: 'x' } },
        { attributes: { files: [{ file_id: '7' }] } },
        { attributes: { files: [{ file_id: 5, file_name: 'noext' }] } },
        {
          attributes: {
            files: [{ file_id: 6, file_name: '' }],
            language: 3,
            release: '',
            download_count: 'many',
            ratings: 'high'
          }
        }
      ]
    });

    expect(results).toEqual([
      {
        fileId: 5,
        language: '',
        release: 'noext',
        downloads: 0,
        rating: 0,
        format: 'srt',
        fileName: 'noext'
      },
      {
        fileId: 6,
        language: '',
        release: '—',
        downloads: 0,
        rating: 0,
        format: 'srt',
        fileName: ''
      }
    ]);
  });

  it('rejects an empty search query after resolving the key', async () => {
    state.keys = [{ id: 'k1', service: 'opensubtitles', key: 'secret', isActive: true }];
    const search = state.handlers.get('opensubtitles:search')!;

    await expect(search({}, { query: '   ' })).resolves.toEqual({
      success: false,
      results: [],
      error: 'missing-query'
    });
  });

  it('forwards season/episode/year/languages and survives invalid JSON', async () => {
    state.keys = [{ id: 'k1', service: 'opensubtitles', key: 'secret', isActive: true }];
    state.responses = [{ status: 200, text: 'not-json' }];
    const search = state.handlers.get('opensubtitles:search')!;

    const res = (await search(
      {},
      {
        query: 'Movie',
        languages: 'pl',
        season: 2,
        episode: 3,
        year: 2020
      }
    )) as { success: boolean; error?: string };

    expect(res.success).toBe(false);
    expect(res.error).toBeTruthy();
    const url = state.requests[0].url;
    expect(url).toContain('languages=pl');
    expect(url).toContain('season_number=2');
    expect(url).toContain('episode_number=3');
    expect(url).toContain('year=2020');
  });

  it('reports a failing settings store as a missing key', async () => {
    state.storeThrows = true;
    const search = state.handlers.get('opensubtitles:search')!;

    await expect(search({}, { query: 'Movie' })).resolves.toEqual({
      success: false,
      results: [],
      error: 'missing-api-key'
    });
  });

  it('maps auth failures to missing-api-key', async () => {
    state.keys = [{ id: 'k1', service: 'opensubtitles', key: 'secret', isActive: true }];
    state.responses = [{ status: 401, text: '' }];
    const search = state.handlers.get('opensubtitles:search')!;

    await expect(search({}, { query: 'Movie' })).resolves.toEqual({
      success: false,
      results: [],
      error: 'missing-api-key'
    });
  });

  it('validates download ids and requires a link', async () => {
    const download = state.handlers.get('opensubtitles:download')!;
    await expect(download({}, { fileId: 7 })).resolves.toEqual({
      success: false,
      error: 'missing-api-key'
    });

    state.keys = [{ id: 'k1', service: 'opensubtitles', key: 'secret', isActive: true }];
    await expect(download({}, { fileId: 0 })).resolves.toEqual({
      success: false,
      error: 'invalid-file-id'
    });
    await expect(download({}, { fileId: 'x' as never })).resolves.toEqual({
      success: false,
      error: 'invalid-file-id'
    });

    state.responses = [{ status: 200, text: JSON.stringify({}) }];
    await expect(download({}, { fileId: 7 })).resolves.toEqual({
      success: false,
      error: 'no-download-link'
    });
  });

  it('returns subtitle content when no writable video path is given', async () => {
    state.keys = [{ id: 'k1', service: 'opensubtitles', key: 'secret', isActive: true }];
    state.responses = [
      { status: 200, text: JSON.stringify({ link: 'https://dl/x' }) },
      { status: 200, text: 'subtitle body' }
    ];
    const download = state.handlers.get('opensubtitles:download')!;

    await expect(download({}, { fileId: 7 })).resolves.toEqual({
      success: true,
      content: 'subtitle body',
      format: 'srt'
    });

    state.responses = [
      { status: 200, text: JSON.stringify({ link: 'https://dl/x' }) },
      { status: 200, text: 'subtitle body' }
    ];
    await expect(download({}, { fileId: 7, videoPath: 'relative.mkv' })).resolves.toMatchObject({
      success: true,
      content: 'subtitle body'
    });
  });

  it('reports a write failure for an unusable target path', async () => {
    state.keys = [{ id: 'k1', service: 'opensubtitles', key: 'secret', isActive: true }];
    const dir = mkdtempSync(join(tmpdir(), 'onda-os-'));
    const video = join(dir, 'Movie.mkv');
    mkdirSync(join(dir, 'Movie.pl.srt'), { recursive: true });
    try {
      state.responses = [
        { status: 200, text: JSON.stringify({ link: 'https://dl/x', file_name: 'x.srt' }) },
        { status: 200, text: 'body' }
      ];
      const download = state.handlers.get('opensubtitles:download')!;

      const res = (await download({}, { fileId: 7, videoPath: video, language: 'pl' })) as {
        success: boolean;
        error?: string;
      };
      expect(res.success).toBe(false);
      expect(res.error).toBeTruthy();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('falls back to a default app version when electron is not ready', async () => {
    vi.resetModules();
    state.appVersionThrows = true;
    state.keys = [{ id: 'k1', service: 'opensubtitles', key: 'secret', isActive: true }];
    state.handlers.clear();
    state.responses = [{ status: 200, text: '{"data":[]}' }];
    const fresh = await import('../opensubtitles');
    fresh.registerOpenSubtitlesHandlers();

    const search = state.handlers.get('opensubtitles:search')!;
    await search({}, { query: 'Movie' });

    const headers = state.requests[0]!.options?.headers as Record<string, string>;
    expect(headers['User-Agent']).toBe('Onda v0.8.0');
  });

  it('normalizes a non-string file name and missing language', () => {
    const [r] = normalizeOsResults({
      data: [{ attributes: { files: [{ file_id: 9, file_name: 42 }], language: 'pl' } }]
    });

    expect(r).toMatchObject({ fileName: '', release: '—', format: 'srt' });
    expect(subtitleSidecarPath(join('C:', 'm', 'Movie.mkv'), '', 'srt')).toBe(
      join('C:', 'm', 'Movie.und.srt')
    );
  });

  it('keeps the string error for non-Error failures', async () => {
    state.keys = [{ id: 'k1', service: 'opensubtitles', key: 'secret', isActive: true }];
    state.nextError = 'plain failure';
    const search = state.handlers.get('opensubtitles:search')!;

    await expect(search({}, { query: 'Movie' })).resolves.toEqual({
      success: false,
      results: [],
      error: 'plain failure'
    });
  });

  it('treats a non-string query as missing', async () => {
    state.keys = [{ id: 'k1', service: 'opensubtitles', key: 'secret', isActive: true }];
    const search = state.handlers.get('opensubtitles:search')!;

    await expect(search({}, { query: 5 as never })).resolves.toEqual({
      success: false,
      results: [],
      error: 'missing-query'
    });
  });

  it('writes an und sidecar when no language is supplied and defaults an empty name', async () => {
    state.keys = [{ id: 'k1', service: 'opensubtitles', key: 'secret', isActive: true }];
    const dir = mkdtempSync(join(tmpdir(), 'onda-os-'));
    const video = join(dir, 'Movie.mkv');
    try {
      state.responses = [
        { status: 200, text: JSON.stringify({ link: 'https://dl/x', file_name: '' }) },
        { status: 200, text: 'body' }
      ];
      const download = state.handlers.get('opensubtitles:download')!;

      const res = (await download({}, { fileId: 7, videoPath: video })) as {
        success: boolean;
        path?: string;
        format?: string;
      };
      expect(res).toMatchObject({ success: true, format: 'srt' });
      expect(res.path).toBe(join(dir, 'Movie.und.srt'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
