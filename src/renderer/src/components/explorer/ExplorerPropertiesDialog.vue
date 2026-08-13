<script setup lang="ts">
import { ref, watch } from 'vue';
import { FolderOpen, FileText, X } from '@lucide/vue';
import { logger } from '@shared/logger';
import { formatFileSize } from '@renderer/utils/formatters';
import type { FileItem } from '@renderer/types/explorer';

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
  <Teleport to="body">
    <div
      class="fixed inset-0 z-9999 bg-black/50 flex items-center justify-center"
      @click.self="closeProperties"
    >
      <div
        class="bg-bg-surface border border-border-default rounded-xl w-110 max-w-[92vw] shadow-2xl overflow-hidden"
      >
        <div class="flex items-center justify-between px-4 py-3 border-b border-border-default">
          <h3 class="text-sm font-semibold text-fg-base flex items-center gap-2">
            <FolderOpen v-if="item.isDirectory" :size="16" class="text-accent-base" />
            <FileText v-else :size="16" class="text-accent-base" />
            {{ $t('explorer.properties') }}
          </h3>
          <button
            class="p-1 rounded-md text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-colors"
            @click="closeProperties"
          >
            <X :size="14" />
          </button>
        </div>
        <div class="p-4 space-y-3">
          <div>
            <label class="text-[11px] text-fg-faint uppercase tracking-wider">{{
              $t('explorer.name')
            }}</label>
            <input
              v-model="propertiesName"
              type="text"
              class="w-full mt-1 px-3 py-1.5 rounded-lg bg-bg-elevated border border-border-default text-sm text-fg-base outline-none focus:ring-1 focus:ring-accent-base"
              @keydown.enter="applyProperties"
            />
          </div>
          <div class="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-xs">
            <span class="text-fg-faint">{{ $t('explorer.propertiesType') }}</span>
            <span class="text-fg-base">{{
              item.isDirectory ? $t('explorer.propertiesFolder') : item.extension || '—'
            }}</span>
            <span class="text-fg-faint">{{ $t('explorer.propertiesLocation') }}</span>
            <span class="text-fg-base break-all font-mono">{{ item.path }}</span>
            <template v-if="item.isDirectory && propertiesData">
              <span class="text-fg-faint">{{ $t('explorer.propertiesSize') }}</span>
              <span class="text-fg-base">{{ formatFileSize(propertiesData.totalSize || 0) }}</span>
              <span class="text-fg-faint">{{ $t('explorer.propertiesContains') }}</span>
              <span class="text-fg-base">{{
                $t('explorer.propertiesContainsValue', {
                  n: propertiesData.itemCount || 0,
                  d: propertiesData.dirCount || 0,
                  f: propertiesData.fileCount || 0
                })
              }}</span>
            </template>
            <template v-else>
              <span class="text-fg-faint">{{ $t('explorer.propertiesSize') }}</span>
              <span class="text-fg-base">{{ formatFileSize(item.size) }}</span>
            </template>
            <span class="text-fg-faint">{{ $t('explorer.propertiesCreated') }}</span>
            <span class="text-fg-base">{{ new Date(item.createdAt).toLocaleString() }}</span>
            <span class="text-fg-faint">{{ $t('explorer.propertiesModified') }}</span>
            <span class="text-fg-base">{{ new Date(item.modifiedAt).toLocaleString() }}</span>
          </div>
        </div>
        <div class="flex justify-end gap-2 px-4 py-3 border-t border-border-default">
          <button
            class="px-4 py-1.5 rounded-lg text-xs text-fg-muted hover:bg-bg-hover transition-colors"
            @click="closeProperties"
          >
            {{ $t('common.cancel') }}
          </button>
          <button
            class="px-4 py-1.5 rounded-lg text-xs bg-accent-base text-white hover:bg-accent-base/90 transition-colors"
            @click="applyProperties"
          >
            {{ $t('common.ok') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
