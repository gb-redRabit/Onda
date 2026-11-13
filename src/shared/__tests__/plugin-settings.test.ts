import { describe, expect, it } from 'vitest';
import { MAX_PLUGIN_SETTING_TEXT_BYTES, pluginSettingValueValid } from '../plugin-settings';

// Shared plugin setting validation for UI and main IPC.

function field(over: Record<string, unknown>): never {
  return { key: 'k', label: 'K', type: 'text', ...over } as never;
}

describe('pluginSettingValueValid', () => {
  it('accepts text within the byte budget', () => {
    expect(pluginSettingValueValid(field({ type: 'text' }), 'hello')).toBe(true);
    expect(pluginSettingValueValid(field({ type: 'text' }), '')).toBe(true);
    expect(
      pluginSettingValueValid(field({ type: 'text' }), 'a'.repeat(MAX_PLUGIN_SETTING_TEXT_BYTES))
    ).toBe(true);
  });

  it('rejects non-strings and oversized text', () => {
    expect(pluginSettingValueValid(field({ type: 'text' }), 42)).toBe(false);
    expect(
      pluginSettingValueValid(
        field({ type: 'text' }),
        'a'.repeat(MAX_PLUGIN_SETTING_TEXT_BYTES + 1)
      )
    ).toBe(false);
    expect(pluginSettingValueValid(field({ type: 'text' }), 'ą'.repeat(2049))).toBe(false);
  });

  it('accepts only real booleans', () => {
    expect(pluginSettingValueValid(field({ type: 'boolean' }), true)).toBe(true);
    expect(pluginSettingValueValid(field({ type: 'boolean' }), false)).toBe(true);
    expect(pluginSettingValueValid(field({ type: 'boolean' }), 'true')).toBe(false);
    expect(pluginSettingValueValid(field({ type: 'boolean' }), 0)).toBe(false);
  });

  it('accepts finite numbers, including min/max bounds', () => {
    expect(pluginSettingValueValid(field({ type: 'number', min: 1, max: 5 }), 1)).toBe(true);
    expect(pluginSettingValueValid(field({ type: 'number', min: 1, max: 5 }), 5)).toBe(true);
    expect(pluginSettingValueValid(field({ type: 'number', min: 1, max: 5 }), 0)).toBe(false);
    expect(pluginSettingValueValid(field({ type: 'number', min: 1, max: 5 }), 6)).toBe(false);
    expect(pluginSettingValueValid(field({ type: 'number', min: 1 }), 0)).toBe(false);
    expect(pluginSettingValueValid(field({ type: 'number', max: 5 }), 6)).toBe(false);
  });

  it('rejects non-finite numbers and non-numbers', () => {
    expect(pluginSettingValueValid(field({ type: 'number' }), Number.NaN)).toBe(false);
    expect(pluginSettingValueValid(field({ type: 'number' }), Number.POSITIVE_INFINITY)).toBe(
      false
    );
    expect(pluginSettingValueValid(field({ type: 'number' }), '3')).toBe(false);
  });

  it('rejects unknown field types', () => {
    expect(pluginSettingValueValid(field({ type: 'color' }), '#fff')).toBe(false);
    expect(pluginSettingValueValid(field({ type: undefined }), 'x')).toBe(false);
  });
});
