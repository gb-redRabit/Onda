<script setup lang="ts">
import { computed } from 'vue';
import { useLibraryStore } from '@renderer/stores/library';
import { useUIStore } from '@renderer/stores/ui';
import { useSettingsStore } from '@renderer/stores/settings';
import { useI18n } from 'vue-i18n';
import { FolderPlus, FolderSearch, Trash2 } from '@lucide/vue';
import SettingsPanel from '@renderer/components/settings/SettingsPanel.vue';
import SettingsCard from '@renderer/components/settings/SettingsCard.vue';
import SettingsSectionTitle from '@renderer/components/settings/SettingsSectionTitle.vue';

const library = useLibraryStore();
const ui = useUIStore();
const settings = useSettingsStore();
const { t } = useI18n();

async function clearCoverCache() {
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
  <SettingsPanel :title="$t('settings.libTitle')" :description="$t('settings.libDesc')">
    <div class="flex items-center gap-3">
      <button
        class="flex items-center gap-2 px-4 py-2 fx-depth rounded-box fx-noise bg-base-100 border border-base-300 text-sm font-medium hover:bg-base-content/10 transition-colors"
        @click="addFolder"
      >
        <FolderPlus :size="16" />{{ $t('settings.libAddFolder') }}
      </button>
      <button
        class="fx-noise flex items-center gap-2 px-4 py-2 fx-depth rounded-field bg-primary text-primary-content text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        :disabled="library.isScanning || library.folders.length === 0"
        @click="scan"
      >
        <FolderSearch :size="16" />
        {{ library.isScanning ? $t('settings.libScanning') : $t('settings.libScanNow') }}
      </button>
      <button
        v-if="library.isScanning"
        class="fx-noise flex items-center gap-2 px-4 py-2 fx-depth rounded-field border border-base-300 text-sm font-medium text-base-content/70 hover:bg-base-content/10 transition-colors"
        @click="library.cancelScan()"
      >
        {{ $t('common.cancel') }}
      </button>
    </div>

    <div v-if="library.folders.length === 0" class="text-sm text-base-content/50 italic py-4">
      {{ $t('settings.libEmpty') }}
    </div>

    <SettingsCard v-else :padded="false">
      <div
        v-for="entry in folderEntries"
        :key="entry.path"
        class="flex items-center justify-between px-4 py-3 border-b border-base-300 last:border-b-0"
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
          class="px-2 py-1 text-xs text-error hover:text-error/80 transition-colors shrink-0"
          @click="library.removeFolder(entry.path)"
        >
          {{ $t('settings.libRemove') }}
        </button>
      </div>
    </SettingsCard>

    <div v-if="library.isScanning" class="text-xs text-base-content/50">
      {{ library.scanProgress.current }} / {{ library.scanProgress.total }}
      {{ $t('settings.libProgress').toLowerCase() }}...
    </div>

    <div v-if="library.totalCount > 0" class="text-xs text-base-content/50">
      {{ $t('settings.libTotal') }} {{ library.totalCount }} {{ $t('library.files') }} ({{
        library.audioCount
      }}
      {{ $t('settings.libAudio').toLowerCase() }}, {{ library.videoCount }}
      {{ $t('settings.libVideo').toLowerCase() }})
    </div>

    <SettingsCard>
      <SettingsSectionTitle
        :title="`${$t('settings.coverCache')} — ${settings.library.coverCacheMaxEntries ?? 2000}`"
        :description="$t('settings.coverCacheDesc')"
      />
      <input
        type="range"
        min="500"
        max="10000"
        step="500"
        :value="settings.library.coverCacheMaxEntries ?? 2000"
        class="w-full"
        @input="
          settings.updateLibrary({
            coverCacheMaxEntries: parseInt(($event.target as HTMLInputElement).value) || 2000
          })
        "
      />
      <div class="flex justify-between text-[10px] text-base-content/40 mt-1">
        <span>500</span><span>10 000</span>
      </div>
      <p class="text-[11px] text-base-content/50 mt-2">{{ $t('settings.coverCacheHint') }}</p>
      <button
        class="fx-noise mt-3 flex items-center gap-1.5 px-3 py-1.5 fx-depth rounded-field border border-base-300 text-xs font-medium text-base-content/70 hover:bg-base-content/10 transition-colors"
        @click="clearCoverCache"
      >
        <Trash2 :size="14" />{{ $t('settings.coverCacheClear') }}
      </button>
    </SettingsCard>
  </SettingsPanel>
</template>
