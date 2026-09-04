<script setup lang="ts">
import { ref, watch, computed, onBeforeUnmount } from 'vue';
import { useSettingsStore } from '@renderer/stores/settings';
import type { AudioPipDock, AudioPipElementId } from '@shared/types/pip';
import { getAudioPipSize, isAudioPipEdgeDock } from '@shared/types/pip';
import {
  CornerUpRight,
  CornerUpLeft,
  CornerDownRight,
  CornerDownLeft,
  PanelTop,
  PanelBottom,
  PanelLeft,
  PanelRight
} from '@lucide/vue';
import SettingsPanel from '@renderer/components/settings/SettingsPanel.vue';
import SettingsCard from '@renderer/components/settings/SettingsCard.vue';
import SettingsSectionTitle from '@renderer/components/settings/SettingsSectionTitle.vue';
import SettingsRow from '@renderer/components/settings/SettingsRow.vue';
import SettingsToggle from '@renderer/components/settings/SettingsToggle.vue';

const settings = useSettingsStore();

const ELEMENTS: AudioPipElementId[] = [
  'cover',
  'trackInfo',
  'controls',
  'progress',
  'volume',
  'viz',
  'nextTrack',
  'eq'
];

const DOCKS: Array<{ id: AudioPipDock; gridRow: number; gridCol: number }> = [
  { id: 'top-left', gridRow: 1, gridCol: 1 },
  { id: 'top', gridRow: 1, gridCol: 2 },
  { id: 'top-right', gridRow: 1, gridCol: 3 },
  { id: 'left', gridRow: 2, gridCol: 1 },
  { id: 'right', gridRow: 2, gridCol: 3 },
  { id: 'bottom-left', gridRow: 3, gridCol: 1 },
  { id: 'bottom', gridRow: 3, gridCol: 2 },
  { id: 'bottom-right', gridRow: 3, gridCol: 3 }
];

function dockIcon(id: AudioPipDock) {
  switch (id) {
    case 'top-left': return CornerUpLeft;
    case 'top-right': return CornerUpRight;
    case 'bottom-left': return CornerDownLeft;
    case 'bottom-right': return CornerDownRight;
    case 'top': return PanelTop;
    case 'bottom': return PanelBottom;
    case 'left': return PanelLeft;
    case 'right': return PanelRight;
  }
}

function dockLabel(id: AudioPipDock): string {
  if (id === 'top' || id === 'bottom' || id === 'left' || id === 'right') return id;
  return id;
}

const isEdge = computed(() => isAudioPipEdgeDock(settings.appearance.audioPipDock));

const activeElements = computed<AudioPipElementId[]>(() =>
  isEdge.value
    ? settings.appearance.audioPipEdgeElements
    : settings.appearance.audioPipCornerElements
);

const sizeHint = computed(() => {
  const s = getAudioPipSize(settings.appearance.audioPipDock, activeElements.value);
  const d = settings.appearance.audioPipDock;
  if (d === 'top' || d === 'bottom') return `100% × ${s.height}px`;
  if (d === 'left' || d === 'right') return `${s.width}px × 100%`;
  return `${s.width} × ${s.height}px`;
});

function setDock(id: AudioPipDock): void {
  settings.updateAppearance({ audioPipDock: id });
}

function toggleElement(id: AudioPipElementId): void {
  if (isEdge.value) {
    const cur = [...settings.appearance.audioPipEdgeElements];
    const i = cur.indexOf(id);
    if (i >= 0) cur.splice(i, 1);
    else cur.push(id);
    settings.updateAppearance({ audioPipEdgeElements: cur });
  } else {
    const cur = [...settings.appearance.audioPipCornerElements];
    const i = cur.indexOf(id);
    if (i >= 0) cur.splice(i, 1);
    else cur.push(id);
    settings.updateAppearance({ audioPipCornerElements: cur });
  }
}

function isChecked(id: AudioPipElementId): boolean {
  return activeElements.value.includes(id);
}

const audioPreviewOpen = ref(false);

function previewOpts() {
  return {
    dock: settings.appearance.audioPipDock,
    cornerElements: [...settings.appearance.audioPipCornerElements],
    edgeElements: [...settings.appearance.audioPipEdgeElements],
    autoHide: settings.appearance.audioPipAutoHide
  };
}

async function togglePreview() {
  if (audioPreviewOpen.value) {
    await window.api?.audioPipPreviewStop();
    audioPreviewOpen.value = false;
    return;
  }
  const started = await window.api?.audioPipPreviewStart(previewOpts());
  if (started) audioPreviewOpen.value = true;
}

