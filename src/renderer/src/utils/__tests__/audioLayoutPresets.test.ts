import { describe, expect, it } from 'vitest';
import {
  audioLayoutsEqual,
  computePresetLayout,
  computeResetLayout,
  factoryElements,
  isStockLayout
} from '../audioLayoutPresets';
import type { AudioLayoutElement, AudioLayoutPreset } from '@renderer/types/settings';

function elements(preset: AudioLayoutPreset = 'full'): AudioLayoutElement[] {
  return factoryElements(preset);
}

function clone(items: AudioLayoutElement[]): AudioLayoutElement[] {
  return items.map((item) => ({ ...item }));
}

describe('audioLayoutsEqual', () => {
  it('compares lengths, ids and every rendered property', () => {
    const base = elements();
    const other = clone(base);

    expect(audioLayoutsEqual(base, other)).toBe(true);
    expect(audioLayoutsEqual(base, other.slice(1))).toBe(false);
    expect(audioLayoutsEqual(base, [...other, { ...other[0] }])).toBe(false);

    const missing = clone(base);
    missing[0] = { ...missing[0], id: 'not-there' as never };
    expect(audioLayoutsEqual(base, missing)).toBe(false);

    for (const key of ['x', 'y', 'width', 'height', 'layer', 'visible', 'variant'] as const) {
      const changed = clone(base);
      const first = changed[0] as unknown as Record<string, unknown>;
      first[key] = key === 'visible' ? !(first[key] ?? true) : 999;
      expect(audioLayoutsEqual(base, changed)).toBe(false);
    }
  });

  it('treats missing optional fields as defaults', () => {
    const a = [{ ...elements()[0], layer: undefined, visible: undefined, variant: undefined }];
    const b = clone(elements()).slice(0, 1);
    b[0] = { ...b[0], layer: 0, visible: true, variant: '' };

    expect(audioLayoutsEqual(a as never, b)).toBe(true);
  });
});

describe('factoryElements', () => {
  it('clones the requested preset and falls back to full', () => {
    const compact = factoryElements('compact');
    expect(compact).toEqual(elements('compact'));
    expect(compact[0]).not.toBe(elements('compact')[0]);

    const unknown = factoryElements('missing' as AudioLayoutPreset);
    expect(unknown).toEqual(elements('full'));
  });

  it('detects stock layouts', () => {
    expect(isStockLayout(elements())).toBe(true);
    const custom = clone(elements());
    custom[0] = { ...custom[0], x: custom[0].x + 10 };
    expect(isStockLayout(custom)).toBe(false);
  });
});

describe('computePresetLayout', () => {
  it('saves the current custom layout and falls back to factory elements', () => {
    const custom = clone(elements());
    custom[0] = { ...custom[0], x: custom[0].x + 5 };

    const result = computePresetLayout({ preset: 'compact', elements: custom }, 'full');

    expect(result.preset).toBe('full');
    expect(result.customLayouts?.compact).toEqual(custom);
    expect(result.elements).toEqual(elements('full'));
  });

  it('restores a stored custom target layout', () => {
    const stored = clone(elements());
    stored[0] = { ...stored[0], y: stored[0].y + 20 };

    const result = computePresetLayout(
      { preset: 'full', elements: elements('full'), customLayouts: { compact: stored } },
      'compact'
    );

    expect(result.elements).toEqual(stored);
    expect(result.elements[0]).not.toBe(stored[0]);
  });

  it('drops invalid keys and stock or empty snapshots', () => {
    const result = computePresetLayout(
      {
        preset: 'full',
        elements: elements('full'),
        customLayouts: {
          bogus: clone(elements()),
          compact: elements('compact'),
          mini: []
        } as never
      },
      'full'
    );

    expect(result.customLayouts).toEqual({});
  });

  it('keeps the current elements for an unknown target preset', () => {
    const result = computePresetLayout(
      { preset: 'full', elements: elements('full') },
      'unknown' as AudioLayoutPreset
    );

    expect(result.preset).toBe('unknown');
    expect(result.elements).toEqual(elements('full'));
  });

  it('defaults missing preset and custom layout fields', () => {
    const result = computePresetLayout({ elements: elements('full') }, 'full');
    expect(result.preset).toBe('full');
    expect(result.customLayouts).toEqual({});
  });
});

describe('computeResetLayout', () => {
  it('restores the factory layout and drops only the current snapshot', () => {
    const other = clone(elements('compact'));
    other[0] = { ...other[0], x: other[0].x + 1 };

    const result = computeResetLayout({
      preset: 'compact',
      elements: [{ ...elements()[0], x: 1 }],
      customLayouts: { compact: other, full: clone(elements()) }
    });

    expect(result.elements).toEqual(elements('compact'));
    expect(result.customLayouts).toEqual({ full: elements() });
  });

  it('defaults to the full preset when missing', () => {
    const result = computeResetLayout({ elements: [] });
    expect(result.preset).toBeUndefined();
    expect(result.elements).toEqual(elements('full'));
    expect(result.customLayouts).toEqual({});
  });
});
