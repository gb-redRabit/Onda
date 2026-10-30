import { describe, expect, it } from 'vitest';
import { UNKNOWN_ALBUM, UNKNOWN_ARTIST, groupLabel, isUnknownGroup } from '../libraryLabels';

const t = (key: string) => (key === 'common.unknown' ? 'Brak danych' : key);

describe('libraryLabels', () => {
  it('recognises the stable unknown keys', () => {
    expect(isUnknownGroup(UNKNOWN_ARTIST)).toBe(true);
    expect(isUnknownGroup(UNKNOWN_ALBUM)).toBe(true);
    expect(isUnknownGroup('Real Artist')).toBe(false);
  });

  it('translates unknown groups at render time', () => {
    expect(groupLabel(UNKNOWN_ARTIST, t)).toBe('Brak danych');
    expect(groupLabel(UNKNOWN_ALBUM, t)).toBe('Brak danych');
  });

  it('translates each part of a disambiguated album label', () => {
    expect(groupLabel(`${UNKNOWN_ALBUM} — ${UNKNOWN_ARTIST}`, t)).toBe('Brak danych — Brak danych');
    expect(groupLabel('Greatest Hits — Real Artist', t)).toBe('Greatest Hits — Real Artist');
  });

  it('leaves real names untouched', () => {
    expect(groupLabel('Daft Punk', t)).toBe('Daft Punk');
  });
});
