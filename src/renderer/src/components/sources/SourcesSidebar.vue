<script setup lang="ts">
import { Plus, Pencil, Trash2, Globe, HelpCircle, Upload, Download } from '@lucide/vue';
import type { MediaSource } from '@renderer/types/sources';

// Presentational source list (plan 6.3): all actions are emitted, the view owns
// the store, dialogs and toast.
defineProps<{
  sources: MediaSource[];
  activeSourceId: string | null;
  testStatus: Record<string, { success: boolean; error?: string }>;
}>();

const emit = defineEmits<{
  select: [id: string];
  add: [];
  edit: [source: MediaSource];
  remove: [id: string];
  exportAll: [];
  importAll: [];
  guide: [];
}>();
</script>

<template>
  <div
    class="w-64 shrink-0 h-full flex flex-col border-r border-base-300 bg-base-200/(--glass-alpha)"
  >
    <div class="flex items-center justify-between px-3 py-2.5 border-b border-base-300">
      <h2 class="text-sm font-semibold">{{ $t('sources.title') }}</h2>
      <div class="flex items-center gap-1">
        <button
          class="fx-noise p-1.5 fx-depth rounded-field text-base-content/70 hover:bg-base-content/10 hover:text-base-content transition-colors"
          :title="$t('sources.exportSources')"
          @click="emit('exportAll')"
        >
          <Upload :size="14" />
        </button>
        <button
          class="fx-noise p-1.5 fx-depth rounded-field text-base-content/70 hover:bg-base-content/10 hover:text-base-content transition-colors"
          :title="$t('sources.importSources')"
          @click="emit('importAll')"
        >
          <Download :size="14" />
        </button>
        <button
          class="fx-noise p-1.5 fx-depth rounded-field text-base-content/70 hover:bg-base-content/10 hover:text-base-content transition-colors"
          :title="$t('sources.guide.title')"
          @click="emit('guide')"
        >
          <HelpCircle :size="15" />
        </button>
        <button
          class="fx-noise p-1.5 fx-depth rounded-field text-primary hover:bg-primary/10 transition-colors"
          :title="$t('sources.addSource')"
          @click="emit('add')"
        >
          <Plus :size="16" />
        </button>
      </div>
    </div>
    <div class="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
      <div
        v-for="s in sources"
        :key="s.id"
        class="group flex items-center gap-2 px-2.5 py-2 rounded-field cursor-pointer transition-colors"
        :class="s.id === activeSourceId ? 'bg-primary/10 text-primary' : 'hover:bg-base-content/10'"
        @click="emit('select', s.id)"
      >
        <Globe v-if="!s.icon" :size="14" class="shrink-0" />
        <img v-else :src="s.icon" class="w-3.5 h-3.5 rounded-field object-cover shrink-0" alt="" />
        <span
          class="w-2 h-2 rounded-full shrink-0"
          :class="{
            'bg-success': testStatus[s.id]?.success,
            'bg-error': testStatus[s.id] && !testStatus[s.id].success,
            'bg-base-300': !testStatus[s.id]
          }"
          :title="
            testStatus[s.id]
              ? testStatus[s.id].error || $t('sources.testSourceOk')
              : $t('sources.testNotRun')
          "
        />
        <div class="flex-1 min-w-0">
          <p class="text-sm truncate">{{ s.name }}</p>
          <p class="text-[10px] text-base-content/50 truncate">
            {{ $t('sources.endpointCount', { n: s.endpoints.length }) }}
          </p>
        </div>
        <div class="opacity-0 group-hover:opacity-100 flex items-center gap-0.5">
          <button
            class="fx-noise p-1 fx-depth rounded-field text-base-content/50 hover:text-base-content"
            :title="$t('common.edit')"
            @click.stop="emit('edit', s)"
          >
            <Pencil :size="12" />
          </button>
          <button
            class="fx-noise p-1 fx-depth rounded-field text-base-content/50 hover:text-error"
            :title="$t('common.delete')"
            @click.stop="emit('remove', s.id)"
          >
            <Trash2 :size="12" />
          </button>
        </div>
      </div>
      <p v-if="!sources.length" class="text-xs text-base-content/50 px-2 py-4 text-center">
        {{ $t('sources.emptyList') }}
      </p>
    </div>
  </div>
</template>
