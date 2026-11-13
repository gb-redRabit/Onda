import { describe, expect, it } from 'vitest';

import { deriveFileName, computePaginationMode, sanitizeName, toPlain } from '../sources-helpers';

describe('computePaginationMode', () => {
  it('detects page pagination only with pageParam and no token field', () => {
    expect(computePaginationMode({ pagination: { pageParam: 'page' } } as never)).toBe('page');
    expect(
      computePaginationMode({ pagination: { pageParam: 'page', nextFromField: 'next' } } as never)
    ).toBe('cursor');
  });

  it('detects cursor pagination from token fields', () => {
    expect(computePaginationMode({ pagination: { nextFromField: 'next' } } as never)).toBe(
      'cursor'
    );
    expect(computePaginationMode({ pagination: { totalField: 'total' } } as never)).toBe('cursor');
  });

  it('returns none without pagination', () => {
    expect(computePaginationMode(null)).toBe('none');
    expect(computePaginationMode(undefined)).toBe('none');
    expect(computePaginationMode({} as never)).toBe('none');
  });
});

describe('sanitizeName', () => {
  it('removes reserved characters', () => {
    expect(sanitizeName('a/b:c*?.mp3')).not.toMatch(/[\\/:*?"<>|]/);
  });
});

describe('deriveFileName', () => {
  it('keeps a short extension from the URL', () => {
    expect(deriveFileName({ title: 'Clip', mediaUrl: 'https://cdn/x/File.MP4?x=1' } as never)).toBe(
      'Clip.mp4'
    );
  });

  it('falls back to sourceUrl', () => {
    expect(deriveFileName({ title: 'Clip', sourceUrl: 'https://cdn/x/a.webm' } as never)).toBe(
      'Clip.webm'
    );
  });

  it('uses type-specific fallbacks', () => {
    expect(deriveFileName({ title: 'Img', type: 'image', mediaUrl: 'not-a-url' } as never)).toBe(
      'Img.jpg'
    );
    expect(deriveFileName({ title: 'Vid', type: 'video' } as never)).toBe('Vid.mp4');
    expect(deriveFileName({ title: 'Aud', type: 'audio' } as never)).toBe('Aud.mp3');
    expect(deriveFileName({ title: 'Other', type: 'other' } as never)).toBe('Other.bin');
  });

  it('falls back when the URL extension is too long or missing', () => {
    expect(
      deriveFileName({
        title: 'X',
        type: 'image',
        mediaUrl: 'https://cdn/a.verylongextension'
      } as never)
    ).toBe('X.jpg');
    expect(
      deriveFileName({ title: 'X', type: 'image', mediaUrl: 'https://cdn/noext' } as never)
    ).toBe('X.jpg');
    expect(deriveFileName({ title: 'X', type: 'image', mediaUrl: 'https://cdn/' } as never)).toBe(
      'X.jpg'
    );
  });
});

describe('toPlain', () => {
  it('clones plain data', () => {
    const input = { a: { b: [1, 2] } };
    const copy = toPlain(input);

    expect(copy).toEqual(input);
    expect(copy).not.toBe(input);
    expect(copy.a).not.toBe(input.a);
  });
});
