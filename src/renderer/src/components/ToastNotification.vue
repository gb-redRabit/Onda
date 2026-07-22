<script setup lang="ts">
import { computed } from 'vue';
import { useUIStore } from '@renderer/stores/ui';
import { useSettingsStore } from '@renderer/stores/settings';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from '@lucide/vue';

const ui = useUIStore();
const settings = useSettingsStore();

const positionClasses: Record<string, string> = {
  'bottom-right': 'bottom-16 right-4',
  'bottom-left': 'bottom-16 left-4',
  'top-right': 'top-16 right-4',
  'top-left': 'top-16 left-4'
};

const filtered = computed(() =>
  ui.notifications.filter((n) => {
    if (n.type === 'error') return true;
    if (n.type === 'success' && !settings.toast.showSuccess) return false;
    if (n.type === 'warning' && !settings.toast.showWarning) return false;
    if (n.type === 'info' && !settings.toast.showInfo) return false;
    return true;
  })
);

function icon(type: string) {
  switch (type) {
    case 'success':
      return CheckCircle2;
    case 'warning':
      return AlertTriangle;
    case 'error':
      return XCircle;
    default:
      return Info;
  }
}

function color(type: string) {
  switch (type) {
    case 'success':
      return 'text-green-400';
    case 'warning':
      return 'text-yellow-400';
    case 'error':
      return 'text-red-400';
    default:
      return 'text-accent-base';
  }
}
</script>

<template>
  <div
    class="fixed z-[80] flex flex-col gap-2 pointer-events-none"
    :class="positionClasses[settings.toast.position] || positionClasses['bottom-right']"
  >
    <div
      v-for="n in filtered"
      :key="n.id"
      class="pointer-events-auto flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-bg-elevated border border-border-default shadow-xl shadow-black/30 max-w-xs animate-in"
    >
      <component :is="icon(n.type)" :size="16" class="shrink-0 mt-0.5" :class="color(n.type)" />
      <div class="flex-1 min-w-0">
        <div class="text-xs font-medium text-fg-base">{{ n.title }}</div>
        <div v-if="n.message" class="text-[11px] text-fg-faint mt-0.5">{{ n.message }}</div>
      </div>
      <button
        class="p-0.5 shrink-0 text-fg-faint hover:text-fg-base transition-colors"
        @click="ui.removeNotification(n.id)"
      >
        <X :size="12" />
      </button>
    </div>
  </div>
</template>

<style scoped>
@keyframes slide-up {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.animate-in {
  animation: slide-up 0.2s ease-out;
}
</style>
