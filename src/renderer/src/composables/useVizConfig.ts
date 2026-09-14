import { reactive, ref, watch } from 'vue';
import { useSettingsStore } from '@renderer/stores/settings';
import { qualityPreset } from '@renderer/utils/audioVisualizer';

// Cached visualization config (avoids touching the Pinia proxy every frame) and
// the resolved quality preset. The visualizer destructures the returned values.
export function useVizConfig() {
  const settings = useSettingsStore();

  const getQuality = () => qualityPreset(settings.appearance.audioLayout?.vizQuality);

  const vizCfg = reactive({
    fpsCap: (settings.playback.visualization.fpsCap as number) || 60,
    primaryColor: settings.playback.visualization.primaryColor || '#8b7cf0',
    secondaryColor: settings.playback.visualization.secondaryColor || '#4f46e5',
    sensitivity: settings.playback.visualization.sensitivity || 0.5,
    smoothing: settings.playback.visualization.smoothing ?? 0.8
  });

  const quality = ref(getQuality());

  watch(
    () => settings.playback.visualization,
    (v) => {
      vizCfg.fpsCap = v.fpsCap || 60;
      vizCfg.primaryColor = v.primaryColor || '#8b7cf0';
      vizCfg.secondaryColor = v.secondaryColor || '#4f46e5';
      vizCfg.sensitivity = v.sensitivity || 0.5;
      vizCfg.smoothing = v.smoothing ?? 0.8;
    },
    { deep: true }
  );

  watch(
    () => settings.appearance.audioLayout?.vizQuality,
    () => {
      quality.value = getQuality();
    }
  );

  return { vizCfg, quality };
}
