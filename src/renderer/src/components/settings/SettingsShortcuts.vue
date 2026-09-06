<script setup lang="ts">
import { ref, onUnmounted } from 'vue';
import { useSettingsStore } from '@renderer/stores/settings';
import SettingsPanel from '@renderer/components/settings/SettingsPanel.vue';
import SettingsCard from '@renderer/components/settings/SettingsCard.vue';

const settings = useSettingsStore();

const recording = ref<string | null>(null);

function startRecording(action: string) {
  recording.value = action;
  document.body.dataset.shortcutRecording = action;
}

function onKeydown(e: KeyboardEvent) {
  if (!recording.value) return;
  e.preventDefault();
  e.stopPropagation();

  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push(e.metaKey ? 'Meta' : 'Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  const key = e.key;
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return;

  if (key === 'Escape') {
    recording.value = null;
    document.body.dataset.shortcutRecording = '';
    return;
  }

  if (key.startsWith('F') && key.length <= 3) {
    parts.push(key);
  } else if (key === ' ') {
    parts.push('Space');
  } else if (
    key === 'ArrowUp' ||
    key === 'ArrowDown' ||
    key === 'ArrowLeft' ||
    key === 'ArrowRight'
  ) {
    parts.push(key);
  } else if (key.length === 1) {
    parts.push(key.toUpperCase());
  } else if (key.startsWith('Media') || key === 'Enter' || key === 'Tab') {
    parts.push(key);
  } else {
    return;
  }

  settings.updateShortcut(recording.value, parts.join('+'));
  recording.value = null;
  document.body.dataset.shortcutRecording = '';
}

window.addEventListener('keydown', onKeydown);

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
  document.body.dataset.shortcutRecording = '';
});

function displayKey(key: string): string {
  return key
    .replace('ArrowUp', '↑')
    .replace('ArrowDown', '↓')
    .replace('ArrowLeft', '←')
    .replace('ArrowRight', '→')
    .replace('MediaTrackNext', '⏭')
    .replace('MediaTrackPrevious', '⏮');
}
</script>

<template>
  <SettingsPanel :title="$t('settings.shortcutsSection')">
    <SettingsCard :padded="false">
      <div
        v-for="(key, action) in settings.shortcuts"
        :key="action"
        class="flex items-center justify-between gap-4 px-4 py-2.5 border-b border-base-300 last:border-b-0"
      >
        <span class="text-sm capitalize">{{ String(action).replace(/-/g, ' ') }}</span>
        <button
          class="fx-noise px-3 py-1 fx-depth rounded-field border text-xs font-mono transition-colors min-w-15 text-center"
          :class="
            recording === action
              ? 'border-primary bg-primary/10 text-primary animate-pulse'
              : 'border-base-300 bg-base-200/[var(--glass-alpha)] text-base-content/70 hover:border-primary hover:text-base-content'
          "
          @click="startRecording(String(action))"
        >
          <template v-if="recording === action">...</template>
          <template v-else>{{ displayKey(key) }}</template>
        </button>
      </div>
    </SettingsCard>
  </SettingsPanel>
</template>