watch(
  () => [
    settings.appearance.audioPipDock,
    settings.appearance.audioPipCornerElements,
    settings.appearance.audioPipEdgeElements,
    settings.appearance.audioPipAutoHide
  ],
  () => {
    if (audioPreviewOpen.value) {
      window.api?.audioPipPreviewUpdate(previewOpts());
    }
  },
  { deep: true }
);

onBeforeUnmount(() => {
  if (audioPreviewOpen.value) void window.api?.audioPipPreviewStop();
});
</script>

<template>
  <SettingsPanel :title="$t('settings.pipAudio')" :description="$t('settings.pipAudioDesc')">
    <SettingsCard>
      <div class="flex items-center justify-between pb-4 border-b border-base-300">
        <SettingsSectionTitle :title="$t('settings.audioPipSection')" class="mb-0!" />
        <button
          class="fx-noise px-3 py-1.5 fx-depth rounded-field text-xs font-medium transition-colors"
          :class="
            audioPreviewOpen
              ? 'bg-error/20 text-error hover:bg-error/30'
              : 'bg-primary text-primary-content hover:bg-primary/90'
          "
          @click="togglePreview"
        >
          {{ audioPreviewOpen ? $t('settings.closePreview') : $t('settings.showPreview') }}
        </button>
      </div>

      <div class="grid gap-5 md:grid-cols-[auto_1fr] md:items-start pt-3">
        <div>
          <SettingsSectionTitle :title="$t('settings.audioPipDock')" />
          <div class="grid grid-cols-3 gap-1.5 w-max">
            <template v-for="row in [1, 2, 3]" :key="row">
              <template v-for="col in [1, 2, 3]" :key="col">
                <button
                  v-if="DOCKS.find((d) => d.gridRow === row && d.gridCol === col)"
                  :key="DOCKS.find((d) => d.gridRow === row && d.gridCol === col)!.id"
                  class="w-11 h-11 rounded-field border flex items-center justify-center transition-colors"
                  :class="
                    settings.appearance.audioPipDock ===
                    DOCKS.find((d) => d.gridRow === row && d.gridCol === col)!.id
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-base-300 text-base-content/60 hover:bg-base-content/5'
                  "
                  :title="dockLabel(DOCKS.find((d) => d.gridRow === row && d.gridCol === col)!.id)"
                  @click="setDock(DOCKS.find((d) => d.gridRow === row && d.gridCol === col)!.id)"
                >
                  <component
                    :is="dockIcon(DOCKS.find((d) => d.gridRow === row && d.gridCol === col)!.id)"
                    :size="17"
                  />
                </button>
                <div v-else class="w-11 h-11 rounded-field bg-base-content/5 flex items-center justify-center">
                  <span class="text-[10px] text-base-content/40 text-center leading-tight">
                    {{ sizeHint }}
                  </span>
                </div>
              </template>
            </template>
          </div>
          <p class="mt-2 text-xs text-base-content/50 max-w-44">
            {{
              isEdge
                ? $t('settings.audioPipDock_edge') + ' · ' + $t('settings.audioPipAutoHideDesc')
                : $t('settings.audioPipDock_corner')
            }}
          </p>
        </div>

        <div class="min-w-0 space-y-4">
          <div>
            <SettingsSectionTitle
              :title="
                (isEdge ? $t('settings.audioPipEdgeContent') : $t('settings.audioPipCornerContent')) +
                ' · ' +
                $t('settings.audioPipSizeHint') +
                ': ' +
                sizeHint
              "
            />
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="id in ELEMENTS"
                :key="id"
                class="fx-noise px-2.5 py-1.5 fx-depth rounded-field text-xs font-medium border transition-colors"
                :class="
                  isChecked(id)
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-base-300 text-base-content/60 hover:bg-base-content/5'
                "
                @click="toggleElement(id)"
              >
                {{ $t('settings.audioPipEl_' + id) }}
              </button>
            </div>
          </div>

          <div class="space-y-1">
            <SettingsRow :label="$t('settings.audioPipAutoShow')">
              <SettingsToggle
                :model-value="settings.appearance.audioPipAutoShow"
                @update:model-value="settings.updateAppearance({ audioPipAutoShow: $event })"
              />
            </SettingsRow>
            <SettingsRow
              :label="$t('settings.audioPipAutoHide')"
            >
              <SettingsToggle
                :model-value="settings.appearance.audioPipAutoHide"
                :disabled="!isEdge"
                @update:model-value="settings.updateAppearance({ audioPipAutoHide: $event })"
              />
            </SettingsRow>
          </div>

          <p class="text-xs text-base-content/50 leading-relaxed">
            {{ $t('settings.audioPipDblClickHint') }} · glass-alpha + blur z motywu aplikacji.
          </p>
        </div>
      </div>
    </SettingsCard>
  </SettingsPanel>
</template>
