<script setup lang="ts">
import { computed } from 'vue';
import { useLibraryStore } from '@renderer/stores/library';
import { useUIStore } from '@renderer/stores/ui';
import { useI18n } from 'vue-i18n';
import { FolderPlus, FolderSearch } from '@lucide/vue';
import SettingsPanel from '@renderer/components/settings/SettingsPanel.vue';
import SettingsCard from '@renderer/components/settings/SettingsCard.vue';

const library = useLibraryStore();
const ui = useUIStore();
const { t } = useI18n();

async function addFolder() {
  try {
    const paths = (await window.api?.invoke('dialog:openFolder')) as string[] | undefined;
    if (!paths || paths.length === 0) return;
    for (const fp of paths) {
      await library.addFolder(fp);
    }
    await library.scanFolders();
    ui.notify('success', t('settings.libAddedNotif'));
  } catch (err) {
    ui.notify('error', t('settings.libAddError'), (err as Error).message || String(err));
  }
}

async function scan() {
  await library.scanFolders();
}

const folderEntries = computed(() =>
  library.folders.map((f) => ({
    path: f,
    type: library.getFolderType(f)
  }))
);

function folderIcon(type: string): string {
  if (type === 'audio') return '🎵';
  if (type === 'video') return '🎬';
  if (type === 'image') return '🖼️';
  if (type === 'mixed') return '📁';
  return '📁';
}
</script>

<template>
  <SettingsPanel :title="$t('settings.libTitle')" :description="$t('settings.libDesc')">
    <div class="flex items-center gap-3">
      <button
        class="flex items-center gap-2 px-4 py-2 rounded-xl bg-bg-elevated border border-border-default text-sm font-medium hover:bg-bg-hover transition-colors"
        @click="addFolder"
      >
        <FolderPlus :size="16" />{{ $t('settings.libAddFolder') }}
      </button>
      <button
        class="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent-base text-white text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
        :disabled="library.isScanning || library.folders.length === 0"
        @click="scan"
      >
        <FolderSearch :size="16" />
        {{ library.isScanning ? $t('settings.libScanning') : $t('settings.libScanNow') }}
      </button>
    </div>

    <div v-if="library.folders.length === 0" class="text-sm text-fg-faint italic py-4">
      {{ $t('settings.libEmpty') }}
    </div>

    <SettingsCard v-else :padded="false">
      <div
        v-for="entry in folderEntries"
        :key="entry.path"
        class="flex items-center justify-between px-4 py-3 border-b border-border-default last:border-b-0"
      >
        <div class="flex items-center gap-3 min-w-0">
          <span class="text-lg">{{ folderIcon(entry.type) }}</span>
          <div class="min-w-0">
            <div class="text-sm font-medium truncate">{{ entry.path }}</div>
            <div class="text-xs text-fg-faint mt-0.5">
              {{ $t('settings.libType') }}
              {{
                entry.type === 'audio'
                  ? $t('settings.libAudio')
                  : entry.type === 'video'
                    ? $t('settings.libVideo')
                    : entry.type === 'image'
                      ? $t('settings.libImage')
                      : entry.type === 'mixed'
                        ? $t('settings.libMixed')
                        : $t('settings.libUnknown')
              }}
            </div>
          </div>
        </div>
        <button
          class="px-2 py-1 text-xs text-red-400 hover:text-red-300 transition-colors shrink-0"
          @click="library.removeFolder(entry.path)"
        >
          {{ $t('settings.libRemove') }}
        </button>
      </div>
    </SettingsCard>

    <div v-if="library.isScanning" class="text-xs text-fg-faint">
      {{ library.scanProgress.current }} / {{ library.scanProgress.total }} folderów...
    </div>

    <div v-if="library.totalCount > 0" class="text-xs text-fg-faint">
      {{ $t('settings.libTotal') }} {{ library.totalCount }} {{ $t('library.files') }} ({{
        library.audioCount
      }}
      {{ $t('settings.libAudio').toLowerCase() }}, {{ library.videoCount }}
      {{ $t('settings.libVideo').toLowerCase() }})
    </div>
  </SettingsPanel>
</template>
