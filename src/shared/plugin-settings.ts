import type { PluginSettingField } from './types/ipc';

export const MAX_PLUGIN_SETTING_TEXT_BYTES = 4096;

/** Walidacja w czasie działania współdzielona przez UI ustawień wtyczek i IPC procesu głównego. */
export function pluginSettingValueValid(field: PluginSettingField, value: unknown): boolean {
  switch (field.type) {
    case 'text':
      return (
        typeof value === 'string' &&
        new TextEncoder().encode(value).byteLength <= MAX_PLUGIN_SETTING_TEXT_BYTES
      );
    case 'boolean':
      return typeof value === 'boolean';
    case 'number':
      return (
        typeof value === 'number' &&
        Number.isFinite(value) &&
        (field.min === undefined || value >= field.min) &&
        (field.max === undefined || value <= field.max)
      );
    default:
      return false;
  }
}
