import { ELEMENT_DECORATIONS } from '@renderer/stores/plugins';
import type { AudioLayoutElementId } from '@renderer/types/settings';

export function decorationOptionsFor(
  elementId: AudioLayoutElementId,
  variants: Record<string, { value: string; label: string; plugin: string }[]>,
  t: (key: string) => string
): { value: string; label: string; plugin?: string }[] {
  const builtin = (ELEMENT_DECORATIONS[elementId] || []).map((value) => ({
    value,
    label: t('audioView.decoration_' + elementId + '_' + value)
  }));
  const plugin = (variants[elementId] || []).map((v) => ({
    value: v.value,
    label: v.label,
    plugin: v.plugin
  }));
  return [...builtin, ...plugin];
}
