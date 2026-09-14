<script setup lang="ts">
import { useSettingsStore } from '@renderer/stores/settings';
import SettingsPanel from '@renderer/components/settings/SettingsPanel.vue';
import SettingsCard from '@renderer/components/settings/SettingsCard.vue';
import SettingsSectionTitle from '@renderer/components/settings/SettingsSectionTitle.vue';
import SettingsDownloadProfiles from '@renderer/components/settings/SettingsDownloadProfiles.vue';
import { FolderOpen } from '@lucide/vue';

const settings = useSettingsStore();

async function pickDownloadPath() {
  const paths = (await window.api.invoke('dialog:openFolder')) as string[];
  if (paths.length > 0) settings.updateDownload({ defaultPath: paths[0] });
}
async function pickSourcesPath() {
  const paths = (await window.api.invoke('dialog:openFolder')) as string[];
  if (paths.length > 0) settings.updateDownload({ sourcesDir: paths[0] });
}
async function pickTempDir() {
  const paths = (await window.api.invoke('dialog:openFolder')) as string[];
  if (paths.length > 0) settings.updateDownload({ tempDir: paths[0] });
}
function onSourcesFolderChange(e: Event) {
  settings.updateDownload({ sourcesFolder: (e.target as HTMLInputElement).checked });
}
</script>

<template>
  <SettingsPanel :title="$t('settings.downloadSection')">
    <SettingsCard>
      <SettingsSectionTitle
        :title="$t('settings.downloadPath')"
        :description="$t('settings.downloadPathDesc')"
      />
      <div class="flex items-center gap-2">
        <input
          :value="settings.download.defaultPath"
          readonly
          class="flex-1 px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm"
          :placeholder="$t('settings.downloadPathPlaceholder')"
        />
        <button
          class="fx-noise flex items-center gap-1.5 px-4 py-2 fx-depth rounded-field bg-primary text-primary-content text-sm font-medium hover:bg-primary/90 shrink-0"
          @click="pickDownloadPath"
        >
          <FolderOpen :size="14" />{{ $t('settings.chooseFolder') }}
        </button>
      </div>
    </SettingsCard>
    <SettingsCard>
      <SettingsSectionTitle
        :title="$t('settings.sourcesPath')"
        :description="$t('settings.sourcesPathDesc')"
      />
      <div class="flex items-center gap-2">
        <input
          :value="settings.download.sourcesDir"
          readonly
          class="flex-1 px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm"
          :placeholder="$t('settings.sourcesPathPlaceholder')"
        />
        <button
          class="fx-noise flex items-center gap-1.5 px-4 py-2 fx-depth rounded-field bg-primary text-primary-content text-sm font-medium hover:bg-primary/90 shrink-0"
          @click="pickSourcesPath"
        >
          <FolderOpen :size="14" />{{ $t('settings.chooseFolder') }}
        </button>
      </div>
      <p class="text-xs text-base-content/50 mt-2">{{ $t('settings.sourcesPathHint') }}</p>
      <label class="flex items-center gap-2 mt-3 cursor-pointer"
        ><input
          type="checkbox"
          class="accent-primary"
          :checked="settings.download.sourcesFolder"
          @change="onSourcesFolderChange"
        /><span class="text-sm">{{ $t('settings.sourcesFolder') }}</span></label
      >
    </SettingsCard>
    <SettingsCard>
      <SettingsSectionTitle
        :title="$t('settings.tempDir')"
        :description="$t('settings.tempDirDesc')"
      />
      <div class="flex items-center gap-2">
        <input
          :value="settings.download.tempDir || ''"
          readonly
          class="flex-1 px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm"
          :placeholder="$t('settings.tempDirPlaceholder')"
        />
        <button
          class="fx-noise flex items-center gap-1.5 px-4 py-2 fx-depth rounded-field bg-primary text-primary-content text-sm font-medium hover:bg-primary/90 shrink-0"
          @click="pickTempDir"
        >
          <FolderOpen :size="14" />{{ $t('settings.chooseFolder') }}
        </button>
        <button
          v-if="settings.download.tempDir"
          class="px-3 py-2 text-xs text-base-content/50 hover:text-base-content"
          @click="settings.updateDownload({ tempDir: '' })"
        >
          {{ $t('common.clear') }}
        </button>
      </div>
    </SettingsCard>
    <SettingsDownloadProfiles />
  </SettingsPanel>
</template>
