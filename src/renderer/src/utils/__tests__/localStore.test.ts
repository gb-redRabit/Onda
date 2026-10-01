import { describe, it, expect, vi, afterEach } from 'vitest';
import { readString, writeString, readJson, writeJson, readStringArray } from '../localStore';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('localStore', () => {
  it('round-trips strings and JSON', () => {
    writeString('k', 'v');
    expect(readString('k')).toBe('v');

    writeJson('j', { a: 1 });
    expect(readJson('j')).toEqual({ a: 1 });
  });

  it('readStringArray validates the stored shape', () => {
    localStorage.setItem('arr', JSON.stringify(['a', 1, 'b']));
    expect(readStringArray('arr')).toEqual(['a', 'b']);

    localStorage.setItem('bad', 'not json');
    expect(readStringArray('bad')).toEqual([]);
    expect(readStringArray('missing')).toEqual([]);
  });

  it('degrades to defaults when reads throw', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(readString('x')).toBeNull();
    expect(readJson('x')).toBeNull();
    expect(readStringArray('x')).toEqual([]);
  });

  it('never throws when writes fail', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => writeString('x', 'y')).not.toThrow();
    expect(() => writeJson('x', { a: 1 })).not.toThrow();
  });
});
