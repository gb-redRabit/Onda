<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { FolderOpen, Minus, Square, X, Pin } from '@lucide/vue';
import ExplorerView from '@renderer/views/ExplorerView.vue';
import { useExplorerStore } from '@renderer/stores/explorer';

const route = useRoute();
const explorer = useExplorerStore();
const { t } = useI18n();

const initialPath = typeof route.query.path === 'string' ? route.query.path : undefined;
if (initialPath) {
  explorer.navigateTo(initialPath);
}

function minimize() {
  window.api?.invoke('window:minimize');
}
function maximize() {
  window.api?.invoke('window:maximize');
}
function close() {
  window.api?.invoke('window:close');
}

async function pinAsTab() {
  if (!explorer.currentPath) return;
  await window.api?.invoke('explorer:sendTabToMain', explorer.currentPath);
  if (explorer.tabs.length <= 1) {
    close();
  } else {
    explorer.closeTab(explorer.activeTabIndex);
  }
}

function onWindowKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
    e.preventDefault();
    close();
  }
}

onMounted(() => {
  document.addEventListener('keydown', onWindowKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onWindowKeydown);
});

function titleText(): string {
  if (!explorer.currentPath) return t('explorer.thisComputer');
  const parts = explorer.currentPath.split(/[\\/]/);
  return parts[parts.length - 1] || explorer.currentPath;
}
</script>

<template>
  <div class="flex flex-col h-full w-full bg-bg-base">
    <div
      class="flex items-center justify-between gap-3 pl-3 pr-1 h-9 shrink-0 border-b border-border-default select-none"
      style="-webkit-app-region: drag"
    >
      <div class="flex items-center gap-2 text-xs text-fg-muted min-w-0">
        <FolderOpen :size="14" class="text-accent-base shrink-0" />
        <span class="truncate font-medium">{{ titleText() }}</span>
      </div>
      <div class="flex items-center gap-0.5 shrink-0" style="-webkit-app-region: no-drag">
        <button
          class="p-1.5 rounded-md text-fg-faint hover:text-accent-base hover:bg-accent-ghost transition-colors"
          :title="$t('explorer.pinAsTab')"
          @click="pinAsTab"
        >
          <Pin :size="13" />
        </button>
        <button
          class="p-1.5 rounded-md text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-colors"
          :title="$t('window.minimize')"
          @click="minimize"
        >
          <Minus :size="14" />
        </button>
        <button
          class="p-1.5 rounded-md text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-colors"
          :title="$t('window.maximize')"
          @click="maximize"
        >
          <Square :size="12" />
        </button>
        <button
          class="p-1.5 rounded-md text-fg-faint hover:text-white hover:bg-red-500/80 transition-colors"
          :title="$t('window.close')"
          @click="close"
        >
          <X :size="14" />
        </button>
      </div>
    </div>
    <div class="flex-1 min-h-0">
      <ExplorerView />
    </div>
  </div>
</template>
