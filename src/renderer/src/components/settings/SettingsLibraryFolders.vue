<script setup lang="ts">
import { computed } from 'vue';
import { useLibraryStore } from '@renderer/stores/library';
import { useUIStore } from '@renderer/stores/ui';
import { useSettingsStore } from '@renderer/stores/settings';
import { useI18n } from 'vue-i18n';
import { FolderPlus, FolderSearch, Trash2 } from '@lucide/vue';
import SettingsGroup from '@renderer/components/settings/SettingsGroup.vue';
import SettingsRow from '@renderer/components/settings/SettingsRow.vue';
import { usePromptDialog } from '@renderer/composables/usePromptDialog';
import ExplorerPromptDialog from '@renderer/components/explorer/ExplorerPromptDialog.vue';
import Slider from '@renderer/components/ui/Slider.vue';

const library = useLibraryStore();
const ui = useUIStore();
const settings = useSettingsStore();
const { t } = useI18n();
const prompt = usePromptDialog();

async function removeFolder(path: string) {
  if (!(await prompt.showConfirm(t('settings.libRemoveConfirm')))) return;
  library.removeFolder(path);
}

async function clearCoverCache() {
  if (!(await prompt.showConfirm(t('settings.coverCacheClearConfirm')))) return;
  try {
    const res = await window.api?.invoke('coverCache:clear');
    if (res?.success) ui.notify('success', t('settings.coverCacheCleared'));
    else ui.notify('error', t('settings.coverCacheClearError'), res?.error);
  } catch (e) {
    ui.notify('error', t('settings.coverCacheClearError'), String(e));
  }
}

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
  <div class="flex items-center gap-3">
    <button
      type="button"
      class="flex items-center gap-2 px-4 py-2 fx-depth rounded-box fx-noise bg-base-100 border border-hairline text-sm font-medium hover:bg-base-content/10 transition-colors"
      @click="addFolder"
    >
      <FolderPlus :size="16" />{{ $t('settings.libAddFolder') }}
    </button>
    <button
      type="button"
      class="fx-noise flex items-center gap-2 px-4 py-2 fx-depth rounded-field bg-primary text-primary-content text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
      :disabled="library.isScanning || library.folders.length === 0"
      @click="scan"
    >
      <FolderSearch :size="16" />
      {{ library.isScanning ? $t('settings.libScanning') : $t('settings.libScanNow') }}
    </button>
    <button
      v-if="library.isScanning"
      type="button"
      class="fx-noise flex items-center gap-2 px-4 py-2 fx-depth rounded-field border border-hairline text-sm font-medium text-base-content/70 hover:bg-base-content/10 transition-colors"
      @click="library.cancelScan()"
    >
      {{ $t('common.cancel') }}
    </button>
  </div>

  <div v-if="library.folders.length === 0" class="text-sm text-base-content/50 italic py-4">
    {{ $t('settings.libEmpty') }}
  </div>

  <SettingsGroup v-else :padded="false">
    <div
      v-for="entry in folderEntries"
      :key="entry.path"
      class="flex items-center justify-between px-4 py-3 border-b border-hairline last:border-b-0"
    >
      <div class="flex items-center gap-3 min-w-0">
        <span class="text-lg">{{ folderIcon(entry.type) }}</span>
        <div class="min-w-0">
          <div class="text-sm font-medium truncate">{{ entry.path }}</div>
          <div class="text-xs text-base-content/50 mt-0.5">
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
        type="button"
        class="px-2 py-1 text-xs text-error hover:text-error/80 transition-colors shrink-0"
        @click="removeFolder(entry.path)"
      >
        {{ $t('settings.libRemove') }}
      </button>
    </div>
  </SettingsGroup>

  <div v-if="library.isScanning" class="text-xs text-base-content/50">
    {{ library.scanProgress.current }} / {{ library.scanProgress.total }}
    {{ $t('settings.libProgress').toLowerCase() }}...
  </div>

  <div v-if="library.totalCount > 0" class="text-xs text-base-content/50">
    {{ $t('home.statFiles') }}: {{ library.totalCount }} ({{ $t('home.statAudio') }}:
    {{ library.audioCount }}, {{ $t('home.statVideo') }}: {{ library.videoCount }})
  </div>

  <SettingsGroup :title="$t('settings.coverCache')" :description="$t('settings.coverCacheDesc')">
    <SettingsRow
      :label="$t('settings.coverCache')"
      :description="$t('settings.coverCacheHint')"
      path="library.coverCacheMaxEntries"
      wide
    >
      <div class="w-full">
        <Slider
          :model-value="settings.library.coverCacheMaxEntries ?? 2000"
          :label="$t('settings.coverCache')"
          :min="500"
          :max="10000"
          :step="500"
          :value-text="String(settings.library.coverCacheMaxEntries ?? 2000)"
          @update:model-value="settings.updateLibrary({ coverCacheMaxEntries: $event })"
        />
        <div class="mt-1 flex justify-between text-2xs text-base-content/60">
          <span>500</span><span>10 000</span>
        </div>
      </div>
    </SettingsRow>
    <div class="flex justify-end py-2">
      <button
        type="button"
        class="fx-noise flex items-center gap-1.5 rounded-field border border-hairline px-3 py-1.5 text-xs font-medium text-base-content/70 transition-colors hover:bg-base-content/10"
        @click="clearCoverCache"
      >
        <Trash2 :size="14" />{{ $t('settings.coverCacheClear') }}
      </button>
    </div>
  </SettingsGroup>

  <ExplorerPromptDialog
    :visible="prompt.promptVisible.value"
    :is-confirm="prompt.promptIsConfirm.value"
    :message="prompt.promptMessage.value"
    :value="prompt.promptValue.value"
    @update:value="prompt.promptValue.value = $event"
    @confirm="prompt.promptConfirm"
    @cancel="prompt.promptCancel"
  />
</template>
