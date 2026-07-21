<script setup lang="ts">
import { useSettingsStore } from '@renderer/stores/settings';

const settings = useSettingsStore();
</script>

<template>
  <div class="space-y-1 max-w-2xl">
    <h2 class="text-lg font-bold mb-4">Skróty klawiszowe</h2>
    <div
      v-for="(key, action) in settings.shortcuts"
      :key="action"
      class="flex items-center justify-between py-2.5 border-b border-border-default"
    >
      <span class="text-sm capitalize">{{ String(action).replace(/-/g, ' ') }}</span>
      <kbd
        class="px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs text-fg-muted font-mono"
        >{{ key }}</kbd
      >
    </div>
  </div>
</template>
