<script setup lang="ts">
import { ref, watch, inject } from 'vue';
import { useI18n } from 'vue-i18n';
import { Copy, X, RotateCw, Check, Trash2, FileText } from '@lucide/vue';
import { useExplorerStore } from '@renderer/stores/explorer';

interface DupGroup {
  original: string;
  duplicates: string[];
}

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  reveal: [path: string];
}>();

const explorer = useExplorerStore();
const { t } = useI18n();
const showConfirm = inject<(msg: string) => Promise<boolean>>('showConfirm', async () => true);

const dupLoading = ref(false);
const dupGroups = ref<DupGroup[]>([]);
const dupSelected = ref<Set<string>>(new Set());

watch(
  () => props.open,
  (open) => {
    if (open && dupGroups.value.length === 0 && !dupLoading.value) runDuplicatesScan();
  }
);

async function runDuplicatesScan() {
  if (!explorer.currentPath) return;
  dupLoading.value = true;
  dupSelected.value = new Set();
  try {
    const result =
      ((await window.api?.invoke('fs:findDuplicates', explorer.currentPath)) as DupGroup[]) || [];
    dupGroups.value = result;
  } catch {
    dupGroups.value = [];
  } finally {
    dupLoading.value = false;
  }
}

function selectAllDuplicates() {
  const set = new Set<string>();
  for (const g of dupGroups.value) for (const d of g.duplicates) set.add(d);
  dupSelected.value = set;
}

function toggleDupSelection(path: string) {
  const set = new Set(dupSelected.value);
  if (set.has(path)) set.delete(path);
  else set.add(path);
  dupSelected.value = set;
}

async function deleteSelectedDuplicates() {
  const paths = [...dupSelected.value];
  if (paths.length === 0) return;
  const ok = await showConfirm(t('explorer.duplicatesDeleteConfirm', { n: paths.length }));
  if (!ok) return;
  await Promise.all(paths.map((p) => window.api?.invoke('fs:delete', p)));
  dupSelected.value = new Set();
  await runDuplicatesScan();
  explorer.loadFiles(explorer.currentPath);
}

function basenameOf(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

function dupName(group: DupGroup, di: number): string {
  return basenameOf(group.duplicates[di]);
}

function revealDupFile(path: string) {
  emit('reveal', path);
}
</script>

<template>
  <div
    v-if="open"
    class="absolute right-0 top-0 bottom-0 w-80 max-w-[85%] z-20 flex flex-col bg-base-100 border-l border-base-300 shadow-2xl"
  >
    <div class="flex items-center justify-between px-3 py-2.5 border-b border-base-300 shrink-0">
      <h3 class="text-xs font-semibold text-base-content flex items-center gap-2">
        <Copy :size="14" class="text-primary" /> {{ $t('explorer.duplicates') }}
      </h3>
      <button
        class="fx-noise p-1 fx-depth rounded-field text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-colors"
        @click="emit('update:open', false)"
      >
        <X :size="14" />
      </button>
    </div>

    <div
      v-if="dupLoading"
      class="flex flex-col items-center justify-center py-10 text-base-content/50 gap-2"
    >
      <RotateCw :size="20" class="animate-spin" />
      <p class="text-xs">{{ $t('explorer.duplicatesScanning') }}</p>
    </div>

    <div
      v-else-if="dupGroups.length === 0"
      class="flex flex-col items-center justify-center py-10 text-base-content/50 gap-2"
    >
      <Check :size="24" class="opacity-40" />
      <p class="text-xs">{{ $t('explorer.duplicatesNone') }}</p>
    </div>

    <div v-else class="flex-1 overflow-y-auto p-2 space-y-2">
      <p class="text-[11px] text-base-content/70 px-1">
        {{ $t('explorer.duplicatesFound', { n: dupGroups.length }) }}
      </p>
      <div
        v-for="group in dupGroups"
        :key="group.original"
        class="rounded-field border border-base-300 overflow-hidden"
      >
        <div
          class="flex items-center gap-2 px-2.5 py-1.5 bg-base-100 border-b border-base-300 cursor-pointer hover:bg-base-content/10 transition-colors"
          @click="revealDupFile(group.original)"
        >
          <FileText :size="13" class="text-primary shrink-0" />
          <span class="text-xs font-medium text-base-content truncate flex-1">{{
            basenameOf(group.original)
          }}</span>
          <span
            class="text-[10px] px-1.5 py-0.5 rounded-field bg-primary/15 text-primary font-semibold shrink-0"
            >{{ $t('explorer.duplicatesOriginal') }}</span
          >
        </div>
        <div class="py-1">
          <div
            v-for="(dup, di) in group.duplicates"
            :key="dup"
            class="flex items-center gap-2 px-2.5 py-1.5 hover:bg-base-content/10 transition-colors cursor-pointer"
            @click="revealDupFile(dup)"
          >
            <input
              type="checkbox"
              class="accent-primary shrink-0"
              :checked="dupSelected.has(dup)"
              @click.stop="toggleDupSelection(dup)"
            />
            <span class="text-xs text-base-content truncate flex-1">{{ dupName(group, di) }}</span>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="dupGroups.length > 0"
      class="flex items-center gap-2 px-3 py-2.5 border-t border-base-300 shrink-0"
    >
      <button
        class="fx-noise flex-1 px-2 py-1.5 fx-depth rounded-field text-[11px] text-base-content/70 hover:text-base-content hover:bg-base-content/10 transition-colors"
        @click="selectAllDuplicates"
      >
        {{ $t('explorer.duplicatesSelectAll') }}
      </button>
      <button
        class="fx-noise flex-1 px-2 py-1.5 fx-depth rounded-field text-[11px] bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors flex items-center justify-center gap-1 disabled:opacity-40 disabled:pointer-events-none"
        :disabled="dupSelected.size === 0"
        @click="deleteSelectedDuplicates"
      >
        <Trash2 :size="12" /> {{ $t('explorer.duplicatesDelete', { n: dupSelected.size }) }}
      </button>
    </div>
  </div>
</template>
