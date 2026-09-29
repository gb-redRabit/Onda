import { watch, type Ref } from 'vue';
import type { AppearanceSettings } from '@renderer/types/settings';
import { resolveThemeAppearance } from '@shared/builtin-themes';
import { buildEngineVars } from '@shared/themeModel';

export function useTheme(appearanceRef: Ref<AppearanceSettings>) {
  let previewRaf = 0;
  let lastWindowMaterial: 'auto' | 'acrylic' | null = null;
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

  // The platform material follows the appearance: acrylic only for glass
  // appearances (transparency < 100), off for the opaque default. Applied on
  // every theme change, so a restart, an imported theme or the transparency
  // slider always end up in the same state — the material is set to acrylic at
  // window creation, which is wrong for the opaque default (it leaked through the
  // rounded window corners and the frames before the first paint).
  //
  // Note: do NOT paint the window background on html/body to hide that: a
  // background on the root element propagates to the whole window canvas and is
  // not clipped by its border-radius, which makes the rounded corners disappear.
  function applyWindowMode() {
    const material = (get().glassAlpha ?? 100) < 100 ? 'acrylic' : 'auto';
    if (material === lastWindowMaterial) return;
    lastWindowMaterial = material;
    void window.api?.invoke('app:setBackgroundMaterial', material);
  }

  // `appearance.animations: false` disables interface transitions/animations
  // globally (page transitions, hover fades, …). Canvas animations are JS-driven
  // and intentionally unaffected.
  function applyMotion() {
    document.documentElement.classList.toggle('no-animations', !get().animations);
  }

  function applyTheme() {
    const resolved = resolveThemeAppearance(get());
    const vars = buildEngineVars(resolved, get().fontSize);
    setVars(vars);
    // Native chrome (the <select> popup, scrollbars, checkboxes, range tracks)
    // follows the OS scheme unless the page declares one — without this the dark
    // themes rendered a light, unreadable dropdown list.
    document.documentElement.style.colorScheme = resolved.scheme;
    applyWindowMode();
    applyMotion();
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

  // One watcher instead of seven. Each of them called applyTheme() directly, so
  // importing a theme — which sets theme, customBase, customColors and geometry
  // together — rebuilt every CSS variable and sent three IPC messages four times
  // in the same tick. reapplyTheme() coalesces that into a single rAF.
  watch(
    () => {
      const a = get();
      return [
        a.theme,
        a.customBase,
        a.customColors,
        a.geometry,
        a.glassAlpha,
        a.fontSize,
        a.animations
      ];
    },
    reapplyTheme,
    { deep: true }
  );

  return { applyTheme, applyPreviewVars, reapplyTheme };
}

let engineInstance: ReturnType<typeof useTheme> | null = null;

export function getThemeEngine(appearanceRef: Ref<AppearanceSettings>) {
  if (!engineInstance) engineInstance = useTheme(appearanceRef);
  return engineInstance;
}
