import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Klient OpenSubtitles: normalizacja wyników, ścieżka pliku obok wideo oraz
// przepływ search/download z zamockowanym transportem HTTP (bez sieci).

const state = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  requests: [] as Array<{ url: string; options?: Record<string, unknown> }>,
  responses: [] as Array<{ status: number; text: string }>,
  keys: [] as Array<{ id: string; service: string; key: string; isActive: boolean }>
}));

vi.mock('electron', () => ({
  app: { getVersion: () => '9.9.9' },
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
      state.handlers.set(channel, fn);
    }
  }
}));

vi.mock('../http-request', () => ({
  httpRequest: async (url: string, options?: Record<string, unknown>) => {
    state.requests.push({ url, options });
    const next = state.responses.shift();
    if (!next) throw new Error('no mocked response');
    if (next.status < 200 || next.status >= 300) throw new Error(`HTTP ${next.status}`);
    return { status: next.status, statusText: 'OK', headers: {}, text: next.text };
  }
}));

vi.mock('../cover/cover-cache', () => ({
  getStore: async () => ({ get: () => ({ keys: state.keys }) })
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
});
