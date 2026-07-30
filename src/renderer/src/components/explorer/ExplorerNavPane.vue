<script setup lang="ts">
import { ref, inject, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { HardDrive, FolderOpen, Monitor, Download, Home } from '@lucide/vue';
import { useExplorerStore } from '@renderer/stores/explorer';
import { useLibraryStore } from '@renderer/stores/library';
import { useSettingsStore } from '@renderer/stores/settings';

const { t } = useI18n();
const explorer = useExplorerStore();
const library = useLibraryStore();
const settings = useSettingsStore();
const showConfirm = inject<(msg: string) => Promise<boolean>>('showConfirm', async (msg: string) => confirm(msg));

const drives = ref<{ name: string; path: string }[]>([]);
const desktopPath = ref('');
const downloadsPath = ref('');
const dropTargetPath = ref<string | null>(null);
const dragEnterCount = ref(0);

const quickLinks = [
  { label: 'This PC', icon: Monitor, path: '' },
  { label: 'Desktop', icon: Home, path: '' },
  { label: 'Downloads', icon: Download, path: '' }
];

onMounted(async () => {
  if (window.api) {
    const [drivesResult, desktop, downloads] = await Promise.all([
      window.api.invoke('fs:getDrives') as Promise<{ name: string; path: string }[]>,
      window.api.invoke('app:getPath', 'desktop') as Promise<string>,
      window.api.invoke('app:getPath', 'downloads') as Promise<string>
    ]);
    drives.value = drivesResult;
    desktopPath.value = desktop;
    downloadsPath.value = downloads;
  }
});

function resolvePath(link: typeof quickLinks[number]): string {
  if (link.label === 'Desktop') return desktopPath.value;
  if (link.label === 'Downloads') return downloadsPath.value;
  return link.path;
}

function onNavDragOver(e: DragEvent, path: string) {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = (e.ctrlKey || e.metaKey) ? 'copy' : 'move';
  dropTargetPath.value = path;
}

function onNavDragEnter(_e: DragEvent, path: string) {
  dragEnterCount.value++;
  dropTargetPath.value = path;
}

function onNavDragLeave() {
  dragEnterCount.value--;
  if (dragEnterCount.value <= 0) {
    dragEnterCount.value = 0;
    dropTargetPath.value = null;
  }
}

async function onNavDrop(e: DragEvent, path: string) {
  e.preventDefault();
  e.stopPropagation();
  dropTargetPath.value = null;
  dragEnterCount.value = 0;
  const raw = e.dataTransfer?.getData('text/plain') || '';
  const paths = raw.split('\n').filter(Boolean);
  if (paths.length === 0) return;
  const ctrl = e.ctrlKey || e.metaKey;
  if (settings.explorer.confirmBeforeMove) {
    const key = ctrl ? 'explorer.copyConfirm' : 'explorer.moveConfirm';
    const ok = await showConfirm(t(key, { n: paths.length, dir: path.split('\\').pop() || path }));
    if (!ok) return;
  }
  const method = ctrl ? 'fs:copy' : 'fs:move';
  await window.api?.invoke(method, paths, path);
  explorer.loadFiles(explorer.currentPath);
}
</script>

<template>
  <div class="w-56 shrink-0 border-r border-border-default bg-bg-surface flex flex-col overflow-hidden">
    <div class="flex-1 overflow-y-auto p-2 space-y-0.5">
      <!-- quick links -->
      <div class="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg-faint">
        {{ t('explorer.quickAccess') }}
      </div>
      <button
        v-for="link in quickLinks"
        :key="link.label"
        class="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-fg-muted hover:text-fg-base hover:bg-bg-hover transition-colors text-left disabled:opacity-40"
        :class="{
          'bg-accent-ghost text-accent-base': explorer.currentPath === resolvePath(link),
          'ring-2 ring-accent-base bg-accent-ghost/50': dropTargetPath === resolvePath(link)
        }"
        :disabled="link.label !== 'This PC' && !resolvePath(link)"
        @click="explorer.navigateTo(resolvePath(link))"
        @dragover="onNavDragOver($event, resolvePath(link))"
        @dragenter="onNavDragEnter($event, resolvePath(link))"
        @dragleave="onNavDragLeave"
        @drop="onNavDrop($event, resolvePath(link))"
      >
        <component :is="link.icon" :size="14" class="shrink-0 text-fg-faint" />
        <span class="truncate">{{ t('explorer.' + link.label.replace(/\s+/g, '')) }}</span>
      </button>

      <!-- drives -->
      <div class="mt-3 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg-faint">
        {{ t('explorer.drives') }}
      </div>
      <button
        v-for="drive in drives"
        :key="drive.path"
        class="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-fg-muted hover:text-fg-base hover:bg-bg-hover transition-colors text-left"
        :class="{
          'bg-accent-ghost text-accent-base': explorer.currentPath === drive.path,
          'ring-2 ring-accent-base bg-accent-ghost/50': dropTargetPath === drive.path
        }"
        @click="explorer.navigateTo(drive.path)"
        @dragover="onNavDragOver($event, drive.path)"
        @dragenter="onNavDragEnter($event, drive.path)"
        @dragleave="onNavDragLeave"
        @drop="onNavDrop($event, drive.path)"
      >
        <HardDrive :size="14" class="shrink-0 text-accent-base" />
        <span class="truncate">{{ drive.name }}</span>
      </button>

      <!-- library folders -->
      <div class="mt-3 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg-faint">
        {{ t('explorer.libraryFolders') }}
      </div>
      <button
        v-for="folder in library.folders"
        :key="folder"
        class="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-fg-muted hover:text-fg-base hover:bg-bg-hover transition-colors text-left"
        :class="{
          'bg-accent-ghost text-accent-base': explorer.currentPath === folder,
          'ring-2 ring-accent-base bg-accent-ghost/50': dropTargetPath === folder
        }"
        @click="explorer.navigateTo(folder)"
        @dragover="onNavDragOver($event, folder)"
        @dragenter="onNavDragEnter($event, folder)"
        @dragleave="onNavDragLeave"
        @drop="onNavDrop($event, folder)"
      >
        <FolderOpen :size="14" class="shrink-0 text-accent-base" />
        <span class="truncate flex-1">{{ folder.replace(/.*[\\/]/, '') || folder }}</span>
        <span
          class="shrink-0 text-[8px] px-1 py-0.5 rounded-md bg-accent-base/20 text-accent-base font-bold border border-accent-base/40 leading-none"
          :title="t('explorer.libraryFolder')"
        >
          LIB
        </span>
      </button>
    </div>
  </div>
</template>