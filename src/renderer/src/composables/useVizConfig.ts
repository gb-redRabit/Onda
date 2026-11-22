import { onScopeDispose, reactive, ref, watch } from 'vue';
import { useSettingsStore } from '@renderer/stores/settings';
import { qualityPreset } from '@renderer/utils/audioVisualizer';
import { resolveVizColor } from '@renderer/utils/vizColors';

// Zbuforowana konfiguracja wizualizacji (unika dotykania proxy Pinia co klatkę) i
// rozwiązany preset jakości. Wizualizator destrukturyzuje zwrócone wartości.
export function useVizConfig() {
  const settings = useSettingsStore();
  const viz = () => settings.playback.visualization;

  const getQuality = () => qualityPreset(settings.appearance.audioLayout?.vizQuality);

  const vizCfg = reactive({
    fpsCap: (viz().fpsCap as number) || 60,
    primaryColor: resolveVizColor(viz().primaryColor, 'primary'),
    secondaryColor: resolveVizColor(viz().secondaryColor, 'secondary'),
    sensitivity: viz().sensitivity || 0.5,
    smoothing: viz().smoothing ?? 0.8
  });

  const quality = ref(getQuality());

  // Kolory domyślne czytamy z aktualnie zastosowanych zmiennych motywu. Jeden
  // MutationObserver wystarcza dla zmiany motywu, trybu systemowego i podglądu
  // w kreatorze — wszystkie kończą się ustawieniem CSS vars na <html>.
  function refreshColors(): void {
    vizCfg.primaryColor = resolveVizColor(viz().primaryColor, 'primary');
    vizCfg.secondaryColor = resolveVizColor(viz().secondaryColor, 'secondary');
  }

  watch(
    () => viz(),
    (v) => {
      vizCfg.fpsCap = v.fpsCap || 60;
      vizCfg.sensitivity = v.sensitivity || 0.5;
      vizCfg.smoothing = v.smoothing ?? 0.8;
      refreshColors();
    },
    { deep: true }
  );

  let colorFrame = 0;
  const observer =
    typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver(() => {
          if (typeof requestAnimationFrame !== 'function') {
            refreshColors();
            return;
          }
          cancelAnimationFrame(colorFrame);
          colorFrame = requestAnimationFrame(() => {
            colorFrame = 0;
            refreshColors();
          });
        });
  if (observer && typeof document !== 'undefined') {
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
  }

  onScopeDispose(() => {
    observer?.disconnect();
    if (colorFrame) cancelAnimationFrame(colorFrame);
  });

  watch(
    () => settings.appearance.audioLayout?.vizQuality,
    () => {
      quality.value = getQuality();
    }
  );

  return { vizCfg, quality };
}
