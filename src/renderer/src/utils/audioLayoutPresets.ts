import type {
  AudioLayoutElement,
  AudioLayoutPreset,
  AudioLayoutSettings
} from '@renderer/types/settings';
import { AUDIO_LAYOUT_PRESETS } from '@renderer/utils/constants';

// Czyste helpery presetów układu audio wydzielone z `stores/settings.ts` (plan 2.8).
// Store zachowuje reaktywne okablowanie (`updateAppearance`) i deleguje
// matematykę snapshotów/własnych układów do tych funkcji.

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

/** Stosuje preset: zapisuje snapshot bieżącego własnego układu, odrzuca uszkodzone
 *  snapshoty i przywraca zapisany układ docelowego presetu (lub jego domyślne wartości fabryczne). */
export function computePresetLayout(
  layout: AudioLayoutSettings,
  preset: AudioLayoutPreset
): AudioLayoutSettings {
  const currentPreset = layout.preset ?? 'full';
  const customLayouts = layout.customLayouts ?? {};

  // Odrzuć uszkodzone/puste snapshoty (np. ze starszych buildów, które zapisywały
  // fabryczne układy pod każdym kluczem presetu), by presety nigdy nie wyglądały na "ten sam".
  const nextCustom: Record<string, AudioLayoutElement[]> = {};
  for (const [key, value] of Object.entries(customLayouts)) {
    if (!(key in AUDIO_LAYOUT_PRESETS)) continue;
    if (value && !isStockLayout(value)) {
      nextCustom[key] = value.map((el) => ({ ...el }));
    }
  }

  // 1. Zachowaj snapshot bieżących (być może edytowanych) elementów dla presetu,
  //    który opuszczamy, ale tylko jeśli to faktycznie własny układ.
  if (!isStockLayout(layout.elements)) {
    nextCustom[currentPreset] = layout.elements.map((el) => ({ ...el }));
  }

  // 2. Przywróć zapisany własny układ docelowego presetu, jeśli istnieje, w przeciwnym razie domyślne presetu.
  const presetElements = AUDIO_LAYOUT_PRESETS[preset];
  const elements =
    nextCustom[preset]?.map((el) => ({ ...el })) ??
    presetElements?.elements.map((el) => ({ ...el })) ??
    layout.elements;

  return { ...layout, preset, customLayouts: nextCustom, elements };
}

/** Resetuje bieżący preset: przywraca jego fabryczny układ i odrzuca jego
 *  zapisany własny snapshot. */
export function computeResetLayout(layout: AudioLayoutSettings): AudioLayoutSettings {
  const currentPreset = layout.preset ?? 'full';
  const customLayouts = { ...(layout.customLayouts ?? {}) };
  delete customLayouts[currentPreset];
  return { ...layout, elements: factoryElements(currentPreset), customLayouts };
}
