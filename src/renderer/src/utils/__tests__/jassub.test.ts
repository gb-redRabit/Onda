import { describe, it, expect } from 'vitest';
import { createJassub } from '../jassub';

// Regresja: JASSUB wylicza wbudowaną czcionkę awaryjną przez `new URL('./default.woff2',
// import.meta.url)`, co w dev wskazuje nieistniejący URL → worker pobiera 404 → libass
// zgłasza "Error opening memory font", a napisy bez osadzonych czcionek (zwykły `.srt`)
// nie renderują się. Oczekujemy, że `createJassub` poda tę czcionkę jawnie.

class FakeJassub {
  opts: Record<string, unknown>;
  ready = Promise.resolve();
  constructor(opts: Record<string, unknown>) {
    this.opts = opts;
  }
}

function baseParams(extra: Record<string, unknown> = {}) {
  return {
    video: {} as HTMLVideoElement,
    subContent: 'x',
    fonts: [],
    availableFonts: {},
    ...extra
  };
}

async function optionsFor(extra: Record<string, unknown> = {}) {
  const instance = await createJassub(
    FakeJassub as unknown as Parameters<typeof createJassub>[0],
    baseParams(extra) as Parameters<typeof createJassub>[1]
  );
  return (instance as unknown as FakeJassub).opts;
}

describe('createJassub options', () => {
  it('always provides a usable fallback font and queries local fonts', async () => {
    const opts = await optionsFor();
    expect(opts.defaultFont).toBe('liberation sans');
    expect(opts.queryFonts).toBe('local');
    const fonts = opts.availableFonts as Record<string, string>;
    expect(typeof fonts['liberation sans']).toBe('string');
    expect(fonts['liberation sans']).not.toHaveLength(0);
  });

  it('honours an explicit defaultFont and queryFonts', async () => {
    const opts = await optionsFor({ defaultFont: 'Arial', queryFonts: false });
    expect(opts.defaultFont).toBe('Arial');
    expect(opts.queryFonts).toBe(false);
    expect((opts.availableFonts as Record<string, string>)['liberation sans']).toBeUndefined();
  });
});
