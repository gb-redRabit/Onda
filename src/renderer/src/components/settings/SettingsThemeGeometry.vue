<script setup lang="ts">
import { computed } from 'vue';
import { useSettingsStore } from '@renderer/stores/settings';
import Slider from '@renderer/components/ui/Slider.vue';
import { DEFAULT_GEOMETRY, type ThemeGeometry } from '@shared/themeModel';

const settings = useSettingsStore();
const glassActive = computed(() => (settings.appearance.glassAlpha ?? 100) < 100);

function updateGeometry<K extends keyof ThemeGeometry>(key: K, value: ThemeGeometry[K]) {
  settings.updateAppearance({
    geometry: { ...(settings.appearance.geometry ?? {}), [key]: value }
  });
}

function geomValue(key: keyof ThemeGeometry): number {
  return settings.appearance.geometry?.[key] ?? DEFAULT_GEOMETRY[key];
}

const radiusKeys = ['radiusBox', 'radiusField', 'radiusSelector'] as const;
const sizeKeys = ['sizeField', 'sizeSelector'] as const;
</script>

<template>
  <section>
    <h3 class="mb-4 text-sm font-semibold">{{ $t('creator.geometry') }}</h3>
    <div class="grid grid-cols-1 gap-x-10 gap-y-5 lg:grid-cols-2">
      <div v-for="key in radiusKeys" :key="key">
        <div class="mb-1.5 flex justify-between text-xs text-base-content/60">
          <span>{{ $t(`creator.${key}`) }}</span>
          <span v-if="key === 'radiusBox' && glassActive" class="text-warning">{{
            $t('creator.glassLocked')
          }}</span>
          <span v-else>{{ geomValue(key) }}px</span>
        </div>
        <Slider
          :model-value="key === 'radiusBox' && glassActive ? 0 : geomValue(key)"
          :label="$t(`creator.${key}`)"
          :min="0"
          :max="32"
          :disabled="key === 'radiusBox' && glassActive"
          :value-text="`${geomValue(key)} px`"
          @update:model-value="updateGeometry(key, $event)"
        />
      </div>

      <div v-for="key in sizeKeys" :key="key">
        <div class="mb-1.5 flex justify-between text-xs text-base-content/60">
          <span>{{ $t(`creator.${key}`) }}</span>
          <span>×{{ geomValue(key) }}</span>
        </div>
        <Slider
          :model-value="geomValue(key)"
          :label="$t(`creator.${key}`)"
          :min="1"
          :max="5"
          :step="1"
          :value-text="`×${geomValue(key)}`"
          @update:model-value="updateGeometry(key, $event)"
        />
      </div>

      <div>
        <div class="mb-1.5 flex justify-between text-xs text-base-content/60">
          <span>{{ $t('creator.borderWidth') }}</span>
          <span>{{ geomValue('border') }}px</span>
        </div>
        <Slider
          :model-value="geomValue('border')"
          :label="$t('creator.borderWidth')"
          :min="0"
          :max="4"
          :value-text="`${geomValue('border')} px`"
          @update:model-value="updateGeometry('border', $event)"
        />
      </div>

      <div>
        <div class="mb-1.5 flex justify-between text-xs text-base-content/60">
          <span>{{ $t('creator.depth') }}</span>
          <span>{{ geomValue('depth').toFixed(1) }}×</span>
        </div>
        <Slider
          :model-value="geomValue('depth')"
          data-testid="settings-depth-slider"
          :label="$t('creator.depth')"
          :min="0"
          :max="3"
          :step="0.5"
          :value-text="`${geomValue('depth').toFixed(1)}×`"
          @update:model-value="updateGeometry('depth', $event)"
        />
      </div>

      <div>
        <div class="mb-1.5 flex justify-between text-xs text-base-content/60">
          <span>{{ $t('creator.noise') }}</span>
          <span>{{ Math.round(geomValue('noise') * 100) }}%</span>
        </div>
        <Slider
          :model-value="geomValue('noise')"
          data-testid="settings-noise-slider"
          :label="$t('creator.noise')"
          :min="0"
          :max="1"
          :step="0.1"
          :value-text="`${Math.round(geomValue('noise') * 100)}%`"
          @update:model-value="updateGeometry('noise', $event)"
        />
      </div>
    </div>
  </section>
</template>
