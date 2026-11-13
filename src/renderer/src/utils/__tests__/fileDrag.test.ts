import { describe, expect, it, vi } from 'vitest';
import { beginFileDrag, filePathToUri, getDroppedFilePaths } from '../fileDrag';

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

  it('returns an empty list without a data transfer', () => {
    expect(getDroppedFilePaths(null)).toEqual([]);
  });

  it('ignores non-file URIs and empty lines', () => {
    const uris = ['https://example.com/a.mp3', '', '  ', '# note'].join('\n');
    expect(getDroppedFilePaths(uriDrop(uris))).toEqual([]);
  });

  it('keeps the raw path when the escape sequence is malformed', () => {
    expect(getDroppedFilePaths(uriDrop('file:///C:/Music/a%ZZ.mp3'))).toEqual([
      'C:\\Music\\a%ZZ.mp3'
    ]);
  });

  it('adds dropped File objects through the preload bridge, deduped', () => {
    const getFilePath = vi.fn().mockReturnValue('C:\\Music\\a.mp3');
    (window as unknown as { api?: unknown }).api = { getFilePath };
    const dt = {
      getData: () => '',
      files: [{ name: 'a.mp3' }, { name: 'a.mp3' }]
    } as unknown as DataTransfer;

    expect(getDroppedFilePaths(dt)).toEqual(['C:\\Music\\a.mp3']);
    expect(getFilePath).toHaveBeenCalledTimes(2);
  });

  it('handles a data transfer without a files list', () => {
    const dt = { getData: () => 'file:///C:/Music/a.mp3' } as unknown as DataTransfer;

    expect(getDroppedFilePaths(dt)).toEqual(['C:\\Music\\a.mp3']);
  });

  it('dedupes repeated URIs', () => {
    const uris = ['file:///C:/Music/a.mp3', 'file:///C:/Music/a.mp3'].join('\n');

    expect(getDroppedFilePaths(uriDrop(uris))).toEqual(['C:\\Music\\a.mp3']);
  });

  it('ignores files the bridge cannot resolve', () => {
    (window as unknown as { api?: unknown }).api = { getFilePath: () => '' };
    const dt = { getData: () => '', files: [{ name: 'a.mp3' }] } as unknown as DataTransfer;

    expect(getDroppedFilePaths(dt)).toEqual([]);
  });

  it('tolerates a missing preload bridge', () => {
    (window as unknown as { api?: unknown }).api = undefined;
    const dt = { getData: () => '', files: [{ name: 'a.mp3' }] } as unknown as DataTransfer;

    expect(getDroppedFilePaths(dt)).toEqual([]);
  });
});

describe('beginFileDrag', () => {
  function dragStart(dt: Partial<DataTransfer> | null) {
    const store = new Map<string, string>();
    const dataTransfer = dt
      ? ({
          setData: (type: string, value: string) => store.set(type, value),
          effectAllowed: 'none',
          ...dt
        } as unknown as DataTransfer)
      : null;
    return { event: { dataTransfer } as unknown as DragEvent, store };
  }

  it('advertises plain text, URI list and copy/move semantics', () => {
    const { event, store } = dragStart({});

    beginFileDrag(event, ['C:\\Music\\a.mp3', '/Users/u/b.mp3']);

    expect(store.get('text/plain')).toBe('C:\\Music\\a.mp3\n/Users/u/b.mp3');
    expect(store.get('text/uri-list')).toBe('file:///C:/Music/a.mp3\nfile:///Users/u/b.mp3');
    expect(event.dataTransfer?.effectAllowed).toBe('all');
  });

  it('does nothing when the drag event has no dataTransfer', () => {
    const { event } = dragStart(null);

    expect(() => beginFileDrag(event, ['C:\\Music\\a.mp3'])).not.toThrow();
  });
});
