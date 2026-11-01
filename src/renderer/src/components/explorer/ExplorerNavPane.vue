<script setup lang="ts">
import { ref, inject, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { HardDrive, FolderOpen, Monitor, Download, Home, X } from '@lucide/vue';
import { useExplorerStore } from '@renderer/stores/explorer';
import { useLibraryStore } from '@renderer/stores/library';
import { useSettingsStore } from '@renderer/stores/settings';
import { formatFileSize } from '@renderer/utils/formatters';

defineProps<{ overlay?: boolean }>();
const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
const explorer = useExplorerStore();
const library = useLibraryStore();
const settings = useSettingsStore();
const showConfirm = inject<(msg: string) => Promise<boolean>>('showConfirm', async (msg: string) =>
  confirm(msg)
);

interface DriveEntry {
  name: string;
  path: string;
  total: number;
  free: number;
}

const drives = ref<DriveEntry[]>([]);
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
    const [desktop, downloads] = await Promise.all([
      window.api.invoke('app:getPath', 'desktop') as Promise<string>,
      window.api.invoke('app:getPath', 'downloads') as Promise<string>
    ]);
    desktopPath.value = desktop;
    downloadsPath.value = downloads;
    await loadDrives();
  }
});

// Zajętość dysków zmienia się rzadko, więc odświeżamy ją przy wejściu na listę
// dysków (a nie przy każdym przejściu do folderu).
watch(
  () => explorer.currentPath,
  (path) => {
    if (!path || /^[A-Z]:\\$/i.test(path)) void loadDrives();
  }
);

async function loadDrives(): Promise<void> {
  try {
    drives.value = (await window.api.invoke('fs:getDriveUsage')) as DriveEntry[];
  } catch {
    drives.value = [];
  }
}

function usedPercent(drive: DriveEntry): number {
  if (drive.total <= 0) return 0;
  const used = drive.total - drive.free;
  return Math.min(100, Math.max(0, Math.round((used / drive.total) * 100)));
}

function usageClass(drive: DriveEntry): string {
  const percent = usedPercent(drive);
  if (percent >= 90) return 'bg-error';
  if (percent >= 75) return 'bg-warning';
  return 'bg-primary/70';
}

function usageTitle(drive: DriveEntry): string {
  return t('explorer.driveUsage', {
    percent: usedPercent(drive),
    free: formatFileSize(drive.free),
    total: formatFileSize(drive.total)
  });
}

function resolvePath(link: (typeof quickLinks)[number]): string {
  if (link.label === 'Desktop') return desktopPath.value;
  if (link.label === 'Downloads') return downloadsPath.value;
  return link.path;
}

function isActiveLink(link: (typeof quickLinks)[number]): boolean {
  if (link.label !== 'This PC' && !resolvePath(link)) return false;
  return explorer.currentPath === resolvePath(link);
}

function onNavDragOver(e: DragEvent, path: string) {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = e.ctrlKey || e.metaKey ? 'copy' : 'move';
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
  window.api?.send('explorer:refreshAll');
}
</script>

