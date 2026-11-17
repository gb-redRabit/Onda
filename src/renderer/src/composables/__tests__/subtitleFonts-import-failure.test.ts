import { describe, expect, it, vi } from 'vitest';

// `lfa-ponyfill` bywa dostarczany bez użytecznego eksportu (starsza wersja
// pakietu albo podmieniony bundler). Rozwiązywanie czcionek ma wtedy zwrócić
// pustą mapę, a nie wywalić renderera napisów — i nie zapamiętać porażki.
vi.mock('lfa-ponyfill', () => ({}));
vi.mock('@shared/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() }
}));

const { buildFontMap } = await import('../subtitleFonts');

function ass(family: string): string {
  return `[V4+ Styles]\nStyle: Default,${family},20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1\n`;
}

describe('font query module without a usable export', () => {
  it('returns an empty map and retries on the next call', async () => {
    await expect(buildFontMap(ass('Arial'))).resolves.toEqual({});
    // Inna treść = inny klucz cache, więc import jest ponawiany zamiast
    // korzystania z zapamiętanej porażki.
    await expect(buildFontMap(ass('Arial '))).resolves.toEqual({});
  });
});
