import { describe, it, expect } from 'vitest';
import { deepMerge } from '../settingsStorage';

describe('deepMerge', () => {
  it('preserves nested default keys that are missing from the persisted patch', () => {
    const base = { visualization: { mode: 'bars', sensitivity: 1 } };
    const persisted = { visualization: { mode: 'wave' } };

    expect(deepMerge(base, persisted)).toEqual({
      visualization: { mode: 'wave', sensitivity: 1 }
    });
  });

  it('merges recursively without dropping sibling groups', () => {
    const base = { a: { x: 1, y: 2 }, b: { z: 3 } };
    const patch = { a: { y: 20 }, c: { w: 4 } };

    expect(deepMerge(base, patch)).toEqual({ a: { x: 1, y: 20 }, b: { z: 3 }, c: { w: 4 } });
  });

  it('replaces arrays wholesale instead of merging by index', () => {
    const base = { sections: ['continue', 'recent'] };
    const patch = { sections: ['favorites'] };

    expect(deepMerge(base, patch)).toEqual({ sections: ['favorites'] });
  });

  it('ignores undefined patch values so defaults survive', () => {
    expect(deepMerge({ a: 1 }, { a: undefined, b: 2 })).toEqual({ a: 1, b: 2 });
  });

  it('returns the patch when the base is not a plain object', () => {
    expect(deepMerge('dark', 'light')).toBe('light');
    expect(deepMerge({ a: 1 }, null)).toBeNull();
  });
});
