import { describe, expect, it } from 'vitest';

import { topN } from '../topN';
import { isCoreShell, isStandaloneWindowRoute, setCoreShellMode } from '../runtimeMode';

describe('topN', () => {
  const items = [
    { id: 'a', score: 5 },
    { id: 'b', score: 10 },
    { id: 'c', score: 1 },
    { id: 'd', score: 8 },
    { id: 'e', score: 10 }
  ];
  const byScore = (item: { score: number }) => item.score;

  it('returns the highest scoring items in descending order', () => {
    expect(topN(items, 3, byScore).map((i) => i.id)).toEqual(['b', 'e', 'd']);
  });

  it('returns every item when n exceeds the list', () => {
    expect(topN(items, 10, byScore)).toHaveLength(5);
  });

  it('returns nothing for n <= 0', () => {
    expect(topN(items, 0, byScore)).toEqual([]);
    expect(topN(items, -2, byScore)).toEqual([]);
  });

  it('keeps insertion order for ties', () => {
    expect(topN(items, 2, byScore).map((i) => i.id)).toEqual(['b', 'e']);
  });

  it('replaces the lowest score with a better one', () => {
    expect(topN([{ s: 5 }, { s: 3 }, { s: 9 }], 2, (x) => x.s)).toEqual([{ s: 9 }, { s: 5 }]);
  });

  it('handles an empty list', () => {
    expect(topN([], 3, byScore)).toEqual([]);
  });
});

describe('runtime mode', () => {
  it('defaults to a non-core shell and can be toggled', () => {
    setCoreShellMode(false);
    expect(isCoreShell()).toBe(false);

    setCoreShellMode(true);
    expect(isCoreShell()).toBe(true);

    setCoreShellMode(false);
    expect(isCoreShell()).toBe(false);
  });
});

describe('isStandaloneWindowRoute', () => {
  const withHash = (hash: string, check: () => void): void => {
    const previous = window.location.hash;
    window.location.hash = hash;
    try {
      check();
    } finally {
      window.location.hash = previous;
    }
  };

  it('recognises tool, explorer and image viewer windows', () => {
    withHash('#/tools/image-studio', () => expect(isStandaloneWindowRoute()).toBe(true));
    withHash('#/explorer/window/42', () => expect(isStandaloneWindowRoute()).toBe(true));
    withHash('#/image-viewer', () => expect(isStandaloneWindowRoute()).toBe(true));
  });

  it('keeps the main shell and ordinary routes booted normally', () => {
    withHash('', () => expect(isStandaloneWindowRoute()).toBe(false));
    withHash('#/library', () => expect(isStandaloneWindowRoute()).toBe(false));
    withHash('#/tools', () => expect(isStandaloneWindowRoute()).toBe(false));
    withHash('#/explorer', () => expect(isStandaloneWindowRoute()).toBe(false));
  });
});
