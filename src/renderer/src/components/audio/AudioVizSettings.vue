<script setup lang="ts">
import { computed } from 'vue';
import { useSettingsStore } from '@renderer/stores/settings';
import type { VisualizationMode } from '@renderer/types/settings';

const settings = useSettingsStore();
const viz = computed(() => settings.playback.visualization);
const audioLayout = computed(() => settings.appearance.audioLayout);
const autoHideDelay = computed(() => audioLayout.value?.autoHideDelay ?? 3000);
const hudOpacity = computed(() => audioLayout.value?.hudOpacity ?? 100);
const vizQuality = computed(() => audioLayout.value?.vizQuality ?? 'high');

const modes: { value: VisualizationMode; label: string }[] = [
  { value: 'bars', label: 'Bars' },
  { value: 'spectrum', label: 'Spectrum' },
  { value: 'wave', label: 'Wave' },
  { value: 'radial', label: 'Radial' },
  { value: 'rings', label: 'Rings' },
  { value: 'circle', label: 'Circle' },
  { value: 'particles', label: 'Particles' },
  { value: 'none', label: 'Off' }
];

function update(partial: Partial<typeof viz.value>) {
  settings.updatePlayback({ visualization: { ...viz.value, ...partial } });
}

function updateLayout(partial: Record<string, unknown>) {
  settings.updateAppearance({
    audioLayout: { ...audioLayout.value, ...partial }
  });
}
</script>

<template>
  <div class="p-3 bg-base-100 border border-base-300 rounded-box shadow-xl min-w-55 space-y-3">
    <div>
      <label
        class="text-[10px] font-semibold uppercase tracking-wider text-base-content/50 mb-1.5 block"
        >{{ $t('audioView.vizModeLabel') }}</label
      >
      <div class="flex flex-wrap gap-1">
        <button
          v-for="m in modes"
          :key="m.value"
          class="fx-noise px-2 py-1 fx-depth rounded-field text-[11px] font-medium transition-colors"
          :class="
            viz.mode === m.value
              ? 'bg-primary text-primary-content'
              : 'bg-base-100 text-base-content/70 hover:text-base-content hover:bg-base-content/10'
          "
          @click="update({ mode: m.value })"
        >
          {{ m.label }}
        </button>
      </div>
    </div>

    <div>
      <label
        class="text-[10px] font-semibold uppercase tracking-wider text-base-content/50 mb-1.5 block"
        >{{ $t('audioView.vizPrimaryColor') }}</label
      >
      <div class="flex items-center gap-2">
        <input
          type="color"
          :value="viz.primaryColor"
          class="w-8 h-8 fx-depth rounded-field cursor-pointer border-0 p-0"
          @input="(e: Event) => update({ primaryColor: (e.target as HTMLInputElement).value })"
        />
        <span class="text-[11px] font-mono text-base-content/70">{{ viz.primaryColor }}</span>
      </div>
    </div>

    <div>
      <label
        class="text-[10px] font-semibold uppercase tracking-wider text-base-content/50 mb-1.5 block"
        >{{ $t('audioView.vizSecondaryColor') }}</label
      >
      <div class="flex items-center gap-2">
        <input
          type="color"
          :value="viz.secondaryColor"
          class="w-8 h-8 fx-depth rounded-field cursor-pointer border-0 p-0"
          @input="(e: Event) => update({ secondaryColor: (e.target as HTMLInputElement).value })"
        />
        <span class="text-[11px] font-mono text-base-content/70">{{ viz.secondaryColor }}</span>
      </div>
    </div>

    <div>
      <label
        class="text-[10px] font-semibold uppercase tracking-wider text-base-content/50 mb-1.5 block"
        >{{ $t('audioView.vizSensitivity') }}: {{ Math.round(viz.sensitivity * 100) }}%</label
      >
      <input
        type="range"
        min="0.1"
        max="1"
        step="0.01"
        :value="viz.sensitivity"
        class="w-full accent-primary"
        @input="
          (e: Event) => update({ sensitivity: parseFloat((e.target as HTMLInputElement).value) })
        "
      />
    </div>

    <div>
      <label
        class="text-[10px] font-semibold uppercase tracking-wider text-base-content/50 mb-1.5 block"
        >{{ $t('audioView.vizSmoothing') }}: {{ Math.round(viz.smoothing * 100) }}%</label
      >
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        :value="viz.smoothing"
        class="w-full accent-primary"
        @input="
          (e: Event) => update({ smoothing: parseFloat((e.target as HTMLInputElement).value) })
        "
      />
    </div>

    <div>
      <label
        class="text-[10px] font-semibold uppercase tracking-wider text-base-content/50 mb-1.5 block"
        >{{ $t('audioView.vizFpsCap') }}: {{ viz.fpsCap }}</label
      >
      <input
        type="range"
        min="15"
        max="120"
        step="1"
        :value="viz.fpsCap"
        class="w-full accent-primary"
        @input="
          (e: Event) => update({ fpsCap: parseInt((e.target as HTMLInputElement).value) })
        "
      />
    </div>

    <div class="border-t border-base-300 pt-3 space-y-3">
      <div>
        <label
          class="text-[10px] font-semibold uppercase tracking-wider text-base-content/50 mb-1.5 block"
          >{{ $t('audioView.autoHideDelay') }}: {{ autoHideDelay }}ms</label
        >
        <input
          type="range"
          min="0"
          max="10000"
          step="500"
          :value="autoHideDelay"
          class="w-full accent-primary"
          @input="(e: Event) => updateLayout({ autoHideDelay: parseInt((e.target as HTMLInputElement).value) })"
        />
      </div>

      <div>
        <label
          class="text-[10px] font-semibold uppercase tracking-wider text-base-content/50 mb-1.5 block"
          >{{ $t('audioView.hudOpacity') }}: {{ hudOpacity }}%</label
        >
        <input
          type="range"
          min="10"
          max="100"
          step="1"
          :value="hudOpacity"
          class="w-full accent-primary"
          @input="(e: Event) => updateLayout({ hudOpacity: parseInt((e.target as HTMLInputElement).value) })"
        />
      </div>

      <div>
        <label
          class="text-[10px] font-semibold uppercase tracking-wider text-base-content/50 mb-1.5 block"
          >{{ $t('audioView.vizQuality') }}</label
        >
        <div class="flex gap-1">
          <button
            v-for="q in (['low', 'medium', 'high'] as const)"
            :key="q"
            class="fx-noise px-2 py-1 fx-depth rounded-field text-[11px] font-medium transition-colors"
            :class="vizQuality === q ? 'bg-primary text-primary-content' : 'bg-base-100 text-base-content/70 hover:text-base-content hover:bg-base-content/10'"
            @click="updateLayout({ vizQuality: q })"
          >
            {{ q }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
