import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildZip } from '../../utils/__tests__/zip-builder';

// AnimeSub: parser wyników (na realnym kształcie HTML), numer odcinka, wybór pliku
// z archiwum oraz przepływ search → download z zamockowanym transportem HTTP.

const state = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  responses: [] as Array<{ status: number; text: string; setCookie?: string }>,
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
    const headers: Record<string, string[]> = {};
    if (next.setCookie) headers['set-cookie'] = [next.setCookie];
    return { status: next.status, statusText: 'OK', headers, text: next.text };
  }
}));

const { parseAnimeSubResults, episodeNumber, pickEpisodeFile, registerAnimeSubHandlers } =
  await import('../animesub');

// Realny kształt tabeli: wpis to wiersze `tr.KNap` + `tr.KKom` z formularzem pobierania.
const SEARCH_HTML = `
<table class="Napisy">
 <tr class="KNap"><td align="left" width="45%">Fate/Apocrypha ep07</td><td>2020.01.01</td><td>&nbsp;</td><td>Advanced SSA</td></tr>
 <tr class="KNap"><td align="left">Fate/Apocrypha ep07</td><td><a href="osoba.php?id=1">~ktos</a></td><td>bar</td><td>210kB</td></tr>
 <tr class="KNap"><td align="left">Fate/Apocrypha ep07</td><td><a href="javascript:PK(1)" class="ko">(2)</a></td><td></td><td>282 razy</td></tr>
 <tr class="KKom"><td valign="top" align="right">
   <form method="POST" action="sciagnij.php">
     <input type="hidden" name="id" value="79188"><input type="hidden" name="sh" value="abcdef0123456789">
     <input type="submit" value="Pobierz napisy" name="single_file">
   </form></td><td colspan=3>ID 79188</td></tr>
 <tr class="KNap"><td align="left">Bayonetta: Bloody Fate</td><td>2014.05.05</td><td></td><td>ASS</td></tr>
 <tr class="KKom"><td valign="top" align="right">
   <form method="POST" action="sciagnij.php">
     <input type="hidden" name="id" value="40360"><input type="hidden" name="sh" value="00ffeeddccbbaa99">
     <input type="submit" value="Pobierz napisy" name="single_file">
   </form></td><td colspan=3>ID 40360</td></tr>
</table>`;

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'onda-anime-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe('parseAnimeSubResults', () => {
  it('takes one entry per download form and its last KNap title', () => {
    expect(parseAnimeSubResults(SEARCH_HTML)).toEqual([
      { id: '79188', sh: 'abcdef0123456789', title: 'Fate/Apocrypha ep07', language: 'pl' },
      { id: '40360', sh: '00ffeeddccbbaa99', title: 'Bayonetta: Bloody Fate', language: 'pl' }
    ]);
  });

  it('returns nothing when there are no download forms', () => {
    expect(parseAnimeSubResults('<html><body>brak</body></html>')).toEqual([]);
  });
});

describe('episodeNumber', () => {
  it('reads SxxExx, ep/N and a bare number', () => {
    expect(episodeNumber('Show.S01E07.1080p.mkv')).toBe(7);
    expect(episodeNumber('Fate Apocrypha ep12.mkv')).toBe(12);
    expect(episodeNumber('Shrek 2 (2004).mkv')).toBe(2);
  });

  it('ignores years and resolutions', () => {
    expect(episodeNumber('Movie.2019.1080p.mkv')).toBeNull();
    expect(episodeNumber('sample.webm')).toBeNull();
  });
});

describe('pickEpisodeFile', () => {
  const files = [
    { name: '[S] Show - 01 (1080p).ass' },
    { name: '[S] Show - 07 (1080p).ass' },
    { name: '[S] Show - 12 (1080p).ass' }
  ];

  it('matches the episode from the video name', () => {
    expect(pickEpisodeFile(files, 'Show.S01E07.1080p.mkv')?.name).toContain('- 07 ');
  });

  it('falls back to the first file when the episode cannot be matched', () => {
    expect(pickEpisodeFile(files, 'sample.webm')?.name).toContain('- 01 ');
    expect(pickEpisodeFile(files, 'Show.S01E99.mkv')?.name).toContain('- 01 ');
    expect(pickEpisodeFile([], 'x.mkv')).toBeNull();
  });
});

describe('animesub handlers', () => {
  beforeEach(() => {
    state.handlers.clear();
    state.responses.length = 0;
    state.requests.length = 0;
    registerAnimeSubHandlers();
  });

  it('search keeps the session cookie and returns parsed results', async () => {
    state.responses = [
      { status: 200, text: SEARCH_HTML, setCookie: 'ansi_sciagnij=abc123; path=/' }
    ];
    const search = state.handlers.get('animesub:search')!;
    const res = (await search({}, { query: 'fate' })) as { success: boolean; results: unknown[] };
    expect(res.success).toBe(true);
    expect(res.results).toHaveLength(2);
    expect(state.requests[0].url).toContain('wyslane=1');
    expect(state.requests[0].url).toContain('szukane=fate');
    // Krótki timeout — scalona wyszukiwarka nie może czekać 20 s na wolny serwis.
    expect(state.requests[0].options?.timeoutMs).toBe(8000);
  });

  it('rejects a download with missing parameters', async () => {
    const download = state.handlers.get('animesub:download')!;
    await expect(download({}, { id: '', sh: '', videoPath: 'C:\\v\\m.mkv' })).resolves.toEqual({
      success: false,
      error: 'invalid-request'
    });
  });

  it('downloads the zip, picks the episode and saves <base>.pl.ass', async () => {
    const dir = tempDir();
    const video = join(dir, 'Show.S01E07.1080p.mkv');
    writeFileSync(video, Buffer.from('x'));

    const zip = buildZip([
      {
        name: '[S] Show - 01 (1080p).ass',
        content: Buffer.from('[Script Info]\nA'),
        deflate: true
      },
      { name: '[S] Show - 07 (1080p).ass', content: Buffer.from('[Script Info]\nB'), deflate: true }
    ]);

    state.responses = [
      { status: 200, text: SEARCH_HTML, setCookie: 'ansi_sciagnij=abc123; path=/' },
      { status: 200, text: zip.toString('latin1') }
    ];

    const search = state.handlers.get('animesub:search')!;
    await search({}, { query: 'fate' });
    const download = state.handlers.get('animesub:download')!;
    const res = (await download({}, { id: '79188', sh: 'abcdef0123456789', videoPath: video })) as {
      success: boolean;
      path?: string;
    };

    expect(res.success).toBe(true);
    expect(res.path).toBe(join(dir, 'Show.S01E07.1080p.pl.ass'));
    expect(existsSync(res.path!)).toBe(true);
    expect(readFileSync(res.path!, 'utf-8')).toContain('B');
    const post = state.requests[1];
    expect(post.options?.method).toBe('POST');
    expect(String((post.options?.headers as Record<string, string>).Cookie)).toContain(
      'ansi_sciagnij=abc123'
    );
  });

  it('refuses to download when no search established a session', async () => {
    // Świeży moduł (bez cookie z wyszukiwania) — pobranie musi odmówić, nie udawać sukces.
    vi.resetModules();
    const fresh = await import('../animesub');
    state.handlers.clear();
    fresh.registerAnimeSubHandlers();

    const dir = tempDir();
    const video = join(dir, 'm.mkv');
    writeFileSync(video, Buffer.from('x'));
    const download = state.handlers.get('animesub:download')!;
    await expect(download({}, { id: '79188', sh: 'abcdef', videoPath: video })).resolves.toEqual({
      success: false,
      error: 'no-session'
    });
  });
});
