import { describe, it, expect } from 'vitest';
import { createJassub } from '../jassub';

// Regresja: przekazanie `defaultFont` (np. 'arial') WYŁĄCZA wbudowaną czcionkę
// awaryjną JASSUB (Liberation Sans), a `queryFonts: false` blokuje pytanie o czcionki
// systemowe. Efekt: napisy bez osadzonych czcionek (zwykły `.srt`) nie renderowały się.

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

describe('createJassub options', () => {
  it('keeps JASSUB bundled fallback font and queries local fonts by default', async () => {
    const instance = await createJassub(
      FakeJassub as unknown as Parameters<typeof createJassub>[0],
      baseParams() as Parameters<typeof createJassub>[1]
    );
    const opts = (instance as unknown as FakeJassub).opts;
    expect(opts.defaultFont).toBeUndefined();
    expect(opts.queryFonts).toBe('local');
  });

  it('honours an explicit defaultFont and queryFonts', async () => {
    const instance = await createJassub(
      FakeJassub as unknown as Parameters<typeof createJassub>[0],
      baseParams({ defaultFont: 'Arial', queryFonts: false }) as Parameters<typeof createJassub>[1]
    );
    const opts = (instance as unknown as FakeJassub).opts;
    expect(opts.defaultFont).toBe('Arial');
    expect(opts.queryFonts).toBe(false);
  });
});
