<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSettingsStore } from '@renderer/stores/settings';
import type { VisualizationMode } from '@renderer/types/settings';

const { t } = useI18n();
const settings = useSettingsStore();
const viz = computed(() => settings.playback.visualization);
const audioLayout = computed(() => settings.appearance.audioLayout);
const vizQuality = computed(() => audioLayout.value?.vizQuality ?? 'high');

// Lokalny podgląd hudOpacity (zatwierdzanie przy zmianie — brak zapisu do store na każdy mousemove)
const hudOpacityInput = ref(audioLayout.value?.hudOpacity ?? 100);

watch(audioLayout, (l) => {
  hudOpacityInput.value = l?.hudOpacity ?? 100;
});

function commitHudOpacity() {
  updateLayout({ hudOpacity: hudOpacityInput.value });
}

const modes: { value: VisualizationMode; labelKey: string }[] = [
  { value: 'splash', labelKey: 'audioView.vizModeSplash' },
  { value: 'bars', labelKey: 'audioView.vizModeBars' },
  { value: 'spectrum', labelKey: 'audioView.vizModeSpectrum' },
  { value: 'wave', labelKey: 'audioView.vizModeWave' },
  { value: 'radial', labelKey: 'audioView.vizModeRadial' },
  { value: 'rings', labelKey: 'audioView.vizModeRings' },
  { value: 'circle', labelKey: 'audioView.vizModeCircle' },
  { value: 'particles', labelKey: 'audioView.vizModeParticles' },
  { value: 'none', labelKey: 'audioView.vizModeNone' }
];

const qualities = ['low', 'medium', 'high'] as const;
const qualityLabel = (q: (typeof qualities)[number]): string =>
  t(`audioView.vizQuality${q.charAt(0).toUpperCase()}${q.slice(1)}`);

