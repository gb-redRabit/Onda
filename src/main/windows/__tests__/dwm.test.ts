import { describe, expect, it } from 'vitest';
import { colorRefFromHex } from '../dwm';

describe('colorRefFromHex', () => {
  it('converts #RRGGBB to COLORREF (0x00BBGGRR)', () => {
    expect(colorRefFromHex('#112233')).toBe(0x332211);
    expect(colorRefFromHex('#ff0000')).toBe(0x0000ff);
    expect(colorRefFromHex('#000000')).toBe(0);
  });

  it('rejects invalid colors', () => {
    expect(colorRefFromHex('112233')).toBeNull();
    expect(colorRefFromHex('#fff')).toBeNull();
    expect(colorRefFromHex('#gggggg')).toBeNull();
  });
});
