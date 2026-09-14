import type { Ref } from 'vue';
import type { PluginManifest, PluginSettingField } from '@shared/types/ipc';
import { mergeSettingDefaults } from '@renderer/utils/plugins-derive';

export interface PluginSettingsDeps {
  pluginSettings: Ref<Record<string, Record<string, unknown>>>;
  getManifest: (id: string) => PluginManifest | undefined;
}

// Per-plugin settings store surface extracted from `stores/plugins.ts` (plan 2.8).
export function createPluginSettings(deps: PluginSettingsDeps) {
  const { pluginSettings, getManifest } = deps;

  function settingsOf(id: string): Record<string, unknown> {
    const stored = pluginSettings.value[id] || {};
    const fields = getManifest(id)?.settings || [];
    return mergeSettingDefaults(stored, fields);
  }

  async function saveSetting(id: string, key: string, value: unknown): Promise<boolean> {
    const ok = await window.api.pluginsSettingsSet(id, key, value);
    if (ok) {
      pluginSettings.value = {
        ...pluginSettings.value,
        [id]: { ...(pluginSettings.value[id] || {}), [key]: value }
      };
    }
    return ok;
  }

  function settingFields(id: string): PluginSettingField[] {
    return getManifest(id)?.settings || [];
  }

  return { settingsOf, saveSetting, settingFields };
}
