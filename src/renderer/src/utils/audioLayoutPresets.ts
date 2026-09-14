import type {
  AudioLayoutElement,
  AudioLayoutPreset,
  AudioLayoutSettings
} from '@renderer/types/settings';
import { AUDIO_LAYOUT_PRESETS } from '@renderer/utils/constants';

// Pure audio-layout preset helpers extracted from `stores/settings.ts` (plan 2.8).
// The store keeps the reactive wiring (`updateAppearance`) and delegates the
// snapshot/custom-layout math to these functions.

export function audioLayoutsEqual(a: AudioLayoutElement[], b: AudioLayoutElement[]): boolean {
  if (a.length !== b.length) return false;
  for (const elA of a) {
    const elB = b.find((el) => el.id === elA.id);
    if (
      !elB ||
      elA.x !== elB.x ||
      elA.y !== elB.y ||
      elA.width !== elB.width ||
      elA.height !== elB.height ||
      (elA.layer ?? 0) !== (elB.layer ?? 0) ||
      (elA.visible ?? true) !== (elB.visible ?? true) ||
      (elA.variant ?? '') !== (elB.variant ?? '')
    ) {
      return false;
    }
  }
  return true;
}

export function factoryElements(preset: AudioLayoutPreset): AudioLayoutElement[] {
  return (
    AUDIO_LAYOUT_PRESETS[preset]?.elements.map((el) => ({ ...el })) ??
    AUDIO_LAYOUT_PRESETS.full.elements.map((el) => ({ ...el }))
  );
}

export function isStockLayout(elements: AudioLayoutElement[]): boolean {
  for (const key of Object.keys(AUDIO_LAYOUT_PRESETS)) {
    if (audioLayoutsEqual(elements, factoryElements(key as AudioLayoutPreset))) return true;
  }
  return false;
}

/** Applies a preset: snapshots the current custom layout, drops corrupt snapshots
 *  and restores the target preset's saved layout (or its factory defaults). */
export function computePresetLayout(
  layout: AudioLayoutSettings,
  preset: AudioLayoutPreset
): AudioLayoutSettings {
  const currentPreset = layout.preset ?? 'full';
  const customLayouts = layout.customLayouts ?? {};

  // Drop corrupt/no-op snapshots (e.g. from older builds that stored stock layouts
  // under every preset key) so presets never appear to be "the same one".
  const nextCustom: Record<string, AudioLayoutElement[]> = {};
  for (const [key, value] of Object.entries(customLayouts)) {
    if (!(key in AUDIO_LAYOUT_PRESETS)) continue;
    if (value && !isStockLayout(value)) {
      nextCustom[key] = value.map((el) => ({ ...el }));
    }
  }

  // 1. Keep a snapshot of the current (possibly edited) elements for the preset we are
  //    leaving, but only if it is a genuine custom layout.
  if (!isStockLayout(layout.elements)) {
    nextCustom[currentPreset] = layout.elements.map((el) => ({ ...el }));
  }

  // 2. Restore the target preset's saved custom layout if it exists, else the preset defaults.
  const presetElements = AUDIO_LAYOUT_PRESETS[preset];
  const elements =
    nextCustom[preset]?.map((el) => ({ ...el })) ??
    presetElements?.elements.map((el) => ({ ...el })) ??
    layout.elements;

  return { ...layout, preset, customLayouts: nextCustom, elements };
}

/** Resets the current preset: restores its factory layout and discards its
 *  saved custom snapshot. */
export function computeResetLayout(layout: AudioLayoutSettings): AudioLayoutSettings {
  const currentPreset = layout.preset ?? 'full';
  const customLayouts = { ...(layout.customLayouts ?? {}) };
  delete customLayouts[currentPreset];
  return { ...layout, elements: factoryElements(currentPreset), customLayouts };
}
