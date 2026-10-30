<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { FolderOpen } from '@lucide/vue';
import FormField from '@renderer/components/ui/FormField.vue';
import Input from '@renderer/components/ui/Input.vue';
import Select from '@renderer/components/ui/Select.vue';
import Button from '@renderer/components/ui/Button.vue';

// Współdzielony wybór folderu wyjściowego używany przez dialogi konfiguracji
// pobierania i subskrypcji. Opcja kanału pokazuje się tylko, gdy dostępny jest tytuł
// kanału, a opcja playlisty tylko dla zadań pobierania, które niosą playlistę.
const props = defineProps<{
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

// Podpowiedź pokazuje, gdzie ostatecznie trafi plik — bez osobnej linijki pod polem.
const hint = computed(() => {
  if (folderMode.value === 'channel') {
    return t('youtube.prefOutputDirChannelHint', { folder: props.channelFolder });
  }
  if (folderMode.value === 'playlist') {
    return props.playlistFolder
      ? t('youtube.folderModePlaylistHint', { folder: props.playlistFolder })
      : '';
  }
  return '';
});
</script>

<template>
  <section>
    <FormField :label="t('youtube.prefOutputDir')" :hint="hint">
      <template #default="{ id }">
        <div class="flex items-center gap-2">
          <Select :id="id" v-model="folderMode">
            <option value="global">{{ t('youtube.prefOutputDirGlobal') }}</option>
            <option v-if="channelTitle" value="channel">
              {{ t('youtube.prefOutputDirChannel') }}
            </option>
            <option v-if="playlistTitle" value="playlist">
              {{ t('youtube.folderModePlaylist') }}
            </option>
            <option value="custom">{{ t('youtube.prefOutputDirCustom') }}</option>
          </Select>
        </div>
      </template>
    </FormField>
    <div v-if="folderMode === 'custom'" class="mt-1.5 flex items-center gap-2">
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
  </section>
</template>
