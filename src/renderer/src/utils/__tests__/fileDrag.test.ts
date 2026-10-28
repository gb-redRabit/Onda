import { describe, expect, it } from 'vitest';
import { filePathToUri, getDroppedFilePaths } from '../fileDrag';

function uriDrop(uris: string): DataTransfer {
  return {
    getData: (type: string) => (type === 'text/uri-list' ? uris : ''),
    files: []
  } as unknown as DataTransfer;
}

describe('fileDrag', () => {
  it('builds file URIs for Windows and POSIX paths', () => {
    expect(filePathToUri('C:\\Music\\a b.mp3')).toBe('file:///C:/Music/a b.mp3');
    expect(filePathToUri('/Users/u/Music/a.mp3')).toBe('file:///Users/u/Music/a.mp3');
  });

  it('keeps POSIX separators and converts Windows drive URLs', () => {
    expect(getDroppedFilePaths(uriDrop('file:///Users/u/Music/a.mp3'))).toEqual([
      '/Users/u/Music/a.mp3'
    ]);
    expect(getDroppedFilePaths(uriDrop('file:///C:/Music/a.mp3'))).toEqual(['C:\\Music\\a.mp3']);
  });

  it('decodes percent-encoded paths and ignores comments', () => {
    const uris = ['# comment', 'file:///C:/Music/a%20b.mp3'].join('\n');
    expect(getDroppedFilePaths(uriDrop(uris))).toEqual(['C:\\Music\\a b.mp3']);
  });
});
