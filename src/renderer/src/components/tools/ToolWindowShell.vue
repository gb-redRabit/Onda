<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue';
import { Maximize2, Minus, Square, X } from '@lucide/vue';

const props = defineProps<{
  title: string;
  icon?: Component;
}>();

const isMaximized = ref(false);
let offMaximized: (() => void) | null = null;

function minimize(): void {
  void window.api?.invoke('window:minimize');
}

function maximize(): void {
  void window.api?.invoke('window:maximize');
}

function close(): void {
  void window.api?.invoke('window:close');
}

function onKeydown(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'w') {
    event.preventDefault();
    close();
  }
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown);
  offMaximized =
    window.api?.on('window:maximized', (value: unknown) => {
      isMaximized.value = !!value;
    }) ?? null;
  document.title = props.title;
});

watch(
  () => props.title,
  (title) => {
    document.title = title;
  }
);

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  offMaximized?.();
  offMaximized = null;
});
</script>

<template>
  <div
    data-testid="tool-window-shell"
    class="flex h-full w-full flex-col overflow-hidden bg-base-200/(--glass-alpha)"
  >
    <header
      class="flex h-9 shrink-0 select-none items-center justify-between gap-3 border-b border-base-300 pl-3 pr-1"
      style="-webkit-app-region: drag"
    >
      <div class="flex min-w-0 items-center gap-2 text-xs text-base-content/70">
        <component :is="icon" v-if="icon" :size="14" class="shrink-0 text-primary-text" />
        <span class="truncate font-medium">{{ title }}</span>
      </div>
      <div class="flex shrink-0 items-center gap-0.5" style="-webkit-app-region: no-drag">
        <button
          class="fx-noise rounded-field p-1.5 text-base-content/50 transition-colors hover:bg-base-content/10 hover:text-base-content"
          :title="$t('window.minimize')"
          :aria-label="$t('window.minimize')"
          @click="minimize"
        >
          <Minus :size="14" />
        </button>
        <button
          class="fx-noise rounded-field p-1.5 text-base-content/50 transition-colors hover:bg-base-content/10 hover:text-base-content"
          :title="$t('window.maximize')"
          :aria-label="$t('window.maximize')"
          @click="maximize"
        >
          <Square v-if="isMaximized" :size="10" />
          <Maximize2 v-else :size="12" />
        </button>
        <button
          class="fx-noise rounded-field p-1.5 text-base-content/50 transition-colors hover:bg-error/80 hover:text-error-content"
          :title="$t('window.close')"
          :aria-label="$t('window.close')"
          @click="close"
        >
          <X :size="14" />
        </button>
      </div>
    </header>
    <div class="min-h-0 flex-1 overflow-hidden">
      <slot />
    </div>
  </div>
</template>
