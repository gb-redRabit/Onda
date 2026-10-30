<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { FolderOpen } from '@lucide/vue';
import Input from '@renderer/components/ui/Input.vue';
import Button from '@renderer/components/ui/Button.vue';
import Switch from '@renderer/components/ui/Switch.vue';

// Współdzielony wybór folderu wyjściowego dla dialogów pobierania i subskrypcji.
// Jeden tryb naraz: globalny, podfolder kanału, podfolder playlisty albo własna
// ścieżka — przełączniki są wzajemnie wykluczające, więc nie da się ustawić
// sprzecznej kombinacji.
defineProps<{
  channelFolder: string;
  playlistFolder?: string;
  channelTitle?: string;
  playlistTitle?: string;
}>();
const folderMode = defineModel<'global' | 'channel' | 'playlist' | 'custom'>('folderMode', {
  required: true
});
const outputDir = defineModel<string>('outputDir', { required: true });

async function pickOutputDir() {
  const paths = (await window.api.invoke('dialog:openFolder')) as string[];
  if (paths.length > 0) outputDir.value = paths[0];
}

const { t } = useI18n();

const custom = computed({
  get: () => folderMode.value === 'custom',
  set: (on: boolean) => (folderMode.value = on ? 'custom' : 'global')
});
const useChannel = computed({
  get: () => folderMode.value === 'channel',
  set: (on: boolean) => (folderMode.value = on ? 'channel' : 'global')
});
const usePlaylist = computed({
  get: () => folderMode.value === 'playlist',
  set: (on: boolean) => (folderMode.value = on ? 'playlist' : 'global')
});
</script>

<template>
  <section>
    <p class="mb-2 text-xs font-medium uppercase tracking-wider text-base-content/50">
      {{ t('youtube.prefOutputDir') }}
    </p>
    <div class="space-y-2 text-xs text-base-content/70">
      <p v-if="folderMode === 'global'" class="text-2xs text-base-content/50">
        {{ t('youtube.prefOutputDirGlobal') }}
      </p>

      <div v-if="channelTitle" class="space-y-1">
        <div class="flex items-center gap-2">
          <Switch v-model="useChannel" size="sm" :label="t('youtube.prefOutputDirChannel')" />
          <span>{{ t('youtube.prefOutputDirChannel') }}</span>
        </div>
        <p
          v-if="folderMode === 'channel'"
          class="truncate pl-11 text-2xs text-base-content/50"
          :title="channelFolder"
        >
          {{ t('youtube.prefOutputDirChannelHint', { folder: channelFolder }) }}
        </p>
      </div>

      <div v-if="playlistTitle" class="space-y-1">
        <div class="flex items-center gap-2">
          <Switch v-model="usePlaylist" size="sm" :label="t('youtube.folderModePlaylist')" />
          <span>{{ t('youtube.folderModePlaylist') }}</span>
        </div>
        <p
          v-if="folderMode === 'playlist' && playlistFolder"
          class="truncate pl-11 text-2xs text-base-content/50"
          :title="playlistFolder"
        >
          {{ t('youtube.folderModePlaylistHint', { folder: playlistFolder }) }}
        </p>
      </div>

      <div class="flex items-center gap-2">
        <Switch v-model="custom" size="sm" :label="t('youtube.prefOutputDirCustom')" />
        <span>{{ t('youtube.prefOutputDirCustom') }}</span>
      </div>

      <div v-if="folderMode === 'custom'" class="flex items-center gap-2 pl-11">
        <Input
          v-model="outputDir"
          readonly
          :placeholder="t('youtube.prefOutputDirPlaceholder')"
          class="min-w-0 flex-1"
          :aria-label="t('youtube.prefOutputDirCustom')"
        />
        <Button
          variant="outline"
          size="icon"
          class="shrink-0"
          :label="t('sources.chooseFolder')"
          :title="t('sources.chooseFolder')"
          @click="pickOutputDir"
        >
          <FolderOpen :size="14" />
        </Button>
      </div>
    </div>
  </section>
</template>
