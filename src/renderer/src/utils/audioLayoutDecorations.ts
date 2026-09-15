import type { AudioLayoutElementId } from '@renderer/types/settings';

// Decoration options for the layout editor. Decorations come only from plugins
// (manifest `layoutElements`, host-implemented in `PLUGIN_HOST_VARIANTS`), so
// the list is empty unless an active plugin provides variants for the element —
// then a single "none" entry lets the user clear the plugin decoration.
export function decorationOptionsFor(
  elementId: AudioLayoutElementId,
  variants: Record<string, { value: string; label: string; plugin: string }[]>,
  t: (key: string) => string
): { value: string; label: string; plugin?: string }[] {
  const plugin = (variants[elementId] || []).map((v) => ({
    value: v.value,
    label: v.label,
    plugin: v.plugin
  }));
  if (plugin.length === 0) return [];
  return [{ value: 'none', label: t('audioView.decorationNone') }, ...plugin];
}
