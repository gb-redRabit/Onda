<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { Plus, RefreshCw, Pencil, Trash2, Loader2, Globe } from '@lucide/vue';
import { useSourcesStore } from '@renderer/stores/sources';
import type { MediaSource, SourceItem } from '@renderer/types/sources';
import SourceCard from '@renderer/components/sources/SourceCard.vue';
import SourceEditorDialog from '@renderer/components/sources/SourceEditorDialog.vue';
import SourceDetailModal from '@renderer/components/sources/SourceDetailModal.vue';

const sources = useSourcesStore();

const showEditor = ref(false);
const editingSource = ref<MediaSource | null>(null);
const previewItem = ref<SourceItem | null>(null);
const downloadingItem = ref<SourceItem | null>(null);
const queryText = ref('');

const activeSource = computed(() => sources.activeSource);

const queryParams = computed(() => {
  const out: Record<string, string> = {};
  for (const line of queryText.value.split('\n')) {
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return out;
});

onMounted(async () => {
  if (!sources.isLoaded) await sources.loadSources();
  if (sources.activeSource) {
    await sources.fetchItems(Object.keys(queryParams.value).length ? queryParams.value : undefined);
  }
});

watch(
  () => [sources.activeSourceId, sources.activeEndpointId],
  async () => {
    if (sources.activeSource) {
      await sources.fetchItems(Object.keys(queryParams.value).length ? queryParams.value : undefined);
    } else {
      sources.items = [];
    }
  }
);

function openAdd() {
  editingSource.value = null;
  showEditor.value = true;
}

function openEdit(source: MediaSource) {
  editingSource.value = source;
  showEditor.value = true;
}

function refresh() {
  sources.fetchItems(Object.keys(queryParams.value).length ? queryParams.value : undefined);
}

async function onDownload(item: SourceItem) {
  downloadingItem.value = item;
  try {
    await sources.enqueueDownload(item);
  } finally {
    downloadingItem.value = null;
  }
}
</script>

<template>
  <div class="h-full flex">
    <div class="w-64 shrink-0 h-full flex flex-col border-r border-border-default bg-bg-overlay/40">
      <div class="flex items-center justify-between px-3 py-2.5 border-b border-border-default">
        <h2 class="text-sm font-semibold">{{ $t('sources.title') }}</h2>
        <button
          class="p-1.5 rounded-lg text-accent-base hover:bg-accent-base/10 transition-colors"
          :title="$t('sources.addSource')"
          @click="openAdd"
        >
          <Plus :size="16" />
        </button>
      </div>
      <div class="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
        <div
          v-for="s in sources.sources"
          :key="s.id"
          class="group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors"
          :class="s.id === sources.activeSourceId ? 'bg-accent-base/10 text-accent-base' : 'hover:bg-bg-hover'"
          @click="sources.setActive(s.id)"
        >
          <Globe :size="14" class="shrink-0" />
          <div class="flex-1 min-w-0">
            <p class="text-sm truncate">{{ s.name }}</p>
            <p class="text-[10px] text-fg-faint truncate">{{ s.endpoints.length }} endpoint(s)</p>
          </div>
          <div class="opacity-0 group-hover:opacity-100 flex items-center gap-0.5">
            <button
              class="p-1 rounded text-fg-faint hover:text-fg-base"
              :title="$t('common.edit')"
              @click.stop="openEdit(s)"
            >
              <Pencil :size="12" />
            </button>
            <button
              class="p-1 rounded text-fg-faint hover:text-red-base"
              :title="$t('common.delete')"
              @click.stop="sources.deleteSource(s.id)"
            >
              <Trash2 :size="12" />
            </button>
          </div>
        </div>
        <p v-if="!sources.sources.length" class="text-xs text-fg-faint px-2 py-4 text-center">
          {{ $t('sources.emptyList') }}
        </p>
      </div>
    </div>

    <div class="flex-1 min-w-0 h-full flex flex-col">
      <div v-if="activeSource" class="flex flex-col h-full">
        <div class="flex items-center gap-2 px-4 py-2 border-b border-border-default overflow-x-auto">
          <select
            v-model="sources.activeEndpointId"
            class="shrink-0 px-2.5 py-1.5 rounded-lg bg-bg-elevated border border-border-default text-xs focus:outline-none focus:ring-1 focus:ring-accent-base"
          >
            <option v-for="e in activeSource.endpoints" :key="e.id" :value="e.id">{{ e.name }}</option>
          </select>
          <input
            v-model="queryText"
            type="text"
            :placeholder="$t('sources.queryParams')"
            class="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
          />
          <button
            class="shrink-0 p-2 rounded-lg text-fg-muted hover:bg-bg-hover transition-colors disabled:opacity-50"
            :title="$t('sources.refresh')"
            :disabled="sources.loading"
            @click="refresh"
          >
            <Loader2 v-if="sources.loading" :size="14" class="animate-spin" />
            <RefreshCw v-else :size="14" />
          </button>
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto p-4">
          <p v-if="sources.lastError" class="text-xs text-red-base mb-3">{{ sources.lastError }}</p>
          <div
            v-if="sources.items.length"
            class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4"
          >
            <SourceCard
              v-for="(item, i) in sources.items"
              :key="item.id || `${sources.activeEndpointId}-${i}`"
              :item="item"
              :downloading="downloadingItem === item"
              @preview="previewItem = $event"
              @download="onDownload"
            />
          </div>
          <div v-else-if="!sources.loading" class="h-full flex flex-col items-center justify-center gap-2 text-fg-faint">
            <Globe :size="32" class="opacity-50" />
            <p class="text-sm">{{ $t('sources.noItems') }}</p>
          </div>
          <button
            v-if="sources.hasMore && sources.items.length"
            class="mt-4 mx-auto block px-4 py-2 rounded-lg bg-bg-elevated border border-border-default text-xs text-fg-muted hover:bg-bg-hover transition-colors disabled:opacity-50"
            :disabled="sources.loading"
            @click="sources.fetchMore()"
          >
            {{ $t('sources.loadMore') }}
          </button>
        </div>
      </div>

      <div v-else class="flex-1 flex flex-col items-center justify-center gap-3 text-fg-faint">
        <Globe :size="40" class="opacity-50" />
        <p class="text-sm">{{ $t('sources.emptyList') }}</p>
        <button
          class="px-4 py-2 rounded-lg bg-accent-base text-white text-sm font-medium hover:bg-accent-strong transition-colors"
          @click="openAdd"
        >
          {{ $t('sources.addFirstSource') }}
        </button>
      </div>
    </div>

    <SourceEditorDialog
      v-if="showEditor"
      :source="editingSource"
      @close="showEditor = false"
      @saved="refresh"
    />
    <SourceDetailModal :item="previewItem" @close="previewItem = null" @download="onDownload" />
  </div>
</template>