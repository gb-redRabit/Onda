<script setup lang="ts">
import { ref, watch, computed, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSettingsStore } from '@renderer/stores/settings';
import { CornerUpRight, CornerUpLeft, CornerDownRight, CornerDownLeft } from '@lucide/vue';
import SettingsSectionTitle from '@renderer/components/settings/SettingsSectionTitle.vue';
import SettingsRow from '@renderer/components/settings/SettingsRow.vue';
import SettingsToggle from '@renderer/components/settings/SettingsToggle.vue';
import SettingsPositionGrid from '@renderer/components/settings/SettingsPositionGrid.vue';
import SettingsGroup from '@renderer/components/settings/SettingsGroup.vue';

const settings = useSettingsStore();
const { t } = useI18n();

const pipPositions = [
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

const pipPositionOptions = computed(() =>
  pipPositions.map((p) => ({ id: p.id, label: t(p.labelKey), icon: p.icon }))
);

const pipPreviewOpen = ref(false);
let removePreviewClosedListener: (() => void) | null = null;

async function togglePreview() {
  if (pipPreviewOpen.value) {
    await window.api?.pipPreviewStop();
    pipPreviewOpen.value = false;
    return;
  }
  const started = await window.api?.pipPreviewStart({
    position: settings.playback.pipPosition,
    width: settings.playback.pipWidth,
    height: settings.playback.pipHeight
  });
  if (started) pipPreviewOpen.value = true;
}

removePreviewClosedListener =
  window.api?.on('pip:previewClosed', () => {
    pipPreviewOpen.value = false;
  }) ?? null;

watch(
  () => [settings.playback.pipPosition, settings.playback.pipWidth, settings.playback.pipHeight],
  () => {
    if (pipPreviewOpen.value) {
      window.api?.pipPreviewUpdate({
        position: settings.playback.pipPosition,
        width: settings.playback.pipWidth,
        height: settings.playback.pipHeight
      });
    }
  }
);

onBeforeUnmount(() => {
  if (pipPreviewOpen.value) void window.api?.pipPreviewStop();
  removePreviewClosedListener?.();
  removePreviewClosedListener = null;
});
</script>

<template>
  <SettingsGroup>
    <div class="flex items-center justify-between pb-4 border-b border-base-300">
      <SettingsSectionTitle :title="$t('settings.videoPipSection')" class="mb-0!" />
      <button
        data-testid="pip-video-preview-toggle"
        class="fx-noise px-3 py-1.5 fx-depth rounded-field text-xs font-medium transition-colors"
        :aria-pressed="pipPreviewOpen"
        :class="
          pipPreviewOpen
            ? 'bg-error/20 text-error hover:bg-error/30'
            : 'bg-primary text-primary-content hover:bg-primary/90'
        "
        @click="togglePreview"
      >
        {{ pipPreviewOpen ? $t('settings.closePreview') : $t('settings.showPreview') }}
      </button>
    </div>

    <div>
      <SettingsSectionTitle :title="$t('settings.pipPositionLabel')" />
      <SettingsPositionGrid
        :model-value="settings.playback.pipPosition"
        :options="pipPositionOptions"
        :selected-label="
          t(pipPositions.find((p) => p.id === settings.playback.pipPosition)?.labelKey ?? '')
        "
        @update:model-value="
          settings.updatePlayback({ pipPosition: $event as (typeof pipPositions)[number]['id'] })
        "
      />
    </div>

    <div>
      <SettingsSectionTitle :title="`${$t('settings.width')} ${settings.playback.pipWidth}px`" />
      <input
        type="range"
        min="240"
        max="1200"
        step="10"
        :value="settings.playback.pipWidth"
        class="w-full"
        @input="
          settings.updatePlayback({
            pipWidth: parseInt(($event.target as HTMLInputElement).value)
          })
        "
      />
    </div>

    <div>
      <SettingsSectionTitle :title="`${$t('settings.height')} ${settings.playback.pipHeight}px`" />
      <input
        type="range"
        min="140"
        max="800"
        step="10"
        :value="settings.playback.pipHeight"
        class="w-full"
        @input="
          settings.updatePlayback({
            pipHeight: parseInt(($event.target as HTMLInputElement).value)
          })
        "
      />
    </div>

    <div class="pt-4 border-t border-base-300">
      <SettingsRow :label="$t('settings.pipPreBuffer')">
        <SettingsToggle
          :model-value="settings.playback.pipPreBuffer"
          @update:model-value="settings.updatePlayback({ pipPreBuffer: $event })"
        />
      </SettingsRow>
    </div>
  </SettingsGroup>
</template>
