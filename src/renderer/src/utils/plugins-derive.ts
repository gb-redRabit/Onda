import type { PluginManifest, PluginSettingField } from '@shared/types/ipc';
import type { AudioLayoutElementId } from '@renderer/types/settings';
import { LAYOUT_ELEMENT_IDS, PLUGIN_HOST_VARIANTS } from '@renderer/utils/plugins-helpers';

export function computeDecorations(
  plugins: ReadonlyArray<{ id: string; enabled: boolean }>,
  visuals: Record<string, Record<string, string>>
): Partial<Record<AudioLayoutElementId, string>> {
  const out: Partial<Record<AudioLayoutElementId, string>> = {};
  for (const elementId of LAYOUT_ELEMENT_IDS) {
    for (const p of plugins) {
      if (!p.enabled) continue;
      const value = visuals[p.id]?.[elementId];
      if (value && value !== 'none') {
        out[elementId as AudioLayoutElementId] = value;
        break;
      }
    }
  }
  return out;
}

export function computeLayoutVariants(
  plugins: ReadonlyArray<{ id: string; enabled: boolean; name: string }>,
  manifests: Record<string, PluginManifest>
): Record<string, { value: string; label: string; plugin: string }[]> {
  const out: Record<string, { value: string; label: string; plugin: string }[]> = {};
  for (const p of plugins) {
    if (!p.enabled) continue;
    const manifest = manifests[p.id];
    if (!manifest || manifest.permissions.visual !== true || !manifest.layoutElements) continue;
    for (const le of manifest.layoutElements) {
      if (!PLUGIN_HOST_VARIANTS[le.element]?.includes(le.variant)) continue;
      const key = `plugin:${le.element}:${le.variant}`;
      const list = out[le.element] || (out[le.element] = []);
      if (!list.some((v) => v.value === key)) {
        list.push({ value: key, label: le.label || le.variant, plugin: p.name });
      }
    }
  }
  return out;
}

export function mergeSettingDefaults(
  stored: Record<string, unknown>,
  fields: PluginSettingField[]
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...stored };
  for (const field of fields) {
    if (field.default !== undefined && out[field.key] === undefined) {
      out[field.key] = field.default;
    }
  }
  return out;
}
