<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Plus,
  Pencil,
  Trash2,
  Globe,
  HelpCircle,
  Upload,
  Download,
  ChevronUp,
  ChevronDown
} from '@lucide/vue';
import type { MediaSource } from '@renderer/types/sources';
import { moveItem } from '@renderer/utils/sourcesView';
import IconButton from '@renderer/components/ui/IconButton.vue';

// Prezentacyjna lista źródeł (plan 6.3): wszystkie akcje są emitowane, widok
// zarządza store'em, dialogami i toastem. Kolejność zmienia się przeciąganiem
// wiersza lub strzałkami góra/dół (emituje nową listę id).
const props = defineProps<{
  sources: MediaSource[];
  activeSourceId: string | null;
  testStatus: Record<string, { success: boolean; error?: string }>;
  checking: Record<string, boolean>;
}>();

const emit = defineEmits<{
  select: [id: string];
  add: [];
  edit: [source: MediaSource];
  remove: [id: string];
  reorder: [ids: string[]];
  exportAll: [];
  importAll: [];
  guide: [];
}>();

const dragIndex = ref(-1);
const { t } = useI18n();

/** Etykieta statusu źródła (kolor jest tylko wzmocnieniem, nie nośnikiem informacji). */
function statusLabel(id: string): string {
  if (props.checking[id]) return t('sources.testChecking');
  const status = props.testStatus[id];
  if (status) return status.error || t('sources.testSourceOk');
  return t('sources.testNotRun');
}

function emitOrder(next: MediaSource[]): void {
  emit(
    'reorder',
    next.map((s) => s.id)
  );
}

function onDragStart(index: number, event: DragEvent): void {
  dragIndex.value = index;
  event.dataTransfer?.setData('text/plain', String(index));
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}

function onDragOver(event: DragEvent): void {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
}

function onDrop(index: number): void {
  if (dragIndex.value < 0 || dragIndex.value === index) return;
  emitOrder(moveItem([...props.sources], dragIndex.value, index));
  dragIndex.value = -1;
}

function onDragEnd(): void {
  dragIndex.value = -1;
}

function move(index: number, dir: -1 | 1): void {
  const to = index + dir;
  if (to < 0 || to >= props.sources.length) return;
  emitOrder(moveItem([...props.sources], index, to));
}
</script>

<template>
  <div
    class="w-64 max-lg:w-56 shrink-0 h-full flex flex-col border-r border-base-300 bg-base-100/(--glass-alpha)"
  >
    <div class="flex items-center justify-between px-3 py-2.5 border-b border-base-300">
      <h2 class="text-sm font-semibold">{{ $t('sources.title') }}</h2>
      <div class="flex items-center gap-0.5">
        <IconButton
          :icon="Upload"
          :label="$t('sources.exportSources')"
          @click="emit('exportAll')"
        />
        <IconButton
          :icon="Download"
          :label="$t('sources.importSources')"
          @click="emit('importAll')"
        />
        <IconButton :icon="HelpCircle" :label="$t('sources.guide.title')" @click="emit('guide')" />
        <IconButton
          :icon="Plus"
          :label="$t('sources.addSource')"
          variant="primary"
          data-testid="sources-add"
          @click="emit('add')"
        />
      </div>
    </div>
    <div class="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
      <div
        v-for="(s, i) in sources"
        :key="s.id"
        v-activate
        draggable="true"
        class="group flex items-center gap-2 px-2.5 py-2 rounded-field cursor-pointer transition-colors"
        :class="[
          s.id === activeSourceId ? 'bg-primary/10 text-primary' : 'hover:bg-base-content/10',
          dragIndex === i ? 'opacity-50' : ''
        ]"
        :data-testid="`sources-item-${s.id}`"
        @click="emit('select', s.id)"
        @dragstart="onDragStart(i, $event)"
        @dragover="onDragOver($event)"
        @drop="onDrop(i)"
        @dragend="onDragEnd"
      >
        <Globe v-if="!s.icon" :size="14" class="shrink-0" />
        <img v-else :src="s.icon" class="w-3.5 h-3.5 rounded-field object-cover shrink-0" alt="" />
        <span
          class="w-2 h-2 rounded-full shrink-0"
          :class="{
            'bg-warning animate-pulse': checking[s.id],
            'bg-success': !checking[s.id] && testStatus[s.id]?.success,
            'bg-error': !checking[s.id] && testStatus[s.id] && !testStatus[s.id].success,
            'bg-base-300': !checking[s.id] && !testStatus[s.id]
          }"
          role="img"
          :title="statusLabel(s.id)"
          :aria-label="statusLabel(s.id)"
        />
        <div class="flex-1 min-w-0">
          <p class="text-sm truncate">{{ s.name }}</p>
          <p class="text-[11px] text-base-content/50 truncate">
            {{ $t('sources.endpointCount', { n: s.endpoints.length }) }}
          </p>
        </div>
        <div
          class="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 flex items-center gap-0.5"
        >
          <button
            class="fx-noise p-1 fx-depth rounded-field text-base-content/50 hover:text-base-content disabled:opacity-30"
            :title="$t('sources.moveUp')"
            :aria-label="$t('sources.moveUp')"
            :disabled="i === 0"
            @click.stop="move(i, -1)"
          >
            <ChevronUp :size="12" />
          </button>
          <button
            class="fx-noise p-1 fx-depth rounded-field text-base-content/50 hover:text-base-content disabled:opacity-30"
            :title="$t('sources.moveDown')"
            :aria-label="$t('sources.moveDown')"
            :disabled="i === sources.length - 1"
            @click.stop="move(i, 1)"
          >
            <ChevronDown :size="12" />
          </button>
          <button
            class="fx-noise p-1 fx-depth rounded-field text-base-content/50 hover:text-base-content"
            :title="$t('common.edit')"
            :aria-label="$t('common.edit')"
            data-testid="sources-edit-item"
            @click.stop="emit('edit', s)"
          >
            <Pencil :size="12" />
          </button>
          <button
            class="fx-noise p-1 fx-depth rounded-field text-base-content/50 hover:text-error"
            :title="$t('common.delete')"
            :aria-label="$t('common.delete')"
            @click.stop="emit('remove', s.id)"
          >
            <Trash2 :size="12" />
          </button>
        </div>
      </div>
      <p
        v-if="!sources.length"
        role="status"
        class="text-xs text-base-content/50 px-2 py-4 text-center"
      >
        {{ $t('sources.emptyList') }}
      </p>
    </div>
  </div>
</template>