// FPS jako segmenty: suwak 15–120 wymagał trafienia w wartość, a liczy się
// kilka sensownych progów. Bieżąca wartość spoza listy zostaje dopisana.
const FPS_OPTIONS = [30, 60, 90, 120];
const fpsOptions = computed(() => {
  const current = viz.value.fpsCap;
  return FPS_OPTIONS.includes(current)
    ? FPS_OPTIONS
    : [...FPS_OPTIONS, current].sort((a, b) => a - b);
});

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
  <div class="min-w-55 space-y-3 rounded-box border border-base-300 bg-base-100 p-3 shadow-xl">
    <div>
      <p class="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-base-content/50">
        {{ t('audioView.vizModeLabel') }}
      </p>
      <div class="flex flex-wrap gap-1">
        <button
          v-for="m in modes"
          :key="m.value"
          class="fx-noise rounded-field px-2 py-1 text-2xs font-medium fx-depth transition-colors"
          :class="
            viz.mode === m.value
              ? 'bg-primary text-primary-content'
              : 'bg-base-100 text-base-content/70 hover:bg-base-content/10 hover:text-base-content'
          "
          :aria-pressed="viz.mode === m.value"
          @click="update({ mode: m.value })"
        >
          {{ t(m.labelKey) }}
        </button>
      </div>
    </div>

    <div>
      <p class="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-base-content/50">
        {{ t('audioView.vizPrimaryColor') }}
      </p>
      <div class="flex items-center gap-2">
        <input
          type="color"
          :value="viz.primaryColor"
          class="h-8 w-8 cursor-pointer rounded-field border-0 p-0 fx-depth"
          :aria-label="t('audioView.vizPrimaryColor')"
          @input="(e: Event) => update({ primaryColor: (e.target as HTMLInputElement).value })"
        />
        <span class="font-mono text-2xs text-base-content/70">{{ viz.primaryColor }}</span>
      </div>
    </div>

    <div>
      <p class="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-base-content/50">
        {{ t('audioView.vizSecondaryColor') }}
      </p>
      <div class="flex items-center gap-2">
        <input
          type="color"
          :value="viz.secondaryColor"
          class="h-8 w-8 cursor-pointer rounded-field border-0 p-0 fx-depth"
          :aria-label="t('audioView.vizSecondaryColor')"
          @input="(e: Event) => update({ secondaryColor: (e.target as HTMLInputElement).value })"
        />
        <span class="font-mono text-2xs text-base-content/70">{{ viz.secondaryColor }}</span>
      </div>
    </div>

    <div>
      <div class="mb-1.5 flex items-baseline justify-between gap-2">
        <span class="text-2xs font-semibold uppercase tracking-wider text-base-content/50">
          {{ t('audioView.vizSensitivity') }}
        </span>
        <span class="text-2xs font-medium tabular-nums text-base-content/70"
          >{{ Math.round(viz.sensitivity * 100) }}%</span
        >
      </div>
      <input
        type="range"
        min="0.1"
        max="1"
        step="0.01"
        :value="viz.sensitivity"
        class="w-full accent-primary"
        :aria-label="t('audioView.vizSensitivity')"
        @input="
          (e: Event) => update({ sensitivity: parseFloat((e.target as HTMLInputElement).value) })
        "
      />
    </div>

    <div>
      <div class="mb-1.5 flex items-baseline justify-between gap-2">
        <span class="text-2xs font-semibold uppercase tracking-wider text-base-content/50">
          {{ t('audioView.vizSmoothing') }}
        </span>
        <span class="text-2xs font-medium tabular-nums text-base-content/70"
          >{{ Math.round(viz.smoothing * 100) }}%</span
        >
      </div>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        :value="viz.smoothing"
        class="w-full accent-primary"
        :aria-label="t('audioView.vizSmoothing')"
        @input="
          (e: Event) => update({ smoothing: parseFloat((e.target as HTMLInputElement).value) })
        "
      />
    </div>

    <div>
      <div class="mb-1.5 flex items-baseline justify-between gap-2">
        <span class="text-2xs font-semibold uppercase tracking-wider text-base-content/50">
          {{ t('audioView.vizFpsCap') }}
        </span>
        <span class="text-2xs font-medium tabular-nums text-base-content/70">{{ viz.fpsCap }}</span>
      </div>
      <div class="flex flex-wrap gap-1">
        <button
          v-for="fps in fpsOptions"
          :key="fps"
          class="fx-noise rounded-field px-2 py-1 text-2xs font-medium tabular-nums fx-depth transition-colors"
          :class="
            viz.fpsCap === fps
              ? 'bg-primary text-primary-content'
              : 'bg-base-100 text-base-content/70 hover:bg-base-content/10 hover:text-base-content'
          "
          :aria-pressed="viz.fpsCap === fps"
          @click="update({ fpsCap: fps })"
        >
          {{ fps }}
        </button>
      </div>
    </div>

    <div class="space-y-3 border-t border-base-300 pt-3">
      <div>
        <div class="mb-1.5 flex items-baseline justify-between gap-2">
          <span class="text-2xs font-semibold uppercase tracking-wider text-base-content/50">
            {{ t('audioView.hudOpacity') }}
          </span>
          <span class="text-2xs font-medium tabular-nums text-base-content/70"
            >{{ hudOpacityInput }}%</span
          >
        </div>
        <input
          v-model.number="hudOpacityInput"
          type="range"
          min="10"
          max="100"
          step="1"
          class="w-full accent-primary"
          :aria-label="t('audioView.hudOpacity')"
          @change="commitHudOpacity"
        />
      </div>

      <div>
        <p class="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-base-content/50">
          {{ t('audioView.vizQuality') }}
        </p>
        <div class="flex gap-1">
          <button
            v-for="q in qualities"
            :key="q"
            class="fx-noise rounded-field px-2 py-1 text-2xs font-medium fx-depth transition-colors"
            :class="
              vizQuality === q
                ? 'bg-primary text-primary-content'
                : 'bg-base-100 text-base-content/70 hover:bg-base-content/10 hover:text-base-content'
            "
            :aria-pressed="vizQuality === q"
            @click="updateLayout({ vizQuality: q })"
          >
            {{ qualityLabel(q) }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
