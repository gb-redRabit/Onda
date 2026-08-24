<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { FolderPlus, Download, Check } from '@lucide/vue';
import { useLibraryStore } from '@renderer/stores/library';
import { useSettingsStore } from '@renderer/stores/settings';
import { useUIStore } from '@renderer/stores/ui';

const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
const library = useLibraryStore();
const settings = useSettingsStore();
const ui = useUIStore();

const libraryFolders = ref<string[]>([]);
const downloadFolder = ref('');

async function addLibraryFolder() {
  try {
    const paths = (await window.api?.invoke('dialog:openFolder')) as string[] | undefined;
    if (!paths || paths.length === 0) return;
    for (const p of paths) {
      if (!libraryFolders.value.includes(p)) libraryFolders.value.push(p);
    }
  } catch {
    /* cancelled */
  }
}

async function chooseDownloadFolder() {
  try {
    const paths = (await window.api?.invoke('dialog:openFolder')) as string[] | undefined;
    if (paths && paths.length > 0) downloadFolder.value = paths[0];
  } catch {
    /* cancelled */
  }
}

function finish() {
  try {
    for (const p of libraryFolders.value) void library.addFolder(p);
    if (downloadFolder.value) settings.updateDownload({ defaultPath: downloadFolder.value });
    if (libraryFolders.value.length > 0) void library.scanFolders();
  } catch {
    /* ignore */
  }
  localStorage.setItem('onda-first-run-done', '1');
  ui.notify('success', t('wizard.done'));
  emit('close');
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
    @click.self="emit('close')"
  >
    <div
      class="w-full max-w-md rounded-box bg-base-100 border border-base-300 shadow-2xl shadow-black/50 p-8"
    >
      <div
        class="w-14 h-14 rounded-box bg-primary/15 text-primary flex items-center justify-center mb-5"
      >
        <Check :size="26" />
      </div>
      <h2 class="text-xl font-bold tracking-tight mb-2">{{ $t('wizard.title') }}</h2>
      <p class="text-sm text-base-content/70 mb-6">{{ $t('wizard.welcome') }}</p>

      <div class="space-y-3 mb-6">
        <button
          class="w-full flex items-center gap-3 p-4 fx-depth rounded-box fx-noise border border-base-300 hover:border-primary/50 hover:bg-base-content/10 transition-colors text-left"
          @click="addLibraryFolder"
        >
          <FolderPlus :size="20" class="text-primary shrink-0" />
          <div class="min-w-0">
            <div class="text-sm font-medium">{{ $t('wizard.addLibrary') }}</div>
            <div class="text-xs text-base-content/50 truncate">
              {{
                libraryFolders.length > 0 ? libraryFolders.join(', ') : $t('wizard.noneSelected')
              }}
            </div>
          </div>
        </button>

        <button
          class="w-full flex items-center gap-3 p-4 fx-depth rounded-box fx-noise border border-base-300 hover:border-primary/50 hover:bg-base-content/10 transition-colors text-left"
          @click="chooseDownloadFolder"
        >
          <Download :size="20" class="text-primary shrink-0" />
          <div class="min-w-0">
            <div class="text-sm font-medium">{{ $t('wizard.chooseDownload') }}</div>
            <div class="text-xs text-base-content/50 truncate">
              {{ downloadFolder || $t('wizard.noneSelected') }}
            </div>
          </div>
        </button>
      </div>

      <div class="flex items-center gap-3">
        <button
          class="fx-noise flex-1 py-2.5 fx-depth rounded-field bg-primary text-primary-content text-sm font-medium hover:bg-primary/90 transition-colors"
          @click="finish"
        >
          {{ $t('wizard.start') }}
        </button>
        <button
          class="fx-noise py-2.5 px-4 fx-depth rounded-field border border-base-300 text-sm text-base-content/70 hover:bg-base-content/10 transition-colors"
          @click="emit('close')"
        >
          {{ $t('wizard.later') }}
        </button>
      </div>
    </div>
  </div>
</template>
