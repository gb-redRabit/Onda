<script setup lang="ts">
import { PictureInPicture, Tv2 } from '@lucide/vue';
import { useSettingsStore } from '@renderer/stores/settings';
import SettingsToggle from '@renderer/components/settings/SettingsToggle.vue';

const settings = useSettingsStore();

const docks = [
  { id: 'bottom-right' as const },
  { id: 'bottom' as const },
  { id: 'right' as const }
];
</script>

<template>
  <div>
    <h3 class="text-lg font-bold tracking-tight mb-1.5">{{ $t('wizard.pipTitle') }}</h3>
    <p class="text-sm text-base-content/70">{{ $t('wizard.pipDesc') }}</p>

    <div class="mt-5 space-y-3">
      <div
        class="flex items-start gap-3 p-3.5 fx-depth rounded-box border border-base-300 bg-base-200/(--glass-alpha)"
      >
        <span
          class="w-9 h-9 shrink-0 rounded-field bg-primary/15 text-primary flex items-center justify-center"
        >
          <Tv2 :size="17" />
        </span>
        <div class="min-w-0">
          <div class="text-sm font-medium">{{ $t('wizard.pipVideo') }}</div>
          <p class="text-xs text-base-content/55 mt-0.5">{{ $t('wizard.pipVideoDesc') }}</p>
        </div>
      </div>

      <div
        class="flex items-start gap-3 p-3.5 fx-depth rounded-box border border-base-300 bg-base-200/(--glass-alpha)"
      >
        <span
          class="w-9 h-9 shrink-0 rounded-field bg-primary/15 text-primary flex items-center justify-center"
        >
          <PictureInPicture :size="17" />
        </span>
        <div class="min-w-0">
          <div class="text-sm font-medium">{{ $t('wizard.pipAudio') }}</div>
          <p class="text-xs text-base-content/55 mt-0.5">{{ $t('wizard.pipAudioDesc') }}</p>
        </div>
      </div>

      <div class="flex items-center justify-between gap-4 p-1">
        <label for="wizard-pip-autoshow" class="text-sm cursor-pointer select-none">
          {{ $t('settings.audioPipAutoShow') }}
        </label>
        <SettingsToggle
          id="wizard-pip-autoshow"
          :model-value="settings.appearance.audioPipAutoShow"
          @update:model-value="settings.updateAppearance({ audioPipAutoShow: $event })"
        />
      </div>

      <div class="p-1">
        <div class="text-sm mb-2">{{ $t('settings.audioPipDock') }}</div>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="m in docks"
            :key="m.id"
            class="px-3.5 py-2 fx-depth rounded-field text-sm font-medium border transition-colors"
            :class="
              settings.appearance.audioPipDock === m.id
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-base-300 text-base-content/70 hover:bg-base-content/5'
            "
            @click="settings.updateAppearance({ audioPipDock: m.id })"
          >
            {{ m.id }}
          </button>
        </div>
      </div>
    </div>

    <p class="mt-3 text-xs text-base-content/50 leading-relaxed">{{ $t('wizard.pipNote') }}</p>
  </div>
</template>
