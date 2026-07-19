<script setup lang="ts">
import { computed } from 'vue';
import { useYouTubeStore } from '@renderer/stores/youtube';
import { Download, CheckCircle, AlertCircle, XCircle, Clock } from '@lucide/vue';

const yt = useYouTubeStore();

const active = computed(() =>
  yt.downloads.filter((d) => d.status === 'downloading' || d.status === 'pending')
);
const done = computed(() => yt.downloads.filter((d) => d.status === 'completed'));

const icons = {
  downloading: Download,
  completed: CheckCircle,
  error: AlertCircle,
  cancelled: XCircle,
  pending: Clock
} as const;
const colors = {
  downloading: 'text-accent-base',
  completed: 'text-green-base',
  error: 'text-red-base',
  cancelled: 'text-fg-faint',
  pending: 'text-amber-base'
} as const;
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="p-4 border-b border-border-default flex items-center gap-3">
      <Download :size="24" class="text-accent-base" />
      <h1 class="text-xl font-bold">Pobrane</h1>
      <span
        v-if="active.length"
        class="text-xs bg-accent-ghost text-accent-base px-2 py-0.5 rounded-full font-medium"
        >{{ active.length }} aktywne</span
      >
    </div>
    <div class="flex-1 overflow-auto p-4">
      <div v-if="active.length" class="mb-6">
        <h2 class="text-xs text-fg-faint font-medium uppercase tracking-wider mb-3">Aktywne</h2>
        <div class="space-y-2">
          <div
            v-for="t in active"
            :key="t.id"
            class="p-3 rounded-xl bg-bg-elevated border border-border-default"
          >
            <div class="flex items-center gap-3 mb-2">
              <component
                :is="icons[t.status] || Clock"
                :size="14"
                :class="colors[t.status] || 'text-amber-base'"
              />
              <span class="text-sm flex-1 truncate">{{ t.title }}</span>
              <span class="text-xs text-fg-faint font-mono">{{ t.speed }}</span>
              <span class="text-xs text-fg-faint font-mono">{{ t.eta }}</span>
            </div>
            <div class="w-full h-1.5 bg-border-default rounded-full overflow-hidden">
              <div
                class="h-full bg-accent-base rounded-full"
                :style="{ width: t.progress + '%' }"
              />
            </div>
          </div>
        </div>
      </div>
      <div v-if="done.length" class="mb-6">
        <h2 class="text-xs text-fg-faint font-medium uppercase tracking-wider mb-3">Ukończone</h2>
        <div
          v-for="t in done"
          :key="t.id"
          class="flex items-center gap-3 p-2 rounded-lg hover:bg-bg-hover transition-colors"
        >
          <CheckCircle :size="14" class="text-green-base" />
          <span class="text-sm flex-1 truncate">{{ t.title }}</span>
          <span class="text-xs text-fg-faint">{{ t.format }}</span>
        </div>
      </div>
      <div
        v-if="!yt.downloads.length"
        class="flex flex-col items-center justify-center py-16 text-fg-faint"
      >
        <Download :size="48" class="mb-3 opacity-30" />
        <p class="text-sm">Brak pobranych plików</p>
      </div>
    </div>
  </div>
</template>
