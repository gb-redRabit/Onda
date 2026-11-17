import { describe, expect, it } from 'vitest';
import type { PluginManifest } from '@shared/types/ipc';
import { computeLayoutVariants, mergeSettingDefaults } from '../plugins-derive';

function layoutManifest(
  id: string,
  elements: Array<{ element: string; variant: string; label?: string }>,
  overrides: Record<string, unknown> = {}
): PluginManifest {
  return {
    id,
    name: `${id}-name`,
    version: '1.0.0',
    description: '',
    permissions: { visual: true },
    layoutElements: elements,
    ...overrides
  } as unknown as PluginManifest;
}

describe('plugin layout variants', () => {
  it('collects supported variants from enabled visual plugins', () => {
    const variants = computeLayoutVariants(
      [
        { id: 'a', enabled: true, name: 'Alpha' },
        { id: 'b', enabled: false, name: 'Beta' },
        { id: 'c', enabled: true, name: 'Gamma' }
      ],
      {
        a: layoutManifest('a', [{ element: 'cover', variant: 'circle' }]),
        b: layoutManifest('b', [{ element: 'cover', variant: 'triangle' }]),
        c: layoutManifest('c', [{ element: 'cover', variant: 'hexagon', label: 'Hex' }])
      }
    );

    expect(variants.cover).toEqual([
      { value: 'plugin:cover:circle', label: 'circle', plugin: 'Alpha' },
      { value: 'plugin:cover:hexagon', label: 'Hex', plugin: 'Gamma' }
    ]);
  });

  it('skips plugins without the visual permission or layout elements', () => {
    const plugins = [{ id: 'a', enabled: true, name: 'Alpha' }];

    expect(
      computeLayoutVariants(plugins, {
        a: layoutManifest('a', [{ element: 'cover', variant: 'circle' }], {
          permissions: { visual: false }
        })
      })
    ).toEqual({});
    expect(computeLayoutVariants(plugins, {})).toEqual({});
  });

  it('ignores unsupported elements and variants and deduplicates them', () => {
    const manifest = layoutManifest('a', [
      { element: 'cover', variant: 'circle' },
      { element: 'cover', variant: 'circle' },
      { element: 'cover', variant: 'peak' },
      { element: 'waveform', variant: 'circle' }
    ]);

    const variants = computeLayoutVariants(
      [
        { id: 'a', enabled: true, name: 'Alpha' },
        { id: 'b', enabled: true, name: 'Beta' }
      ],
      { a: manifest, b: manifest }
    );

    expect(variants).toEqual({
      cover: [{ value: 'plugin:cover:circle', label: 'circle', plugin: 'Alpha' }]
    });
  });
});

describe('plugin settings schema normalization', () => {
  const fields = [
    { key: 'name', label: 'Name', type: 'text' as const, default: 'Onda' },
    { key: 'enabled', label: 'Enabled', type: 'boolean' as const, default: true },
    { key: 'volume', label: 'Volume', type: 'number' as const, default: 50, min: 0, max: 100 }
  ];

  it('keeps compatible saved values and fills missing values with schema defaults', () => {
    expect(mergeSettingDefaults({ name: 'Custom', volume: 80 }, fields)).toEqual({
      name: 'Custom',
      enabled: true,
      volume: 80
    });
  });

  it('replaces invalid values with valid defaults and drops removed setting keys', () => {
    expect(
      mergeSettingDefaults(
        { name: 42, enabled: 'yes', volume: 150, removedSetting: 'stale' },
        fields
      )
    ).toEqual({ name: 'Onda', enabled: true, volume: 50 });
  });

  it('omits invalid defaults instead of exposing values outside the current schema', () => {
    expect(
      mergeSettingDefaults({}, [
        { key: 'volume', label: 'Volume', type: 'number', default: 101, min: 0, max: 100 }
      ])
    ).toEqual({});
  });
});