<template>
  <div
    data-testid="explorer-nav-pane"
    class="w-56 shrink-0 border-r border-hairline/80 bg-base-100/(--glass-alpha) flex flex-col overflow-hidden"
  >
    <!-- W trybie nakładki (wąskie okno) panel zasłania pasek narzędzi, więc
         zamykanie musi być w środku panelu. -->
    <div
      v-if="overlay"
      class="flex shrink-0 items-center justify-between gap-2 border-b border-hairline/80 px-2.5 py-2"
    >
      <span class="text-2xs font-semibold uppercase tracking-wider text-base-content/50">
        {{ t('explorer.navPane') }}
      </span>
      <button
        type="button"
        class="fx-noise rounded-field p-1 text-base-content/60 transition-colors hover:bg-base-content/10 hover:text-base-content"
        data-testid="explorer-nav-close"
        :title="t('common.close')"
        :aria-label="t('common.close')"
        @click="emit('close')"
      >
        <X :size="14" class="pointer-events-none" />
      </button>
    </div>
    <div class="flex-1 overflow-y-auto p-2 space-y-0.5">
      <!-- szybkie linki -->
      <div class="px-2 py-1.5 text-2xs font-semibold uppercase tracking-wider text-base-content/50">
        {{ t('explorer.quickAccess') }}
      </div>
      <button
        v-for="link in quickLinks"
        :key="link.label"
        type="button"
        class="fx-noise w-full flex items-center gap-2 px-2.5 py-1.5 rounded-field text-xs text-base-content/70 hover:text-base-content hover:bg-base-content/8 transition-colors text-left disabled:opacity-40"
        :class="{
          'bg-primary/14 text-primary-text font-medium': isActiveLink(link),
          'ring-2 ring-primary bg-primary/50': dropTargetPath === resolvePath(link)
        }"
        :disabled="link.label !== 'This PC' && !resolvePath(link)"
        @click="explorer.navigateTo(resolvePath(link))"
        @dragover="onNavDragOver($event, resolvePath(link))"
        @dragenter="onNavDragEnter($event, resolvePath(link))"
        @dragleave="onNavDragLeave"
        @drop="onNavDrop($event, resolvePath(link))"
      >
        <component :is="link.icon" :size="14" class="shrink-0 text-base-content/50" />
        <span class="truncate">{{ t('explorer.' + link.label.replace(/\s+/g, '')) }}</span>
      </button>

      <!-- dyski -->
      <div
        class="mt-3 px-2 py-1.5 text-2xs font-semibold uppercase tracking-wider text-base-content/50"
      >
        {{ t('explorer.drives') }}
      </div>
      <button
        v-for="drive in drives"
        :key="drive.path"
        type="button"
        class="fx-noise w-full flex flex-col gap-1 px-2.5 py-1.5 rounded-field text-xs text-base-content/70 hover:text-base-content hover:bg-base-content/8 transition-colors text-left"
        :class="{
          'bg-primary/14 text-primary-text font-medium': explorer.currentPath === drive.path,
          'ring-2 ring-primary bg-primary/50': dropTargetPath === drive.path
        }"
        :title="drive.total > 0 ? usageTitle(drive) : drive.name"
        @click="explorer.navigateTo(drive.path)"
        @dragover="onNavDragOver($event, drive.path)"
        @dragenter="onNavDragEnter($event, drive.path)"
        @dragleave="onNavDragLeave"
        @drop="onNavDrop($event, drive.path)"
      >
        <span class="flex w-full min-w-0 items-center gap-2">
          <HardDrive :size="14" class="shrink-0 text-primary-text" />
          <span class="truncate flex-1">{{ drive.name }}</span>
          <span
            v-if="drive.total > 0"
            class="shrink-0 text-3xs tabular-nums text-base-content/45"
            >{{ formatFileSize(drive.free) }}</span
          >
        </span>
        <span
          v-if="drive.total > 0"
          class="block h-1 w-full overflow-hidden rounded-full bg-base-content/10"
          aria-hidden="true"
        >
          <span
            class="block h-full rounded-full transition-[width] duration-300"
            :class="usageClass(drive)"
            :style="{ width: `${usedPercent(drive)}%` }"
          />
        </span>
      </button>

      <!-- foldery biblioteki -->
      <div
        class="mt-3 px-2 py-1.5 text-2xs font-semibold uppercase tracking-wider text-base-content/50"
      >
        {{ t('explorer.libraryFolders') }}
      </div>
      <button
        v-for="folder in library.folders"
        :key="folder"
        type="button"
        class="fx-noise w-full flex items-center gap-2 px-2.5 py-1.5 rounded-field text-xs text-base-content/70 hover:text-base-content hover:bg-base-content/8 transition-colors text-left"
        :class="{
          'bg-primary/14 text-primary-text font-medium': explorer.currentPath === folder,
          'ring-2 ring-primary bg-primary/50': dropTargetPath === folder
        }"
        @click="explorer.navigateTo(folder)"
        @dragover="onNavDragOver($event, folder)"
        @dragenter="onNavDragEnter($event, folder)"
        @dragleave="onNavDragLeave"
        @drop="onNavDrop($event, folder)"
      >
        <FolderOpen :size="14" class="shrink-0 text-primary-text" />
        <span class="truncate flex-1">{{ folder.replace(/.*[\\/]/, '') || folder }}</span>
        <span
          class="shrink-0 text-4xs px-1 py-0.5 rounded-field bg-primary/20 text-primary-text font-bold border border-primary/40 leading-none"
          :title="t('explorer.libraryFolder')"
        >
          LIB
        </span>
      </button>
    </div>
  </div>
</template>
