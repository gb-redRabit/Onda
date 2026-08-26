<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSettingsStore } from '@renderer/stores/settings';
import { resolveThemeAppearance } from '@shared/builtin-themes';
import type { Component } from 'vue';

const props = defineProps<{
  id: string;
  icon: Component;
  labelKey: string;
  description: string;
  section: string;
}>();

const emit = defineEmits<{ (e: 'select', id: string): void }>();

const settings = useSettingsStore();
const { t } = useI18n();

const resolved = computed(() => resolveThemeAppearance(settings.appearance));

const themeSwatches = computed(() => {
  const c = resolved.value.colors;
  return [c.primary, c.secondary, c.accent, c.base200];
});
</script>

<template>
  <button
    class="group relative flex flex-col items-start gap-2.5 p-4 rounded-box border border-base-300/70 bg-base-100 text-left transition-all duration-200 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none overflow-hidden"
    @click="emit('select', props.id)"
  >
    <!-- Icon -->
    <div
      class="w-10 h-10 rounded-box bg-primary/10 text-primary flex items-center justify-center transition-all duration-200 group-hover:bg-primary group-hover:text-primary-content group-hover:shadow-md group-hover:shadow-primary/20"
    >
      <component :is="props.icon" :size="18" />
    </div>

    <!-- Text -->
    <div class="min-w-0">
      <span class="text-sm font-medium text-base-content leading-tight block">
        {{ t(props.labelKey) }}
      </span>
      <span class="text-[11px] leading-snug text-base-content/50 line-clamp-2 min-h-[2.2em] mt-0.5 block">
        {{ props.description }}
      </span>
    </div>

    <!-- Mini-preview: Playback — volume -->
    <div v-if="props.id === 'playback'" class="w-full mt-auto pt-3 border-t border-base-300/60">
      <div class="flex items-center justify-between mb-1.5">
        <span class="text-[10px] text-base-content/50">{{ t('settings.defaultVolume') }}</span>
        <span class="text-[10px] font-mono text-primary font-semibold tabular-nums">
          {{ Math.round(settings.playback.defaultVolume * 100) }}%
        </span>
      </div>
      <div class="relative h-1.5 rounded-full bg-base-300 overflow-hidden">
        <div
          class="absolute inset-y-0 left-0 rounded-full bg-primary transition-all duration-200"
          :style="{ width: `${Math.round(settings.playback.defaultVolume * 100)}%` }"
        />
        <input
          type="range"
          min="0"
          max="100"
          :value="Math.round(settings.playback.defaultVolume * 100)"
          class="absolute inset-0 w-full opacity-0 cursor-pointer"
          @click.stop
          @input="settings.updatePlayback({ defaultVolume: parseInt(($event.target as HTMLInputElement).value) / 100 })"
        />
      </div>
    </div>

    <!-- Mini-preview: Theme — color swatches -->
    <div v-else-if="props.id === 'theme'" class="w-full mt-auto pt-3 border-t border-base-300/60">
      <div class="flex items-center gap-1">
        <div class="flex -space-x-1">
          <span
            v-for="(color, i) in themeSwatches"
            :key="i"
            class="w-5 h-5 rounded-full border-2 border-base-100 shadow-sm"
            :style="{ backgroundColor: color }"
          />
        </div>
        <span class="ml-auto text-[9px] text-base-content/40 font-mono uppercase tracking-wider">
          {{ settings.appearance.theme }}
        </span>
      </div>
    </div>

    <!-- Mini-preview: Network — proxy toggle -->
    <div v-else-if="props.id === 'network'" class="w-full mt-auto pt-3 border-t border-base-300/60">
      <div class="flex items-center justify-between">
        <span class="text-[10px] text-base-content/50">Proxy</span>
        <button
          type="button"
          role="switch"
          :aria-checked="settings.network.proxy.enabled"
          class="relative inline-flex h-[18px] w-[32px] shrink-0 items-center rounded-full transition-colors duration-200"
          :class="settings.network.proxy.enabled ? 'bg-primary' : 'bg-base-300'"
          @click.stop="settings.updateNetwork({ proxy: { ...settings.network.proxy, enabled: !settings.network.proxy.enabled } })"
        >
          <span
            class="inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition-transform duration-200"
            :class="settings.network.proxy.enabled ? 'translate-x-[16px]' : 'translate-x-[3px]'"
          />
        </button>
      </div>
    </div>

    <!-- Mini-preview: General — auto-launch + close to tray -->
    <div v-else-if="props.id === 'general'" class="w-full mt-auto pt-3 border-t border-base-300/60 space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-[10px] text-base-content/50 truncate flex-1 mr-2">{{ t('settings.autoLaunch') }}</span>
        <button
          type="button"
          role="switch"
          :aria-checked="settings.general.autoLaunch"
          class="relative inline-flex h-[18px] w-[32px] shrink-0 items-center rounded-full transition-colors duration-200"
          :class="settings.general.autoLaunch ? 'bg-primary' : 'bg-base-300'"
          @click.stop="settings.updateGeneral({ autoLaunch: !settings.general.autoLaunch })"
        >
          <span
            class="inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition-transform duration-200"
            :class="settings.general.autoLaunch ? 'translate-x-[16px]' : 'translate-x-[3px]'"
          />
        </button>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-[10px] text-base-content/50 truncate flex-1 mr-2">{{ t('settings.closeToTray') }}</span>
        <button
          type="button"
          role="switch"
          :aria-checked="settings.general.closeToTray"
          class="relative inline-flex h-[18px] w-[32px] shrink-0 items-center rounded-full transition-colors duration-200"
          :class="settings.general.closeToTray ? 'bg-primary' : 'bg-base-300'"
          @click.stop="settings.updateGeneral({ closeToTray: !settings.general.closeToTray })"
        >
          <span
            class="inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition-transform duration-200"
            :class="settings.general.closeToTray ? 'translate-x-[16px]' : 'translate-x-[3px]'"
          />
        </button>
      </div>
    </div>

    <!-- Mini-preview: Appearance — font size -->
    <div v-else-if="props.id === 'appearance'" class="w-full mt-auto pt-3 border-t border-base-300/60">
      <div class="flex items-center justify-between mb-1.5">
        <span class="text-[10px] text-base-content/50">{{ t('settings.fontSize') }}</span>
        <span class="text-[10px] font-mono text-primary font-semibold tabular-nums">
          {{ settings.appearance.fontSize }}px
        </span>
      </div>
      <div class="relative h-1.5 rounded-full bg-base-300 overflow-hidden">
        <div
          class="absolute inset-y-0 left-0 rounded-full bg-primary transition-all duration-200"
          :style="{ width: `${((settings.appearance.fontSize - 12) / 6) * 100}%` }"
        />
        <input
          type="range"
          min="12"
          max="18"
          :value="settings.appearance.fontSize"
          class="absolute inset-0 w-full opacity-0 cursor-pointer"
          @click.stop
          @input="settings.updateAppearance({ fontSize: parseInt(($event.target as HTMLInputElement).value) })"
        />
      </div>
    </div>
  </button>
</template>

<style scoped>
input[type='range'] {
  -webkit-appearance: none;
  appearance: none;
  height: 100%;
  background: transparent;
  margin: 0;
}
input[type='range']::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 10px;
  height: 10px;
  background: white;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}
</style>
