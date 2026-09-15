import { describe, it, expect } from 'vitest';
import { decorationOptionsFor } from '../audioLayoutDecorations';
import { computeDecorations } from '../plugins-derive';

const t = (key: string): string => `t:${key}`;

describe('decorationOptionsFor', () => {
  it('returns no options when no plugin provides variants', () => {
    expect(decorationOptionsFor('cover', {}, t)).toEqual([]);
  });

  it('returns plugin variants with a single "none" entry first', () => {
    const variants = {
      cover: [{ value: 'plugin:cover:triangle', label: 'Trójkąt', plugin: 'Triangle' }]
    };
    expect(decorationOptionsFor('cover', variants, t)).toEqual([
      { value: 'none', label: 't:audioView.decorationNone' },
      { value: 'plugin:cover:triangle', label: 'Trójkąt', plugin: 'Triangle' }
    ]);
  });

  it('ignores variants declared for other elements', () => {
    const variants = {
      progress: [{ value: 'plugin:progress:neon', label: 'Neon', plugin: 'X' }]
    };
    expect(decorationOptionsFor('cover', variants, t)).toEqual([]);
  });
});

describe('computeDecorations', () => {
  it('maps enabled plugins to their live decoration', () => {
    const plugins = [{ id: 'a', enabled: true }];
    expect(computeDecorations(plugins, { a: { cover: 'plugin:cover:flip-x' } })).toEqual({
      cover: 'plugin:cover:flip-x'
    });
  });

  it('ignores disabled plugins and unknown elements', () => {
    expect(
      computeDecorations([{ id: 'a', enabled: false }], { a: { cover: 'plugin:cover:flip-x' } })
    ).toEqual({});
    expect(
      computeDecorations([{ id: 'a', enabled: true }], { a: { unknown: 'plugin:unknown:x' } })
    ).toEqual({});
  });
});
