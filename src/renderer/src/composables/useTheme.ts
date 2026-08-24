import { watch, type Ref } from 'vue';
import type { AppearanceSettings } from '@renderer/types/settings';
import { resolveThemeAppearance } from '@shared/builtin-themes';
import { buildEngineVars } from '@shared/themeModel';

export function useTheme(appearanceRef: Ref<AppearanceSettings>) {
  let previewRaf = 0;
  const get = () => appearanceRef.value;

  function setVars(vars: Record<string, string>) {
    const root = document.documentElement;
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value);
    }
    root.style.fontSize = `${get().fontSize}px`;
  }

  function pushToPip(vars: Record<string, string>) {
    window.api?.send('audio-pip:theme', vars);
    window.api?.send('pip:theme', vars);
    window.api?.send('pip:locale', get().locale);
  }

  function applyTheme() {
    const vars = buildEngineVars(resolveThemeAppearance(get()), get().fontSize);
    setVars(vars);
    pushToPip(vars);
  }

  function applyPreviewVars(partial: Record<string, string>) {
    if (previewRaf) cancelAnimationFrame(previewRaf);
    previewRaf = requestAnimationFrame(() => {
      previewRaf = 0;
      const base = buildEngineVars(resolveThemeAppearance(get()), get().fontSize);
      setVars({ ...base, ...partial });
    });
  }

  function reapplyTheme() {
    if (previewRaf) cancelAnimationFrame(previewRaf);
    previewRaf = requestAnimationFrame(() => {
      previewRaf = 0;
      applyTheme();
    });
  }

  watch(() => get().theme, applyTheme);
  watch(() => get().customBase, applyTheme);
  watch(() => get().customColors, applyTheme, { deep: true });
  watch(() => get().geometry, applyTheme, { deep: true });
  watch(() => get().glassAlpha, applyTheme);
  watch(() => get().fontSize, applyTheme);

  return { applyTheme, applyPreviewVars, reapplyTheme };
}

let engineInstance: ReturnType<typeof useTheme> | null = null;

export function getThemeEngine(appearanceRef: Ref<AppearanceSettings>) {
  if (!engineInstance) engineInstance = useTheme(appearanceRef);
  return engineInstance;
}
