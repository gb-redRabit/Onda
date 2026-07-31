<script setup lang="ts">
import { ref, onUnmounted } from 'vue';
import { useSettingsStore } from '@renderer/stores/settings';

const settings = useSettingsStore();

const recording = ref<string | null>(null);

function startRecording(action: string) {
  recording.value = action;
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
}

window.addEventListener('keydown', onKeydown);

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
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
  <div class="space-y-1 max-w-2xl">
    <h2 class="text-lg font-bold mb-4">{{ $t('settings.shortcutsSection') }}</h2>
    <div
      v-for="(key, action) in settings.shortcuts"
      :key="action"
      class="flex items-center justify-between py-2.5 border-b border-border-default group"
    >
      <span class="text-sm capitalize">{{ String(action).replace(/-/g, ' ') }}</span>
      <button
        class="px-2 py-1 rounded-lg border text-xs font-mono transition-colors min-w-15 text-center"
        :class="
          recording === action
            ? 'border-accent-base bg-accent-ghost text-accent-base animate-pulse'
            : 'border-border-default bg-bg-elevated text-fg-muted hover:border-accent-base hover:text-fg-base'
        "
        @click="startRecording(String(action))"
      >
        <template v-if="recording === action">...</template>
        <template v-else>{{ displayKey(key) }}</template>
      </button>
    </div>
  </div>
</template>
