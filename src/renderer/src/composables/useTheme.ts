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

  // Materiał platformy podąża za wyglądem: acrylic tylko dla szklanych
  // wyglądów (przezroczystość < 100), wyłączony dla nieprzezroczystego domyślnego. Stosowane przy
  // każdej zmianie motywu, więc restart, zaimportowany motyw lub suwak
  // przezroczystości zawsze kończą w tym samym stanie — materiał jest ustawiany na acrylic przy
  // tworzeniu okna, co jest błędne dla nieprzezroczystego domyślnego (przeciekało przez
  // zaokrąglone narożniki okna i ramki przed pierwszym malowaniem).
  //
  // Uwaga: NIE maluj tła okna na html/body, żeby to ukryć: tło
  // na elemencie głównym propaguje się na całe płótno okna i nie jest
  // przycinane przez jego border-radius, co sprawia, że zaokrąglone narożniki znikają.
  function applyWindowMode() {
    const material = (get().glassAlpha ?? 100) < 100 ? 'acrylic' : 'auto';
    if (material === lastWindowMaterial) return;
    lastWindowMaterial = material;
    void window.api?.invoke('app:setBackgroundMaterial', material);
  }

  // `appearance.animations: false` globalnie wyłącza przejścia/animacje interfejsu
  // (przejścia stron, zanikanie hover, …). Animacje canvas są sterowane przez JS
  // i celowo pozostają bez zmian.
  function applyMotion() {
    document.documentElement.classList.toggle('no-animations', !get().animations);
  }

  function applyTheme() {
    const resolved = resolveThemeAppearance(get());
    const vars = buildEngineVars(resolved, get().fontSize);
    setVars(vars);
    // Natywny chrome (popup <select>, paski przewijania, checkboxy, tory range)
    // podąża za schematem OS, chyba że strona zadeklaruje własny — bez tego ciemne
    // motywy renderowały jasną, nieczytelną listę rozwijaną.
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

  // Jeden watcher zamiast siedmiu. Każdy z nich wywoływał applyTheme() bezpośrednio, więc
  // import motywu — który ustawia razem theme, customBase, customColors i geometry
  // — przebudowywał każdą zmienną CSS i wysyłał trzy wiadomości IPC cztery razy
  // w tym samym ticku. reapplyTheme() scala to w jeden rAF.
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
