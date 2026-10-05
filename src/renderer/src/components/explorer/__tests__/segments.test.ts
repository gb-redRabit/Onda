import { describe, expect, it } from 'vitest';
import { buildSegments } from '../segments';

// Breadcrumb kiedyś kluczował segmenty po indeksie, więc przechodzenie między folderami
// używało ponownie DOM przycisku innego folderu. Te testy utrwalają dwie
// właściwości, które czynią ścieżkę użytecznym kluczem: jest unikalna w liście i
// stabilna dla tej części ścieżki, która się nie zmieniła.

describe('buildSegments', () => {
  it('gives every segment the cumulative path it navigates to', () => {
    expect(buildSegments('a\\b\\c').map((s) => s.path)).toEqual(['a', 'a\\b', 'a\\b\\c']);
  });

  it('keys are unique, including when a folder name repeats down the path', () => {
    // Zduplikowany klucz nie jest problemem kosmetycznym: Vue ostrzega, a potem używa
    // złego węzła. `a\a` kolidowałoby, gdyby kluczem była sama nazwa folderu.
    const paths = buildSegments('a\\a\\a').map((s) => s.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('keeps the keys of the shared prefix when navigating', () => {
    // To jest właściwa regresja. Z a\b\c do a\d klucze indeksów 0 i 1 są
    // używane ponownie, więc `a` zachowuje swój węzeł, a `a\b` jest użyty dla `a\d`.
    const before = buildSegments('a\\b\\c').map((s) => s.path);
    const after = buildSegments('a\\d').map((s) => s.path);
    const shared = after.filter((path) => before.includes(path));
    expect(shared).toEqual(['a']);
  });

  it('reports the index alongside the path so the separator can skip the first', () => {
    expect(buildSegments('a\\b').map((s) => s.idx)).toEqual([0, 1]);
  });

  it('handles empty and root paths without inventing a segment', () => {
    expect(buildSegments('')).toEqual([]);
    expect(buildSegments('\\')).toEqual([]);
  });

  it('handles POSIX paths with a leading root', () => {
    expect(buildSegments('/home/user/Music').map((s) => s.path)).toEqual([
      '/home',
      '/home/user',
      '/home/user/Music'
    ]);
  });

  it('handles a POSIX root-only path', () => {
    expect(buildSegments('/')).toEqual([]);
  });

  it('renders a Windows drive root as a single segment navigating to C:\\', () => {
    expect(buildSegments('C:\\')).toEqual([{ part: 'C:', idx: 0, path: 'C:\\' }]);
    // Toleruj brak separatora (zapisana historia), ale cel nawigacji zawsze ma `\`.
    expect(buildSegments('C:')).toEqual([{ part: 'C:', idx: 0, path: 'C:\\' }]);
  });

  it('builds drive-root children with correct cumulative paths', () => {
    // Pierwszy segment (litera dysku) nawiguje do `C:\`, nie do względnego `C:`.
    expect(buildSegments('C:\\Users\\Me').map((s) => s.path)).toEqual([
      'C:\\',
      'C:\\Users',
      'C:\\Users\\Me'
    ]);
    expect(buildSegments('C:\\Users\\Me').map((s) => s.part)).toEqual(['C:', 'Users', 'Me']);
  });
});
