import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  loggerInfo: vi.fn()
}));

vi.mock('@renderer/i18n', () => ({
  i18n: { global: { t: (key: string, params?: { label?: string }) => `${key}:${params?.label}` } }
}));
vi.mock('@shared/logger', () => ({
  logger: { info: h.loggerInfo, warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import { usePlayerSubtitles } from '../player-subtitles';

const findExternal = vi.mocked(window.api.findExternalSubtitles);
const readFile = vi.mocked(window.api.readSubtitleFile);
const listEmbedded = vi.mocked(window.api.listEmbeddedSubtitles);
const extractEmbedded = vi.mocked(window.api.extractEmbeddedSubtitle);
const extractFonts = vi.mocked(window.api.extractSubtitleFonts);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  findExternal.mockReset().mockResolvedValue([]);
  readFile.mockReset().mockResolvedValue(null);
  listEmbedded.mockReset().mockResolvedValue([]);
  extractEmbedded.mockReset().mockResolvedValue(null);
  extractFonts.mockReset().mockResolvedValue([]);
  h.loggerInfo.mockClear();
});

describe('loadSubtitles', () => {
  it('collects external and embedded tracks and selects the first embedded one', async () => {
    findExternal.mockResolvedValue([
      { path: '/subs/movie.PL.srt', name: 'movie.PL.srt', format: 'srt' }
    ] as never);
    readFile.mockResolvedValue('external content');
    listEmbedded.mockResolvedValue([
      { index: 2, title: 'Polski', language: 'pl' },
      { index: 3, language: 'en' },
      { index: 4 }
    ] as never);
    const { subtitleTracks, activeSubtitleId, loadSubtitles } = usePlayerSubtitles();

    await loadSubtitles('/video.mkv');

    expect(subtitleTracks.value).toEqual([
      {
        id: 'ext-/subs/movie.PL.srt',
        label: 'movie.PL.srt',
        language: 'PL',
        format: 'srt',
        source: 'external',
        filePath: '/subs/movie.PL.srt',
        content: 'external content'
      },
      expect.objectContaining({
        id: 'emb-2',
        label: 'player.embeddedSubtitle:Polski',
        language: 'pl',
        format: 'ass',
        source: 'embedded'
      }),
      expect.objectContaining({ id: 'emb-3', label: 'player.embeddedSubtitle:en' }),
      expect.objectContaining({ id: 'emb-4', label: 'player.embeddedSubtitle:Track 4' })
    ]);
    expect(activeSubtitleId.value).toBe('emb-2');
  });

  it('defaults an external language without a suffix and skips missing content', async () => {
    findExternal.mockResolvedValue([
      { path: '/subs/movie', name: 'movie', format: 'srt' },
      { path: '/subs/skip.srt', name: 'skip.srt', format: 'srt' }
    ] as never);
    readFile.mockImplementation(async (path: string) =>
      path.endsWith('skip.srt') ? null : 'content'
    );
    const { subtitleTracks, activeSubtitleId, loadSubtitles } = usePlayerSubtitles();

    await loadSubtitles('/video.mkv');

    expect(subtitleTracks.value).toHaveLength(1);
    expect(subtitleTracks.value[0].language).toBe('pl');
    expect(activeSubtitleId.value).toBeNull();
  });

  it('keeps the previous subtitle when it still exists', async () => {
    findExternal.mockResolvedValue([]);
    listEmbedded.mockResolvedValue([{ index: 1, title: 'One' }] as never);
    const { activeSubtitleId, loadSubtitles, setActiveSubtitle } = usePlayerSubtitles();
    await loadSubtitles('/video.mkv');
    setActiveSubtitle('emb-1');

    await loadSubtitles('/video2.mkv');

    expect(activeSubtitleId.value).toBe('emb-1');
  });

  it('drops a stale load that finishes after a newer one', async () => {
    const slowExternal = deferred<never[]>();
    findExternal.mockReturnValueOnce(slowExternal.promise as never);
    findExternal.mockResolvedValueOnce([]);
    listEmbedded.mockResolvedValue([{ index: 9, title: 'New' }] as never);
    const { subtitleTracks, loadSubtitles } = usePlayerSubtitles();

    const first = loadSubtitles('/old.mkv');
    await loadSubtitles('/new.mkv');
    slowExternal.resolve([]);
    await first;

    expect(subtitleTracks.value.map((track) => track.id)).toEqual(['emb-9']);
  });

  it('drops a stale load while reading an external file', async () => {
    const slowRead = deferred<string | null>();
    findExternal.mockResolvedValue([
      { path: '/subs/a.srt', name: 'a.srt', format: 'srt' }
    ] as never);
    readFile.mockReturnValueOnce(slowRead.promise as never);
    const { subtitleTracks, loadSubtitles, clearSubtitles } = usePlayerSubtitles();

    const pending = loadSubtitles('/video.mkv');
    await Promise.resolve();
    clearSubtitles();
    slowRead.resolve('content');
    await pending;

    expect(subtitleTracks.value).toEqual([]);
  });

  it('drops a stale load while listing embedded subtitles', async () => {
    const slowEmbedded = deferred<never[]>();
    listEmbedded.mockReturnValueOnce(slowEmbedded.promise as never);
    const { subtitleTracks, loadSubtitles, clearSubtitles } = usePlayerSubtitles();

    const pending = loadSubtitles('/video.mkv');
    await Promise.resolve();
    clearSubtitles();
    slowEmbedded.resolve([{ index: 1, title: 'One' }] as never);
    await pending;

    expect(subtitleTracks.value).toEqual([]);
  });

  it('does not restore tracks cleared during an in-flight load', async () => {
    const slowExternal = deferred<never[]>();
    findExternal.mockReturnValueOnce(slowExternal.promise as never);
    listEmbedded.mockResolvedValue([{ index: 1, title: 'One' }] as never);
    const { subtitleTracks, loadSubtitles, clearSubtitles } = usePlayerSubtitles();

    const pending = loadSubtitles('/video.mkv');
    clearSubtitles();
    slowExternal.resolve([]);
    await pending;

    expect(subtitleTracks.value).toEqual([]);
  });
});

describe('loadEmbeddedSubtitle', () => {
  it('rejects non-embedded track ids', async () => {
    const { loadEmbeddedSubtitle } = usePlayerSubtitles();

    await expect(loadEmbeddedSubtitle('ext-file.srt', '/video.mkv')).resolves.toBeNull();
    expect(extractEmbedded).not.toHaveBeenCalled();
  });

  it('extracts the track and fonts and logs the result', async () => {
    extractEmbedded.mockResolvedValue({ content: 'Dialogue', format: 'ass' } as never);
    extractFonts.mockResolvedValue([{ name: 'Arial' }, { name: 'Times' }] as never);
    const { loadEmbeddedSubtitle } = usePlayerSubtitles();

    await expect(loadEmbeddedSubtitle('emb-3', '/video.mkv')).resolves.toEqual({
      content: 'Dialogue',
      format: 'ass',
      fonts: [{ name: 'Arial' }, { name: 'Times' }]
    });

    expect(extractEmbedded).toHaveBeenCalledWith('/video.mkv', 3);
    expect(extractFonts).toHaveBeenCalledWith('/video.mkv');
    expect(h.loggerInfo).toHaveBeenCalledWith(
      'Subtitles',
      'loadEmbedded: format=ass fonts=2 fontNames=[Arial, Times]'
    );
  });

  it('returns null when extraction yields nothing', async () => {
    const { loadEmbeddedSubtitle } = usePlayerSubtitles();

    await expect(loadEmbeddedSubtitle('emb-1', '/video.mkv')).resolves.toBeNull();
    expect(h.loggerInfo).not.toHaveBeenCalled();
  });
});

describe('custom subtitles', () => {
  it('adds files with inferred formats and selects the last one', async () => {
    readFile.mockImplementation(async (path: string) => `content:${path}`);
    const { subtitleTracks, activeSubtitleId, loadCustomSubtitles } = usePlayerSubtitles();

    const added = await loadCustomSubtitles([
      '/subs/First.SRT',
      'C:\\subs\\Second.ass',
      '/subs/Third.unknown',
      '/subs/Missing.vtt'
    ]);

    expect(added).toBe(4);
    expect(subtitleTracks.value.map((track) => track.label)).toEqual([
      'First',
      'Second',
      'Third.unknown',
      'Missing'
    ]);
    expect(subtitleTracks.value.map((track) => track.format)).toEqual(['srt', 'ass', 'srt', 'vtt']);
    expect(subtitleTracks.value.every((track) => track.source === 'custom')).toBe(true);
    expect(activeSubtitleId.value).toBe('custom-/subs/Missing.vtt');
  });

  it('skips unreadable files and keeps the active subtitle when none were added', async () => {
    readFile.mockResolvedValue(null);
    const { activeSubtitleId, subtitleTracks, loadCustomSubtitles, setActiveSubtitle } =
      usePlayerSubtitles();
    setActiveSubtitle('emb-1');

    const added = await loadCustomSubtitles(['/subs/none.srt']);

    expect(added).toBe(0);
    expect(subtitleTracks.value).toEqual([]);
    expect(activeSubtitleId.value).toBe('emb-1');
  });

  it('uses the full path as the label when there is no filename part', async () => {
    readFile.mockResolvedValue('content');
    const { subtitleTracks, loadCustomSubtitles } = usePlayerSubtitles();

    await loadCustomSubtitles(['weird']);

    expect(subtitleTracks.value[0].label).toBe('weird');
    expect(subtitleTracks.value[0].format).toBe('srt');
  });
});

describe('clearSubtitles', () => {
  it('resets tracks and the active subtitle', async () => {
    listEmbedded.mockResolvedValue([{ index: 1, title: 'One' }] as never);
    const { subtitleTracks, activeSubtitleId, loadSubtitles, clearSubtitles } =
      usePlayerSubtitles();
    await loadSubtitles('/video.mkv');

    clearSubtitles();

    expect(subtitleTracks.value).toEqual([]);
    expect(activeSubtitleId.value).toBeNull();
  });
});
