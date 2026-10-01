import type { AudioLayoutElementId } from '@renderer/types/settings';

// Opcje dekoracji dla edytora układu. Dekoracje pochodzą wyłącznie z wtyczek
// (manifest `layoutElements`, implementowane w hoście w `PLUGIN_HOST_VARIANTS`),
// więc lista jest pusta, dopóki aktywna wtyczka nie dostarczy wariantów dla elementu —
// wtedy pojedynczy wpis "none" pozwala użytkownikowi wyczyścić dekorację wtyczki.
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
