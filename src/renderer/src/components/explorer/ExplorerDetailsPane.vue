<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { FileText, FolderOpen, Info, X } from '@lucide/vue';
import MediaCover from '@renderer/components/MediaCover.vue';
import { formatFileSize } from '@renderer/utils/formatters';
import { logger } from '@shared/logger';
import { AUDIO_EXTS, VIDEO_EXTS } from '@shared/constants';
import type { FileItem } from '@renderer/types/explorer';

// Panel szczegółów zaznaczenia: odpowiednik okna Właściwości, ale widoczny
// cały czas obok listy, więc nie trzeba go otwierać i zamykać przy każdym pliku.
// Rozmiar folderu liczy main (`fs:getProperties`), dlatego panel pokazuje stan
// ładowania zamiast blokować interfejs.

interface PropertiesData {
  size: number;
  createdAt: number;
  modifiedAt: number;
  itemCount?: number;
  dirCount?: number;
  fileCount?: number;
  totalSize?: number;
}

const props = defineProps<{
  item: FileItem | null;
  selectedCount: number;
}>();

const emit = defineEmits<{
  close: [];
  properties: [item: FileItem];
}>();

const { t } = useI18n();
const details = ref<PropertiesData | null>(null);
const loading = ref(false);

watch(
  () => props.item?.path,
  async (path) => {
    details.value = null;
    loading.value = false;
    if (!path) return;
    loading.value = true;
    try {
      const data = await window.api?.invoke('fs:getProperties', path);
      // Zaznaczenie mogło się zmienić, zanim main policzył rozmiar folderu.
      if (props.item?.path !== path) return;
      details.value = (data as PropertiesData | null) ?? null;
    } catch (error) {
      logger.error('Explorer', 'getProperties', error);
    } finally {
      if (props.item?.path === path) loading.value = false;
    }
  },
  { immediate: true }
);

const previewable = computed(() => {
  const ext = props.item?.extension ?? '';
  return !props.item?.isDirectory && (AUDIO_EXTS.includes(ext) || VIDEO_EXTS.includes(ext));
});

const isVideo = computed(() => {
  const ext = props.item?.extension ?? '';
  return VIDEO_EXTS.includes(ext);
});

const sizeLabel = computed(() => {
  if (!props.item) return '';
  if (!props.item.isDirectory) return formatFileSize(props.item.size);
  if (!details.value) return '—';
  return formatFileSize(details.value.totalSize || 0);
});

function formatDate(value: number): string {
  return new Date(value).toLocaleString();
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close');
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <aside
    data-testid="explorer-details"
    class="flex w-64 shrink-0 flex-col border-l border-hairline/80 bg-base-100/(--glass-alpha)"
  >
    <div
      class="flex shrink-0 items-center justify-between gap-2 border-b border-hairline/80 px-3 py-2"
    >
      <span
        class="flex items-center gap-2 text-2xs font-semibold uppercase tracking-wider text-base-content/50"
      >
        <Info :size="13" class="text-primary-text" />
        {{ t('explorer.detailsTitle') }}
      </span>
      <button
        type="button"
        class="fx-noise rounded-field p-1 text-base-content/60 transition-colors hover:bg-base-content/10 hover:text-base-content"
        data-testid="explorer-details-close"
        :title="t('common.close')"
        :aria-label="t('common.close')"
        @click="emit('close')"
      >
        <X :size="14" class="pointer-events-none" />
      </button>
    </div>

    <div class="flex-1 overflow-y-auto p-3">
      <p v-if="!item && selectedCount === 0" class="text-xs leading-relaxed text-base-content/55">
        {{ t('explorer.detailsEmpty') }}
      </p>
      <p v-else-if="!item" class="text-xs leading-relaxed text-base-content/55">
        {{ t('explorer.detailsMultiple', { n: selectedCount }) }}
      </p>

      <template v-else>
        <div class="flex items-center justify-center">
          <div
            class="grid h-24 w-24 place-items-center overflow-hidden rounded-box border border-hairline bg-base-200"
          >
            <MediaCover
              v-if="previewable"
              :path="item.path"
              :size="96"
              still
              :fallback="isVideo ? 'film' : 'music'"
            />
            <FolderOpen v-else-if="item.isDirectory" :size="34" class="text-primary-text" />
            <FileText v-else :size="34" class="text-base-content/50" />
          </div>
        </div>

        <p
          class="mt-3 selectable break-words text-center text-xs font-medium leading-snug text-base-content"
          :title="item.name"
        >
          {{ item.name }}
        </p>

        <dl class="mt-3 grid grid-cols-[76px_1fr] gap-x-2 gap-y-1.5 text-2xs">
          <dt class="text-base-content/50">{{ t('explorer.propertiesType') }}</dt>
          <dd class="min-w-0 break-words text-base-content">
            {{ item.isDirectory ? t('explorer.propertiesFolder') : item.extension || '—' }}
          </dd>

          <dt class="text-base-content/50">{{ t('explorer.propertiesSize') }}</dt>
          <dd class="min-w-0 text-base-content">
            <span v-if="loading && item.isDirectory" class="text-base-content/50">…</span>
            <span v-else>{{ sizeLabel }}</span>
          </dd>

          <template v-if="item.isDirectory && details">
            <dt class="text-base-content/50">{{ t('explorer.propertiesContains') }}</dt>
            <dd class="min-w-0 text-base-content">
              {{
                t('explorer.propertiesContainsValue', {
                  n: details.itemCount || 0,
                  d: details.dirCount || 0,
                  f: details.fileCount || 0
                })
              }}
            </dd>
          </template>

          <dt class="text-base-content/50">{{ t('explorer.propertiesModified') }}</dt>
          <dd class="min-w-0 text-base-content">{{ formatDate(item.modifiedAt) }}</dd>

          <dt class="text-base-content/50">{{ t('explorer.propertiesCreated') }}</dt>
          <dd class="min-w-0 text-base-content">{{ formatDate(item.createdAt) }}</dd>

          <dt class="text-base-content/50">{{ t('explorer.propertiesLocation') }}</dt>
          <dd class="min-w-0 selectable break-all font-mono text-3xs text-base-content/70">
            {{ item.path }}
          </dd>
        </dl>

        <button
          type="button"
          class="interactive mt-3 w-full rounded-field border border-hairline px-2 py-1.5 text-2xs text-base-content/70"
          data-testid="explorer-details-properties"
          @click="emit('properties', item)"
        >
          {{ t('explorer.properties') }}
        </button>
      </template>
    </div>
  </aside>
</template>
