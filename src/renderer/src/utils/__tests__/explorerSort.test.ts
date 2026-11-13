import { describe, expect, it } from 'vitest';

import { sortFiles } from '../explorerSort';

type File = {
  name: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: number;
  extension?: string;
};

function file(name: string, over: Partial<File> = {}): File {
  return { name, isDirectory: false, size: 0, modifiedAt: 0, ...over };
}

const files: File[] = [
  file('b.MP3', { size: 20, modifiedAt: 2, extension: 'mp3' }),
  file('a.txt', { size: 10, modifiedAt: 3, extension: 'txt' }),
  { name: 'folder', isDirectory: true, size: 9999, modifiedAt: 1 },
  file('noext', { size: 5, modifiedAt: 4 })
];

function names(result: File[]): string[] {
  return result.map((f) => f.name);
}

describe('sortFiles', () => {
  it('keeps directories first', () => {
    for (const sortBy of ['name', 'size', 'type', 'modified'] as const) {
      expect(names(sortFiles(files as never, sortBy, 'asc'))[0]).toBe('folder');
      expect(names(sortFiles(files as never, sortBy, 'desc'))[0]).toBe('folder');
    }
  });

  it('sorts by name', () => {
    expect(names(sortFiles(files as never, 'name', 'asc'))).toEqual([
      'folder',
      'a.txt',
      'b.MP3',
      'noext'
    ]);
    expect(names(sortFiles(files as never, 'name', 'desc'))).toEqual([
      'folder',
      'noext',
      'b.MP3',
      'a.txt'
    ]);
  });

  it('sorts by size', () => {
    expect(names(sortFiles(files as never, 'size', 'asc'))).toEqual([
      'folder',
      'noext',
      'a.txt',
      'b.MP3'
    ]);
  });

  it('sorts by modification time', () => {
    expect(names(sortFiles(files as never, 'modified', 'asc'))).toEqual([
      'folder',
      'b.MP3',
      'a.txt',
      'noext'
    ]);
  });

  it('sorts by extension with a fallback for missing values', () => {
    expect(names(sortFiles(files as never, 'type', 'asc'))).toEqual([
      'folder',
      'noext',
      'b.MP3',
      'a.txt'
    ]);

    const noExt = [file('one'), file('two')];
    expect(names(sortFiles(noExt as never, 'type', 'asc'))).toEqual(['one', 'two']);
  });

  it('does not mutate the input', () => {
    const original = names(files);
    sortFiles(files as never, 'name', 'desc');
    expect(names(files)).toEqual(original);
  });

  it('keeps a stable order for an unknown key', () => {
    const result = sortFiles(files as never, 'mystery' as never, 'asc');

    expect(result[0].name).toBe('folder');
    expect(names(result).slice(1)).toEqual(['b.MP3', 'a.txt', 'noext']);
  });
});
