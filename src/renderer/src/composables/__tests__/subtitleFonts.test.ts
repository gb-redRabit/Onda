import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

// Rozwiązywanie czcionek napisów: lfa-ponyfill i URL blobów są podstawione,
// a `extractAssFamilies`/`hashContent` działają naprawdę.
const state = vi.hoisted(() => ({
  query: vi.fn(),
  loggerWarn: vi.fn(),
  loggerInfo: vi.fn()
}));

vi.mock('lfa-ponyfill', () => ({ default: state.query }));
vi.mock('@shared/logger', () => ({
  logger: { warn: state.loggerWarn, info: state.loggerInfo, error: vi.fn() }
}));

const { buildFontMap, releaseFontBlobUrls } = await import('../subtitleFonts');

function font(): Array<{ blob: () => Promise<Blob> }> {
  return [{ blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'font/ttf' }) }];
}

function ass(family: string): string {
  return `[V4+ Styles]\nStyle: Default,${family},20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1\n`;
}

let createObjectURL: Mock<(blob: Blob) => string>;
let revokeObjectURL: Mock<(url: string) => void>;
let urlCounter = 0;

beforeEach(() => {
  releaseFontBlobUrls();
  state.query.mockReset();
  state.query.mockResolvedValue([]);
  state.loggerWarn.mockClear();
  state.loggerInfo.mockClear();
  urlCounter = 0;
  createObjectURL = vi.fn(() => `blob:test-${++urlCounter}`);
  revokeObjectURL = vi.fn();
  (URL as unknown as Record<string, unknown>).createObjectURL = createObjectURL;
  (URL as unknown as Record<string, unknown>).revokeObjectURL = revokeObjectURL;
});

afterEach(() => {
  releaseFontBlobUrls();
});

describe('embedded attachments', () => {
  it('registers attachment blobs under the lowercase family name', async () => {
    const map = await buildFontMap('', [{ name: 'MyFont', ext: 'ttf', data: [1, 2, 3] }]);

    expect(map.myfont).toBe('blob:test-1');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(state.loggerInfo).toHaveBeenCalledWith('Subtitles', expect.stringContaining('MyFont'));
  });

  it('reuses an embedded font referenced with different case', async () => {
    const map = await buildFontMap(ass('custom'), [{ name: 'Custom', ext: 'ttf', data: [1] }]);

    expect(map.custom).toBe('blob:test-1');
    expect(state.query).not.toHaveBeenCalled();
  });

  it('ignores duplicate attachment names', async () => {
    const map = await buildFontMap('', [
      { name: 'Same', ext: 'ttf', data: [1] },
      { name: 'same', ext: 'ttf', data: [2] }
    ]);

    expect(Object.keys(map)).toEqual(['same']);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });
});

describe('local font resolution', () => {
  it('resolves all four style variants', async () => {
    state.query.mockResolvedValue(font());

    const map = await buildFontMap(ass('Arial'));

    expect(map.arial).toMatch(/^blob:/);
    expect(map['arial bold']).toMatch(/^blob:/);
    expect(map['arial italic']).toMatch(/^blob:/);
    expect(map['arial bold italic']).toMatch(/^blob:/);
    expect(state.query).toHaveBeenCalledTimes(4);
    expect(state.query).toHaveBeenCalledWith({ postscriptNames: ['Arial'] });
  });

  it('treats a partially resolved family as resolved', async () => {
    state.query.mockImplementation(async (options?: { postscriptNames?: string[] }) => {
      const ps = options?.postscriptNames?.[0] ?? '';
      if (ps.endsWith('BoldItalic')) throw new Error('missing');
      return font();
    });

    const map = await buildFontMap(ass('Arial'));

    expect(map.arial).toBeDefined();
    expect(map['arial bold italic']).toBeUndefined();
    expect(state.loggerWarn).toHaveBeenCalled();
  });

  it('skips a family when every variant query returns nothing', async () => {
    const map = await buildFontMap(ass('Missing Sans'));
    expect(map).toEqual({});
    expect(state.query).toHaveBeenCalledTimes(4);
  });
});

describe('metric aliases', () => {
  it('falls back to the free clone for known Windows families', async () => {
    state.query.mockImplementation(async (options?: { postscriptNames?: string[] }) => {
      const ps = options?.postscriptNames?.[0] ?? '';
      return ps.startsWith('Carlito') ? font() : [];
    });

    const map = await buildFontMap(ass('Calibri'));

    expect(map.calibri).toMatch(/^blob:/);
    expect(state.query).toHaveBeenCalledWith({ postscriptNames: ['Calibri'] });
    expect(state.query).toHaveBeenCalledWith({ postscriptNames: ['Carlito'] });
    expect(state.loggerInfo).toHaveBeenCalledWith(
      'Subtitles',
      expect.stringContaining('Calibri→Carlito')
    );
  });

  it('reports a family without any available alias', async () => {
    const map = await buildFontMap(ass('Comic Sans MS'));
    // Alias istnieje (Comic Neue), ale query nic nie zwraca.
    expect(map).toEqual({});
    expect(state.loggerInfo).toHaveBeenCalledWith(
      'Subtitles',
      expect.stringContaining('missingNames=[Comic Sans MS]')
    );
  });
});

describe('caching', () => {
  it('returns the cached map for identical input', async () => {
    state.query.mockResolvedValue(font());
    const content = ass('Arial');

    const first = await buildFontMap(content, [{ name: 'Extra', ext: 'ttf', data: [1] }]);
    const second = await buildFontMap(content, [{ name: 'Extra', ext: 'ttf', data: [1] }]);

    expect(second).toBe(first);
    expect(state.query).toHaveBeenCalledTimes(4);
    // 4 warianty zdalne + 1 dołączona czcionka, bez powtórzeń przy drugim wywołaniu.
    expect(createObjectURL).toHaveBeenCalledTimes(5);
  });

  it('reuses remote blob URLs across maps with different content', async () => {
    state.query.mockResolvedValue(font());

    await buildFontMap(ass('Arial'));
    expect(state.query).toHaveBeenCalledTimes(4);

    const second = await buildFontMap(ass('Arial '));

    expect(second.arial).toMatch(/^blob:/);
    expect(state.query).toHaveBeenCalledTimes(4);
  });
});

describe('releaseFontBlobUrls', () => {
  it('revokes every unique object URL and clears the caches', async () => {
    state.query.mockResolvedValue(font());
    await buildFontMap(ass('Arial'), [{ name: 'Extra', ext: 'ttf', data: [1] }]);
    const urls = createObjectURL.mock.results.map((r) => r.value);

    releaseFontBlobUrls();

    expect(new Set(urls).size).toBe(urls.length);
    for (const url of urls) {
      expect(revokeObjectURL).toHaveBeenCalledWith(url);
    }
    // Trwałe URL-e są rewidowane również przez drugą pętlę po remoteFontCache.
    expect(revokeObjectURL.mock.calls.length).toBeGreaterThanOrEqual(urls.length);

    // Cache wyczyszczony: ta sama treść tworzy nowe URL-e.
    state.query.mockResolvedValue(font());
    await buildFontMap(ass('Arial'));
    expect(createObjectURL.mock.calls.length).toBeGreaterThan(urls.length);
  });
});
