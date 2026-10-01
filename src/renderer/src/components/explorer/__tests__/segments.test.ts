import { describe, expect, it } from 'vitest';
import { buildSegments } from '../segments';

// The breadcrumb used to key its segments by index, so moving between folders
// reused the button DOM of a different folder. These tests pin the two
// properties that make the path a usable key: it is unique within a list, and it
// is stable for the part of the path that did not change.

describe('buildSegments', () => {
  it('gives every segment the cumulative path it navigates to', () => {
    expect(buildSegments('a\\b\\c').map((s) => s.path)).toEqual(['a', 'a\\b', 'a\\b\\c']);
  });

  it('keys are unique, including when a folder name repeats down the path', () => {
    // A duplicate key is not a cosmetic problem: Vue warns and then reuses the
    // wrong node. `a\a` would collide if the key were the folder name alone.
    const paths = buildSegments('a\\a\\a').map((s) => s.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('keeps the keys of the shared prefix when navigating', () => {
    // This is the actual regression. From a\b\c to a\d, index keys 0 and 1 are
    // reused, so `a` keeps its node and `a\b` is reused for `a\d`.
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
});
