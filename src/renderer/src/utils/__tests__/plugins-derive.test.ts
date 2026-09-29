import { describe, expect, it } from 'vitest';
import { mergeSettingDefaults } from '../plugins-derive';

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
