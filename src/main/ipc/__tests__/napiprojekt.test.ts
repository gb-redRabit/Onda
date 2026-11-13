import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// NapiProjekt: hash = MD5 pierwszych 10 MB, subhash wyprowadzony z hasha, format
// `[start][end]treść` → SRT. Wektory i kształt odpowiedzi zweryfikowane na żywo.

const state = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  responses: [] as Array<{ status: number; text: string }>,
  requests: [] as Array<{ url: string; options?: Record<string, unknown> }>,
  nextError: null as Error | null,
  writeFile: { fn: vi.fn(), real: null as unknown as (...args: unknown[]) => Promise<void> }
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
    if (state.nextError) {
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
vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  state.writeFile.real = actual.writeFile as unknown as (...args: unknown[]) => Promise<void>;
  return { ...actual, writeFile: (...args: unknown[]) => state.writeFile.fn(...args) };
});

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
    state.writeFile.fn
      .mockReset()
      .mockImplementation((...args: unknown[]) => state.writeFile.real(...args));
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

  it('skips empty cue bodies', () => {
    expect(parseNapiSubtitles('[1][2]   \n[3][4]ok')).not.toContain('   ');
  });

  it('falls back to latin1 when the CP1250 decoder is unavailable', async () => {
    const dir = tempDir();
    const file = join(dir, 'Movie.mkv');
    writeFileSync(file, Buffer.from('x'));
    state.responses = [{ status: 200, text: `[10][20]${String.fromCharCode(0xbf)}` }];
    const decode = vi.fn(() => {
      throw new Error('decoder missing');
    });
    vi.stubGlobal(
      'TextDecoder',
      class {
        decode = decode;
      }
    );
    try {
      const download = state.handlers.get('napiprojekt:download')!;
      const res = (await download({}, { videoPath: file })) as { success: boolean };
      expect(res.success).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('reports a missing file when hashing fails', async () => {
    const dir = tempDir();
    const download = state.handlers.get('napiprojekt:download')!;

    await expect(download({}, { videoPath: join(dir, 'missing.mkv') })).resolves.toEqual({
      success: false,
      error: 'missing-file'
    });
    expect(state.requests).toHaveLength(0);
  });

  it('reports not-found when the response has no usable cues', async () => {
    const dir = tempDir();
    const file = join(dir, 'Movie.mkv');
    writeFileSync(file, Buffer.from('x'));
    state.responses = [{ status: 200, text: 'not subtitle data' }];

    const download = state.handlers.get('napiprojekt:download')!;
    await expect(download({}, { videoPath: file })).resolves.toEqual({
      success: false,
      error: 'not-found'
    });
  });

  it('maps rate limits, HTTP errors and unexpected failures', async () => {
    const dir = tempDir();
    const file = join(dir, 'Movie.mkv');
    writeFileSync(file, Buffer.from('x'));
    const download = state.handlers.get('napiprojekt:download')!;

    state.responses = [{ status: 429, text: '' }];
    await expect(download({}, { videoPath: file })).resolves.toEqual({
      success: false,
      error: 'rate-limit'
    });

    state.responses = [{ status: 500, text: '' }];
    await expect(download({}, { videoPath: file })).resolves.toEqual({
      success: false,
      error: 'network'
    });

    state.nextError = new Error('boom');
    await expect(download({}, { videoPath: file })).resolves.toEqual({
      success: false,
      error: 'boom'
    });
  });

  it('caches found and not-found checks for the same file', async () => {
    const dir = tempDir();
    const foundFile = join(dir, 'Found.mkv');
    const missingFile = join(dir, 'Missing.mkv');
    writeFileSync(foundFile, Buffer.from('x'));
    writeFileSync(missingFile, Buffer.from('x'));
    const check = state.handlers.get('napiprojekt:check')!;

    state.responses = [{ status: 200, text: '[10][20]ok' }];
    await expect(check({}, { videoPath: foundFile })).resolves.toEqual({ found: true });
    await expect(check({}, { videoPath: foundFile })).resolves.toEqual({ found: true });

    state.responses = [{ status: 200, text: 'NPc0' }];
    await expect(check({}, { videoPath: missingFile })).resolves.toEqual({
      found: false,
      error: 'not-found'
    });
    await expect(check({}, { videoPath: missingFile })).resolves.toMatchObject({
      found: false
    });

    expect(state.requests).toHaveLength(2);
  });

  it('handles missing params in both handlers', async () => {
    const check = state.handlers.get('napiprojekt:check')!;
    const download = state.handlers.get('napiprojekt:download')!;

    await expect(check({}, {})).resolves.toEqual({ found: false, error: 'missing-file' });
    await expect(download({}, {})).resolves.toEqual({
      success: false,
      error: 'missing-file'
    });
  });

  it('returns the save failure message when the target cannot be written', async () => {
    const dir = tempDir();
    const file = join(dir, 'Movie.mkv');
    writeFileSync(file, Buffer.from('x'));
    mkdirSync(join(dir, 'Movie.pl.srt'), { recursive: true });
    state.responses = [{ status: 200, text: '[10][20]ok' }];

    const download = state.handlers.get('napiprojekt:download')!;
    const res = (await download({}, { videoPath: file })) as { success: boolean; error?: string };

    expect(res.success).toBe(false);
    expect(res.error).toBeTruthy();
  });

  it('stringifies a non-Error write failure', async () => {
    const dir = tempDir();
    const file = join(dir, 'Movie.mkv');
    writeFileSync(file, Buffer.from('x'));
    state.responses = [{ status: 200, text: '[10][20]ok' }];
    state.writeFile.fn.mockRejectedValueOnce('plain failure');

    const download = state.handlers.get('napiprojekt:download')!;
    await expect(download({}, { videoPath: file })).resolves.toEqual({
      success: false,
      error: 'plain failure'
    });
  });

  it('keeps the check cache bounded', async () => {
    const dir = tempDir();
    const check = state.handlers.get('napiprojekt:check')!;
    state.responses = Array.from({ length: 201 }, () => ({ status: 200, text: '[10][20]ok' }));

    for (let i = 0; i < 201; i++) {
      const file = join(dir, `movie-${i}.mkv`);
      writeFileSync(file, Buffer.from('x'));
      await check({}, { videoPath: file });
    }

    state.responses = [{ status: 200, text: '[10][20]ok' }];
    const first = join(dir, 'movie-0.mkv');
    await expect(check({}, { videoPath: first })).resolves.toEqual({ found: true });
    expect(state.requests).toHaveLength(202);
  });
});
