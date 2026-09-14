<script setup lang="ts">
import { computed } from 'vue';
import { useSettingsStore } from '@renderer/stores/settings';
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
</script>

<template>
  <section>
    <h3 class="text-sm font-semibold mb-4">{{ $t('creator.geometry') }}</h3>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-5">
      <div v-for="slider in ['radiusBox', 'radiusField', 'radiusSelector'] as const" :key="slider">
        <div class="flex justify-between text-xs text-base-content/60 mb-1.5">
          <span>{{ $t(`creator.${slider}`) }}</span>
          <span v-if="slider === 'radiusBox' && glassActive" class="text-warning">{{
            $t('creator.glassLocked')
          }}</span>
          <span v-else>{{ geomValue(slider as keyof ThemeGeometry) }}px</span>
        </div>
        <input
          type="range"
          min="0"
          max="32"
          :disabled="slider === 'radiusBox' && glassActive"
          :value="
            slider === 'radiusBox' && glassActive ? 0 : geomValue(slider as keyof ThemeGeometry)
          "
          class="w-full"
          :class="{ 'opacity-40 pointer-events-none': slider === 'radiusBox' && glassActive }"
          @input="
            updateGeometry(
              slider as keyof ThemeGeometry,
              parseInt(($event.target as HTMLInputElement).value)
            )
          "
        />
      </div>
      <div v-for="sz in ['sizeField', 'sizeSelector'] as const" :key="sz">
        <div class="flex justify-between text-xs text-base-content/60 mb-1.5">
          <span>{{ $t(`creator.${sz}`) }}</span>
          <span>×{{ geomValue(sz as keyof ThemeGeometry) }}</span>
        </div>
        <input
          type="range"
          min="1"
          max="5"
          step="1"
          :value="geomValue(sz as keyof ThemeGeometry)"
          class="w-full"
          @input="
            updateGeometry(
              sz as keyof ThemeGeometry,
              parseInt(($event.target as HTMLInputElement).value)
            )
          "
        />
      </div>
      <div>
        <div class="flex justify-between text-xs text-base-content/60 mb-1.5">
          <span>{{ $t('creator.borderWidth') }}</span>
          <span>{{ geomValue('border') }}px</span>
        </div>
        <input
          type="range"
          min="0"
          max="4"
          :value="geomValue('border')"
          class="w-full"
          @input="updateGeometry('border', parseInt(($event.target as HTMLInputElement).value))"
        />
      </div>
      <div class="flex items-center gap-6 pt-1">
        <label class="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            :checked="geomValue('depth') === 1"
            @change="updateGeometry('depth', ($event.target as HTMLInputElement).checked ? 1 : 0)"
          />
          {{ $t('creator.depth') }}
        </label>
        <label class="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            :checked="geomValue('noise') === 1"
            @change="updateGeometry('noise', ($event.target as HTMLInputElement).checked ? 1 : 0)"
          />
          {{ $t('creator.noise') }}
        </label>
      </div>
    </div>
  </section>
</template>
