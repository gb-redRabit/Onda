import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import type { PluginManifest } from '@shared/types/ipc';

vi.mock('@renderer/utils/plugins-derive', () => ({
  mergeSettingDefaults: (stored: Record<string, unknown>, fields: unknown[]) => ({
    ...stored,
    __fields: fields.length
  })
}));

import { createPluginLogs } from '../pluginLogs';
import { createPluginSettings } from '../pluginSettings';

describe('createPluginLogs', () => {
  it('creates per-plugin buffers and caps them at fifty lines', () => {
    const logs = ref<Record<string, string[]>>({});
    const { logPush } = createPluginLogs(logs);

    logPush('a', 'first');
    logPush('a', 'second');
    expect(logs.value.a).toEqual(['first', 'second']);

    for (let i = 0; i < 60; i += 1) logPush('a', `line-${i}`);
    expect(logs.value.a).toHaveLength(50);
    expect(logs.value.a.at(-1)).toBe('line-59');
    expect(logs.value.a?.[0]).toBe('line-10');

    logPush('b', 'other');
    expect(logs.value.a).toHaveLength(50);
    expect(logs.value.b).toEqual(['other']);
  });
});

describe('createPluginSettings', () => {
  const api = { pluginsSettingsSet: vi.fn() };

  beforeEach(() => {
    api.pluginsSettingsSet.mockReset();
    (window as { api?: unknown }).api = api;
  });

  function build(manifests: Record<string, PluginManifest | undefined> = {}) {
    const pluginSettings = ref<Record<string, Record<string, unknown>>>({});
    const settings = createPluginSettings({
      pluginSettings,
      getManifest: (id) => manifests[id]
    });
    return { pluginSettings, settings };
  }

  it('merges defaults from the manifest and tolerates missing entries', () => {
    const { settings } = build({
      withFields: { settings: [{ key: 'a' }, { key: 'b' }] } as unknown as PluginManifest
    });

    expect(settings.settingsOf('withFields')).toEqual({ __fields: 2 });
    expect(settings.settingsOf('missing')).toEqual({ __fields: 0 });
    expect(settings.settingFields('withFields')).toHaveLength(2);
    expect(settings.settingFields('missing')).toEqual([]);
  });

  it('keeps existing values when saving a new key', async () => {
    api.pluginsSettingsSet.mockResolvedValue(true);
    const { pluginSettings, settings } = build();

    await expect(settings.saveSetting('p', 'a', 1)).resolves.toBe(true);
    await expect(settings.saveSetting('p', 'b', 2)).resolves.toBe(true);

    expect(pluginSettings.value.p).toEqual({ a: 1, b: 2 });
    expect(api.pluginsSettingsSet).toHaveBeenCalledWith('p', 'b', 2);
  });

  it('leaves state untouched when the IPC call fails', async () => {
    api.pluginsSettingsSet.mockResolvedValue(false);
    const { pluginSettings, settings } = build();

    await expect(settings.saveSetting('p', 'a', 1)).resolves.toBe(false);
    expect(pluginSettings.value).toEqual({});
  });
});
