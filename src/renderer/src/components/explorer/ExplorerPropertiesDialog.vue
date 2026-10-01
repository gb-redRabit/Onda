<script setup lang="ts">
import ModalShell from '@renderer/components/ui/ModalShell.vue';
import { useUnsavedGuard } from '@renderer/composables/useUnsavedGuard';
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { FolderOpen, FileText, X } from '@lucide/vue';
import { logger } from '@shared/logger';
import { formatFileSize } from '@renderer/utils/formatters';
import type { FileItem } from '@renderer/types/explorer';
import { useUIStore } from '@renderer/stores/ui';

interface PropertiesData {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  createdAt: number;
  modifiedAt: number;
  itemCount?: number;
  dirCount?: number;
  fileCount?: number;
  totalSize?: number;
  truncated?: boolean;
}

const props = defineProps<{
  item: FileItem;
}>();

const emit = defineEmits<{
  close: [];
  renamed: [];
}>();

const propertiesData = ref<PropertiesData | null>(null);
const propertiesName = ref(props.item.name);

watch(
  () => props.item,
  (item) => {
    propertiesName.value = item.name;
    propertiesData.value = null;
    window.api
      ?.invoke('fs:getProperties', item.path)
      .then((data) => {
        propertiesData.value = (data as PropertiesData | null) || null;
      })
      .catch((err) => logger.error('Explorer', 'getProperties', err));
  },
  { immediate: true }
);

const ui = useUIStore();
const { t } = useI18n();
const { onOverlayClick } = useUnsavedGuard({
  isDirty: () => propertiesName.value.trim() !== props.item.name,
  onClose: () => emit('close'),
  onDirtyHint: () => ui.notify('warning', t('common.unsavedChangesClickAgain')),
  onCleanHint: () => ui.notify('info', t('common.clickAgainToClose'))
});
function closeProperties() {
  emit('close');
}

async function applyProperties() {
  const newName = propertiesName.value.trim();
  if (newName && newName !== props.item.name) {
    await window.api?.invoke('media:renameFile', props.item.path, newName);
    emit('renamed');
  }
  closeProperties();
}
</script>

<template>
  <ModalShell
    labelled-by="explorer-properties-dialog-title"
    panel-class="w-110 max-w-[92vw] overflow-hidden"
    @close="onOverlayClick"
    @escape="closeProperties"
  >
    <div class="flex items-center justify-between px-4 py-3 border-b border-base-300">
      <h3
        id="explorer-properties-dialog-title"
        class="text-sm font-semibold text-base-content flex items-center gap-2"
      >
        <FolderOpen v-if="item.isDirectory" :size="16" class="text-primary" />
        <FileText v-else :size="16" class="text-primary" />
        {{ $t('explorer.properties') }}
      </h3>
      <button
        class="fx-noise p-1 fx-depth rounded-field text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-colors"
        :aria-label="$t('common.close')"
        @click="closeProperties"
      >
        <X :size="14" />
      </button>
    </div>
    <div class="p-4 space-y-3">
      <div>
        <label class="text-[11px] text-base-content/50 uppercase tracking-wider">{{
          $t('explorer.name')
        }}</label>
        <input
          v-model="propertiesName"
          type="text"
          class="w-full mt-1 px-3 py-1.5 fx-depth rounded-field bg-base-100 border border-base-300 text-sm text-base-content outline-none focus:ring-1 focus:ring-primary"
          @keydown.enter="applyProperties"
        />
      </div>
      <div class="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-xs">
        <span class="text-base-content/50">{{ $t('explorer.propertiesType') }}</span>
        <span class="text-base-content">{{
          item.isDirectory ? $t('explorer.propertiesFolder') : item.extension || '—'
        }}</span>
        <span class="text-base-content/50">{{ $t('explorer.propertiesLocation') }}</span>
        <span class="text-base-content break-all font-mono">{{ item.path }}</span>
        <template v-if="item.isDirectory && propertiesData">
          <span class="text-base-content/50">{{ $t('explorer.propertiesSize') }}</span>
          <span class="text-base-content">{{ formatFileSize(propertiesData.totalSize || 0) }}</span>
          <span class="text-base-content/50">{{ $t('explorer.propertiesContains') }}</span>
          <span class="text-base-content">{{
            $t('explorer.propertiesContainsValue', {
              n: propertiesData.itemCount || 0,
              d: propertiesData.dirCount || 0,
              f: propertiesData.fileCount || 0
            })
          }}</span>
        </template>
        <template v-else>
          <span class="text-base-content/50">{{ $t('explorer.propertiesSize') }}</span>
          <span class="text-base-content">{{ formatFileSize(item.size) }}</span>
        </template>
        <span class="text-base-content/50">{{ $t('explorer.propertiesCreated') }}</span>
        <span class="text-base-content">{{ new Date(item.createdAt).toLocaleString() }}</span>
        <span class="text-base-content/50">{{ $t('explorer.propertiesModified') }}</span>
        <span class="text-base-content">{{ new Date(item.modifiedAt).toLocaleString() }}</span>
      </div>
    </div>
    <div class="flex justify-end gap-2 px-4 py-3 border-t border-base-300">
      <button
        class="fx-noise px-4 py-1.5 fx-depth rounded-field text-xs text-base-content/70 hover:bg-base-content/10 transition-colors"
        @click="closeProperties"
      >
        {{ $t('common.cancel') }}
      </button>
      <button
        class="fx-noise px-4 py-1.5 fx-depth rounded-field text-xs bg-primary text-primary-content hover:bg-primary/90 transition-colors"
        @click="applyProperties"
      >
        {{ $t('common.ok') }}
      </button>
    </div>
  </ModalShell>
</template>
