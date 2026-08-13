<script setup lang="ts">
import { ref, watch, computed, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSettingsStore } from '@renderer/stores/settings';
import type { AppSettings } from '@renderer/types/settings';
import {
  CornerUpRight,
  CornerUpLeft,
  CornerDownRight,
  CornerDownLeft,
  PanelTop,
  PanelBottom
} from '@lucide/vue';
import SettingsPanel from '@renderer/components/settings/SettingsPanel.vue';
import SettingsCard from '@renderer/components/settings/SettingsCard.vue';
import SettingsSectionTitle from '@renderer/components/settings/SettingsSectionTitle.vue';
import SettingsRow from '@renderer/components/settings/SettingsRow.vue';
import SettingsToggle from '@renderer/components/settings/SettingsToggle.vue';
import SettingsPositionGrid from '@renderer/components/settings/SettingsPositionGrid.vue';

const settings = useSettingsStore();
const { t } = useI18n();

const audioPipModes = [
  { id: 'minimal' as const, labelKey: 'settings.pipMinimal' },
  { id: 'medium' as const, labelKey: 'settings.pipMedium' },
  { id: 'max' as const, labelKey: 'settings.pipMax' },
  { id: 'wide' as const, labelKey: 'settings.pipWide' }
];

const cornerPositions = [
  { id: 'top-left' as const, labelKey: 'settings.topLeft', row: 0, col: 0, icon: CornerUpLeft },
  { id: 'top-right' as const, labelKey: 'settings.topRight', row: 0, col: 1, icon: CornerUpRight },
  {
    id: 'bottom-left' as const,
    labelKey: 'settings.bottomLeft',
    row: 1,
    col: 0,
    icon: CornerDownLeft
  },
  {
    id: 'bottom-right' as const,
    labelKey: 'settings.bottomRight',
    row: 1,
    col: 1,
    icon: CornerDownRight
  }
];

const edgePositions = [
  { id: 'top' as const, labelKey: 'settings.pipTop', icon: PanelTop },
  { id: 'bottom' as const, labelKey: 'settings.pipBottom', icon: PanelBottom }
];

const isAudioEdgeMode = computed(
  () => settings.appearance.audioPipMode === 'max' || settings.appearance.audioPipMode === 'wide'
);

const audioPositions = computed(() => (isAudioEdgeMode.value ? edgePositions : cornerPositions));

const audioPositionOptions = computed(() =>
  audioPositions.value.map((p) => ({ id: p.id, label: t(p.labelKey), icon: p.icon }))
);

const audioPreviewOpen = ref(false);

function setAudioPosition(id: string): void {
  if (isAudioEdgeMode.value) {
    settings.updateAppearance({
      audioPipEdgePosition: id as AppSettings['appearance']['audioPipEdgePosition']
    });
  } else {
    settings.updateAppearance({
      audioPipPosition: id as AppSettings['appearance']['audioPipPosition']
    });
  }
}

function audioPreviewOptions() {
  return {
    mode: settings.appearance.audioPipMode,
    position: isAudioEdgeMode.value
      ? settings.appearance.audioPipEdgePosition
      : settings.appearance.audioPipPosition,
    opacity: settings.appearance.audioPipOpacity
  };
}

async function toggleAudioPreview() {
  if (audioPreviewOpen.value) {
    await window.api?.audioPipPreviewStop();
    audioPreviewOpen.value = false;
    return;
  }
  const started = await window.api?.audioPipPreviewStart(audioPreviewOptions());
  if (started) audioPreviewOpen.value = true;
}

watch(
  () => [
    settings.appearance.audioPipMode,
    settings.appearance.audioPipEdgePosition,
    settings.appearance.audioPipPosition,
    settings.appearance.audioPipOpacity
  ],
  () => {
    if (audioPreviewOpen.value) {
      window.api?.audioPipPreviewUpdate(audioPreviewOptions());
    }
  }
);

onBeforeUnmount(() => {
  if (audioPreviewOpen.value) void window.api?.audioPipPreviewStop();
});
</script>

<template>
  <SettingsPanel :title="$t('settings.pipAudio')" :description="$t('settings.pipAudioDesc')">
    <SettingsCard>
      <div class="flex items-center justify-between pb-4 border-b border-border-default">
        <SettingsSectionTitle :title="$t('settings.audioPipSection')" class="mb-0!" />
        <button
          class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          :class="
            audioPreviewOpen
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
              : 'bg-accent-base text-white hover:bg-accent-hover'
          "
          @click="toggleAudioPreview"
        >
          {{ audioPreviewOpen ? $t('settings.closePreview') : $t('settings.showPreview') }}
        </button>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-1">
        <span class="text-sm">{{ $t('settings.audioPipMode') }}</span>
        <div class="flex gap-1 bg-bg-base rounded-xl p-1">
          <button
            v-for="m in audioPipModes"
            :key="m.id"
            class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            :class="
              settings.appearance.audioPipMode === m.id
                ? 'bg-accent-base text-white'
                : 'text-fg-muted hover:text-fg-base'
            "
            @click="settings.updateAppearance({ audioPipMode: m.id })"
          >
            {{ $t(m.labelKey) }}
          </button>
        </div>
      </div>

      <div>
        <SettingsSectionTitle
          :title="`${$t('settings.audioPipOpacity')}: ${Math.round(settings.appearance.audioPipOpacity * 100)}%`"
        />
        <input
          type="range"
          min="0.1"
          max="1"
          step="0.05"
          :value="settings.appearance.audioPipOpacity"
          class="w-full"
          @input="
            settings.updateAppearance({
              audioPipOpacity: parseFloat(($event.target as HTMLInputElement).value)
            })
          "
        />
      </div>

      <div class="pt-2">
        <SettingsRow :label="$t('settings.audioPipAutoShow')">
          <SettingsToggle
            :model-value="settings.appearance.audioPipAutoShow"
            @update:model-value="settings.updateAppearance({ audioPipAutoShow: $event })"
          />
        </SettingsRow>
      </div>

      <div>
        <SettingsSectionTitle :title="$t('settings.audioPipPosition')" />
        <SettingsPositionGrid
          :model-value="
            isAudioEdgeMode
              ? settings.appearance.audioPipEdgePosition
              : settings.appearance.audioPipPosition
          "
          :options="audioPositionOptions"
          :selected-label="
            t(
              audioPositions.find(
                (p) =>
                  p.id ===
                  (isAudioEdgeMode
                    ? settings.appearance.audioPipEdgePosition
                    : settings.appearance.audioPipPosition)
              )?.labelKey ?? ''
            )
          "
          @update:model-value="setAudioPosition($event)"
        />
      </div>
    </SettingsCard>
  </SettingsPanel>
</template>
