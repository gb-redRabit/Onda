<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { BarChart3, Settings2, LayoutGrid, Maximize2, Minimize2 } from '@lucide/vue';
import AudioLayoutSwitcher from './AudioLayoutSwitcher.vue';
import { pluginIcon } from '@renderer/utils/audioView';

// Nakładka HUD widoku audio (kontynuacja planu 6.3): przełącznik edytora układu,
// przełącznik układów, polecenia wtyczek, tryb wizualizacji + ustawienia i pełny ekran.
// Widoczność/stan przychodzą jako propsy; każda akcja jest emitowana.

export interface AudioHudCommand {
  id: string;
  label: string;
  icon?: string;
}

const props = defineProps<{
  visible: boolean;
  hudOpacity: number;
  layoutEditorOpen: boolean;
  vizSettingsOpen: boolean;
  isFullscreen: boolean;
  vizMode: string;
  commands: AudioHudCommand[];
}>();

const emit = defineEmits<{
  'update:layoutEditorOpen': [value: boolean];
  'update:vizSettingsOpen': [value: boolean];
  'cycle-viz': [];
  'toggle-fullscreen': [];
  'run-command': [id: string];
}>();

const { t } = useI18n();

// Pasek narzędzi pokazywał użytkownikowi surowe id trybu ("bars", "particles", "waveform").
// Wtyczka może zarejestrować tryb z dowolnym id, więc nieznane id spadają
// do samego id, a nie do pustej etykiety.
const VIZ_MODE_LABEL_KEYS: Record<string, string> = {
  bars: 'audioView.vizModeBars',
  particles: 'audioView.vizModeParticles',
  waveform: 'audioView.vizModeWaveform'
};
const vizModeLabel = computed(() => {
  const mode = props.vizMode || 'bars';
  const key = VIZ_MODE_LABEL_KEYS[mode];
  return key ? t(key) : mode;
});
</script>

<template>
  <div
    v-show="!props.layoutEditorOpen"
    class="absolute top-2 left-2 right-2 z-70 flex items-center justify-between pointer-events-none transition-opacity"
    :style="{ opacity: props.visible ? props.hudOpacity : 0 }"
  >
    <div class="flex items-center gap-1 pointer-events-auto">
      <button
        data-testid="audio-layout-editor"
        class="pointer-events-auto fx-noise p-1.5 fx-depth rounded-field bg-base-300/80 backdrop-blur-sm text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-all"
        :title="$t('audioView.layoutEditor')"
        @click.stop="emit('update:layoutEditorOpen', !props.layoutEditorOpen)"
      >
        <LayoutGrid :size="13" />
      </button>
      <AudioLayoutSwitcher />
    </div>

    <!-- Przyciski paska narzędzi wtyczek -->
    <div v-if="props.commands.length" class="flex items-center gap-1 pointer-events-auto">
      <button
        v-for="cmd in props.commands"
        :key="cmd.id"
        class="fx-noise p-1.5 fx-depth rounded-field bg-base-300/80 backdrop-blur-sm text-base-content/70 hover:text-base-content hover:bg-base-content/10 transition-all"
        :title="cmd.label"
        @click.stop="emit('run-command', cmd.id)"
      >
        <component :is="pluginIcon(cmd.icon)" :size="13" />
      </button>
    </div>

    <div class="flex items-center gap-1 pointer-events-auto">
      <button
        data-testid="audio-cycle-viz"
        class="fx-noise p-1.5 fx-depth rounded-field bg-base-300/80 backdrop-blur-sm text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-all"
        :title="$t('audioView.vizMode')"
        :aria-label="vizModeLabel"
        @click.stop="emit('cycle-viz')"
      >
        <div class="flex items-center gap-1">
          <BarChart3 :size="12" />
          <span class="text-[9px] uppercase font-medium">{{ vizModeLabel }}</span>
        </div>
      </button>
      <button
        data-testid="audio-viz-settings"
        class="fx-noise p-1.5 fx-depth rounded-field backdrop-blur-sm transition-all"
        :class="
          props.vizSettingsOpen
            ? 'text-primary bg-primary/10'
            : 'text-base-content/50 hover:text-base-content hover:bg-base-content/10 bg-base-300/80'
        "
        :title="$t('settings.audioViz')"
        @click.stop="emit('update:vizSettingsOpen', !props.vizSettingsOpen)"
      >
        <Settings2 :size="12" />
      </button>
      <button
        data-testid="audio-fullscreen"
        class="fx-noise p-1.5 fx-depth rounded-field bg-base-300/80 backdrop-blur-sm text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-all"
        :title="props.isFullscreen ? $t('audioView.exitFullscreen') : $t('audioView.fullscreen')"
        :aria-label="
          props.isFullscreen ? $t('audioView.exitFullscreen') : $t('audioView.fullscreen')
        "
        @click.stop="emit('toggle-fullscreen')"
      >
        <Minimize2 v-if="props.isFullscreen" :size="12" />
        <Maximize2 v-else :size="12" />
      </button>
    </div>
  </div>
</template>
