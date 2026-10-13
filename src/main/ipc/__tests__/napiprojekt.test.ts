import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// NapiProjekt: hash = MD5 pierwszych 10 MB, subhash wyprowadzony z hasha, format
// `[start][end]treść` → SRT. Wektory i kształt odpowiedzi zweryfikowane na żywo.

const state = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  responses: [] as Array<{ status: number; text: string }>,
  requests: [] as Array<{ url: string; options?: Record<string, unknown> }>
}));

vi.mock('electron', () => ({
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

const { napiprojektHash, napiprojektSubhash, parseNapiSubtitles, registerNapiProjektHandlers } =
  await import('../napiprojekt');

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'onda-napi-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe('napiprojektSubhash', () => {
  it('matches the known vector', () => {
    expect(napiprojektSubhash('36ac9192a26b87524021c9bab9fa2085')).toBe('2ebcc');
  });
});

describe('napiprojektHash', () => {
  it('is the md5 of the file contents (up to 10 MB)', async () => {
    const dir = tempDir();
    const file = join(dir, 'movie.mkv');
    const bytes = Buffer.from('abcdef');
    writeFileSync(file, bytes);
    const expected = createHash('md5').update(bytes).digest('hex');
    await expect(napiprojektHash(file)).resolves.toBe(expected);
  });
});

describe('parseNapiSubtitles', () => {
  it('converts [start][end] lines (| = newline) into SRT', () => {
    const srt = parseNapiSubtitles('[952][1001]- A.|- B.\n[3600000][3602500]C');
    expect(srt).toBe(
      '1\n00:00:00,952 --> 00:00:01,001\n- A.\n- B.\n\n' + '2\n01:00:00,000 --> 01:00:02,500\nC\n'
    );
  });

  it('ignores lines that do not match the format', () => {
    expect(parseNapiSubtitles('garbage\n\n[10][20]ok')).toContain('00:00:00,010 --> 00:00:00,020');
  });
});

describe('napiprojekt:download', () => {
  beforeEach(() => {
    state.handlers.clear();
    state.responses.length = 0;
    state.requests.length = 0;
    registerNapiProjektHandlers();
  });

  it('check reports found without writing a file', async () => {
    const dir = tempDir();
    const file = join(dir, 'Movie.mkv');
    writeFileSync(file, Buffer.from('x'));
    state.responses = [{ status: 200, text: '[10][20]ok' }];

    const check = state.handlers.get('napiprojekt:check')!;
    await expect(check({}, { videoPath: file })).resolves.toEqual({ found: true });
    expect(existsSync(join(dir, 'Movie.pl.srt'))).toBe(false);
  });

  it('check reports not-found on the NPc0 marker', async () => {
    const dir = tempDir();
    const file = join(dir, 'Movie.mkv');
    writeFileSync(file, Buffer.from('x'));
    state.responses = [{ status: 200, text: 'NPc0' }];

    const check = state.handlers.get('napiprojekt:check')!;
    await expect(check({}, { videoPath: file })).resolves.toEqual({
      found: false,
      error: 'not-found'
    });
  });

  it('reports not-found on the NPc0 marker', async () => {
    const dir = tempDir();
    const file = join(dir, 'movie.mkv');
    writeFileSync(file, Buffer.from('x'));
    state.responses = [{ status: 200, text: 'NPc0' }];

    const download = state.handlers.get('napiprojekt:download')!;
    await expect(download({}, { videoPath: file })).resolves.toEqual({
      success: false,
      error: 'not-found'
    });
  });

  it('saves a CP1250-decoded .pl.srt next to the video', async () => {
    const dir = tempDir();
    const file = join(dir, 'Movie.mkv');
    writeFileSync(file, Buffer.from('x'));
    // 0xBF to 'ż' w CP1250; transport odczytuje bajty jako latin1.
    state.responses = [{ status: 200, text: `[952][1001]${String.fromCharCode(0xbf)}` }];

    const download = state.handlers.get('napiprojekt:download')!;
    const res = (await download({}, { videoPath: file })) as { success: boolean; path?: string };
    expect(res.success).toBe(true);
    expect(res.path).toBe(join(dir, 'Movie.pl.srt'));
    expect(existsSync(res.path!)).toBe(true);
    expect(readFileSync(res.path!, 'utf-8')).toContain('ż');
    expect(state.requests[0].url).toContain('napiprojekt.pl/unit_napisy/dl.php');
    expect(state.requests[0].url).toContain('v=dreambox');
    expect(state.requests[0].options?.encoding).toBe('latin1');
  });

  it('rejects a non-absolute video path without a request', async () => {
    const download = state.handlers.get('napiprojekt:download')!;
    await expect(download({}, { videoPath: 'relative.mkv' })).resolves.toEqual({
      success: false,
      error: 'missing-file'
    });
    expect(state.requests).toHaveLength(0);
  });
});
