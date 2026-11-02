<script setup lang="ts">
import { useSettingsStore } from '@renderer/stores/settings';
import SettingsDownloadProfiles from '@renderer/components/settings/SettingsDownloadProfiles.vue';
import SettingsGroup from '@renderer/components/settings/SettingsGroup.vue';
import Checkbox from '@renderer/components/ui/Checkbox.vue';
import PathInput from '@renderer/components/ui/PathInput.vue';
import { pickFolder } from '@renderer/utils/pickFolder';

const settings = useSettingsStore();

async function pickDownloadPath() {
  const dir = await pickFolder();
  if (dir) settings.updateDownload({ defaultPath: dir });
}

async function pickSourcesPath() {
  const dir = await pickFolder();
  if (dir) settings.updateDownload({ sourcesDir: dir });
}

async function pickTempDir() {
  const dir = await pickFolder();
  if (dir) settings.updateDownload({ tempDir: dir });
}

function onSourcesFolderChange(value: boolean) {
  settings.updateDownload({ sourcesFolder: value });
}
</script>

<template>
  <SettingsGroup
    :title="$t('settings.downloadPath')"
    :description="$t('settings.downloadPathDesc')"
  >
    <PathInput
      :model-value="settings.download.defaultPath"
      :label="$t('settings.downloadPath')"
      :placeholder="$t('settings.downloadPathPlaceholder')"
      @browse="pickDownloadPath"
    />
  </SettingsGroup>

  <SettingsGroup :title="$t('settings.sourcesPath')" :description="$t('settings.sourcesPathDesc')">
    <PathInput
      :model-value="settings.download.sourcesDir"
      :label="$t('settings.sourcesPath')"
      :placeholder="$t('settings.sourcesPathPlaceholder')"
      @browse="pickSourcesPath"
    />
    <p class="mt-2 text-xs text-base-content/50">{{ $t('settings.sourcesPathHint') }}</p>
    <Checkbox
      class="mt-3"
      :model-value="settings.download.sourcesFolder"
      :label="$t('settings.sourcesFolder')"
      @update:model-value="onSourcesFolderChange"
    />
  </SettingsGroup>

  <SettingsGroup :title="$t('settings.tempDir')" :description="$t('settings.tempDirDesc')">
    <PathInput
      :model-value="settings.download.tempDir || ''"
      :label="$t('settings.tempDir')"
      :placeholder="$t('settings.tempDirPlaceholder')"
      clearable
      @browse="pickTempDir"
    />
  </SettingsGroup>

  <SettingsDownloadProfiles />
</template>
