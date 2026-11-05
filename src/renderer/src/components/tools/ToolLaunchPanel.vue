<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  File as FileIcon,
  FileAudio,
  FileImage,
  FileVideo,
  Folder,
  FolderUp,
  X
} from '@lucide/vue';
import Button from '@renderer/components/ui/Button.vue';
import Spinner from '@renderer/components/ui/Spinner.vue';
import EmptyState from '@renderer/components/ui/EmptyState.vue';
import { createBatchLoader } from '@renderer/utils/explorerLoader';
import { parentPath } from '@renderer/utils/explorerPath';
import { basename, canonicalPath } from '@renderer/utils/path';
import { getDroppedFilePaths } from '@renderer/utils/fileDrag';
import { useExplorerStore } from '@renderer/stores/explorer';
import { useLibraryStore } from '@renderer/stores/library';
import { formatBytes } from '@shared/formatBytes';
import { fileExtension, filesForTool, inputKindOfPath } from '@shared/tool-input';
import { TOOL_INPUTS, TOOL_TITLE_KEYS, type ToolId, type ToolInputKind } from '@shared/types/tools';
import type { FileItem } from '@renderer/types/explorer';

// Etap 1 uruchamiania narzędzia: wbudowana przeglądarka katalogów zamiast
// systemowego dialogu. Wybrane pliki pokazujemy z danymi (typ, rozmiar),
// a okno narzędzia powstaje dopiero po „Uruchom narzędzie”.

const props = defineProps<{ toolId: ToolId; busy?: boolean }>();
const emit = defineEmits<{ cancel: []; launch: [paths: string[]] }>();

const KIND_LABEL_KEYS: Record<ToolInputKind, string> = {
  audio: 'tools.audio',
  video: 'tools.video',
  image: 'tools.images'
};

interface PickedFile {
  path: string;
  name: string;
  extension: string;
  size?: number;
  kind: ToolInputKind | null;
}

const { t } = useI18n();
const explorer = useExplorerStore();
const library = useLibraryStore();

const spec = computed(() => TOOL_INPUTS[props.toolId]);
const maxFiles = computed(() => spec.value?.maxFiles ?? 1);
const title = computed(() => t(TOOL_TITLE_KEYS[props.toolId]));

const currentPath = ref('');
const files = ref<FileItem[]>([]);
const isLoading = ref(false);
const loadError = ref<string | null>(null);
const selected = ref(new Map<string, PickedFile>());

const loader = createBatchLoader(files, isLoading, (message) => {
  loadError.value = message;
});

function isAccepted(item: FileItem): boolean {
  return !item.isDirectory && filesForTool(props.toolId, [item.path]).length > 0;
}

const selectedList = computed(() => [...selected.value.values()]);

// Konwerter obsługuje jeden rodzaj na uruchomienie: po wybraniu pierwszego
// pliku lista pokazuje już tylko pliki tego samego rodzaju.
const lockedKind = computed<ToolInputKind | null>(() =>
  props.toolId === 'converter' && selectedList.value.length > 0 ? selectedList.value[0].kind : null
);

const visibleFiles = computed(() => {
  const rows = files.value.filter(
    (item) =>
      item.isDirectory ||
      (isAccepted(item) && (!lockedKind.value || inputKindOfPath(item.path) === lockedKind.value))
  );
  return rows.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });
});

const breadcrumbs = computed(() => {
  if (!currentPath.value) return [];
  const normalized = canonicalPath(currentPath.value);
  const root = normalized.startsWith('/') ? '/' : '';
  const parts = normalized.split('/').filter(Boolean);
  const out: Array<{ label: string; path: string }> = [];
  let acc = '';
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : `${root}${part}`;
    const path = out.length === 0 && /^[A-Za-z]:$/.test(part) ? `${part}/` : acc;
    out.push({ label: part, path });
  }
  return out;
});

function navigateTo(path: string): void {
  currentPath.value = path;
  void loader.load(path);
}

function goUp(): void {
  if (!currentPath.value) return;
  const parent = parentPath(currentPath.value);
  // `parentPath` zwraca „C:” dla korzenia dysku; z ukośnikiem to korzeń,
  // a bez niego main pokazałby listę dysków zamiast zawartości dysku.
  navigateTo(/^[A-Z]:$/i.test(parent) ? `${parent}/` : parent);
}

function pickedFromItem(item: FileItem): PickedFile {
  return {
    path: item.path,
    name: item.name,
    extension: item.extension ?? '',
    size: item.size,
    kind: inputKindOfPath(item.path)
  };
}

function pickedFromPath(path: string): PickedFile {
  const ext = fileExtension(path);
  return {
    path,
    name: basename(path),
    extension: ext ? `.${ext}` : '',
    kind: inputKindOfPath(path)
  };
}

function toggleFile(item: FileItem): void {
  if (lockedKind.value && inputKindOfPath(item.path) !== lockedKind.value) return;
  const next = new Map(selected.value);
  if (next.has(item.path)) {
    next.delete(item.path);
  } else {
    if (!spec.value?.multiple) next.clear();
    if (next.size < maxFiles.value) next.set(item.path, pickedFromItem(item));
  }
  selected.value = next;
}

function remove(path: string): void {
  const next = new Map(selected.value);
  next.delete(path);
  selected.value = next;
}

function onDrop(event: DragEvent): void {
  const dropped = filesForTool(props.toolId, getDroppedFilePaths(event.dataTransfer));
  const paths = lockedKind.value
    ? dropped.filter((path) => inputKindOfPath(path) === lockedKind.value)
    : dropped;
  if (paths.length === 0) return;
  const next = new Map(selected.value);
  for (const path of paths) {
    if (next.size >= maxFiles.value) break;
    if (!next.has(path)) next.set(path, pickedFromPath(path));
  }
  selected.value = next;
}

function iconForItem(item: FileItem) {
  if (item.isDirectory) return Folder;
  const kind = inputKindOfPath(item.path);
  if (kind === 'audio') return FileAudio;
  if (kind === 'video') return FileVideo;
  if (kind === 'image') return FileImage;
  return FileIcon;
}

function iconForKind(kind: ToolInputKind | null) {
  if (kind === 'audio') return FileAudio;
  if (kind === 'video') return FileVideo;
  if (kind === 'image') return FileImage;
  return FileIcon;
}

function kindLabel(kind: ToolInputKind | null): string {
  return kind ? t(KIND_LABEL_KEYS[kind]) : t('tools.typeUnknown');
}

function start(): void {
  if (selected.value.size === 0) return;
  emit('launch', [...selected.value.keys()]);
}

onMounted(() => {
  navigateTo(explorer.currentPath || library.folders[0] || '');
});

onUnmounted(() => {
  loader.cancel();
});
</script>

<template>
  <section data-testid="tool-launch-panel" class="flex h-full min-h-0 flex-col gap-3">
    <div class="flex items-start gap-3">
      <button
        type="button"
        data-testid="tool-launch-back"
        class="fx-noise mt-0.5 rounded-field border border-hairline p-1.5 hover:bg-base-content/10"
        :title="t('tools.launchBack')"
        :aria-label="t('tools.launchBack')"
        @click="emit('cancel')"
      >
        <ArrowLeft :size="16" />
      </button>
      <div class="min-w-0">
        <h1 class="truncate text-base font-semibold text-base-content">{{ title }}</h1>
        <p class="text-xs text-base-content/60">{{ t('tools.launchHint') }}</p>
      </div>
    </div>

    <div class="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <div class="flex min-h-0 flex-col rounded-box border border-hairline bg-base-100/70">
        <div
          class="flex flex-wrap items-center gap-1 border-b border-hairline px-2 py-1.5 text-2xs"
        >
          <button
            type="button"
            data-testid="tool-launch-up"
            class="fx-noise rounded-field p-1 hover:bg-base-content/10 disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="!currentPath"
            :title="t('tools.launchUp')"
            :aria-label="t('tools.launchUp')"
            @click="goUp"
          >
            <FolderUp :size="14" />
          </button>
          <button
            type="button"
            data-testid="tool-launch-drives"
            class="rounded-field px-1.5 py-0.5 text-base-content/70 hover:bg-base-content/10"
            @click="navigateTo('')"
          >
            {{ t('tools.launchDrives') }}
          </button>
          <template v-for="crumb in breadcrumbs" :key="crumb.path">
            <ChevronRight :size="12" class="shrink-0 text-base-content/35" />
            <button
              type="button"
              class="max-w-40 truncate rounded-field px-1.5 py-0.5 text-base-content/70 hover:bg-base-content/10"
              :title="crumb.path"
              @click="navigateTo(crumb.path)"
            >
              {{ crumb.label }}
            </button>
          </template>
          <span class="ml-auto text-base-content/45">{{ visibleFiles.length }}</span>
        </div>

        <div class="min-h-0 flex-1 overflow-auto p-2" @dragover.prevent @drop.prevent="onDrop">
          <div
            v-if="isLoading"
            class="flex h-full items-center justify-center gap-2 text-sm text-base-content/60"
          >
            <Spinner :size="18" />
            {{ t('common.loading') }}
          </div>

          <p
            v-else-if="loadError"
            class="rounded-field border border-error/30 bg-error/10 px-3 py-2 text-2xs text-error"
          >
            {{ loadError }}
          </p>

          <EmptyState
            v-else-if="visibleFiles.length === 0"
            :title="t('tools.launchEmptyDir')"
            :description="t('tools.launchDropHint')"
            :icon="Folder"
          />

          <div v-else class="grid gap-0.5">
            <button
              v-for="item in visibleFiles"
              :key="item.path"
              type="button"
              :data-testid="`tool-launch-item-${item.name}`"
              class="flex w-full items-center gap-2 rounded-field px-2 py-1.5 text-left text-sm transition-colors hover:bg-base-content/10"
              :aria-pressed="!item.isDirectory ? selected.has(item.path) : undefined"
              @click="item.isDirectory ? navigateTo(item.path) : toggleFile(item)"
            >
              <component :is="iconForItem(item)" :size="15" class="shrink-0 text-base-content/55" />
              <span class="flex-1 truncate">{{ item.name }}</span>
              <span v-if="item.isDirectory" class="text-base-content/35">›</span>
              <Check v-else-if="selected.has(item.path)" :size="14" class="text-primary-text" />
            </button>
          </div>
        </div>
      </div>

      <aside class="flex min-h-0 flex-col rounded-box border border-hairline bg-base-100/70 p-3">
        <div class="flex items-center justify-between gap-2 text-xs font-semibold">
          <span>{{ t('tools.launchSelected') }}</span>
          <span class="text-base-content/50">{{ selectedList.length }} / {{ maxFiles }}</span>
        </div>

        <div class="mt-2 min-h-0 flex-1 overflow-auto">
          <p v-if="selectedList.length === 0" class="text-2xs leading-relaxed text-base-content/50">
            {{ t('tools.launchNothingSelected') }}
          </p>
          <ul v-else class="space-y-1">
            <li
              v-for="file in selectedList"
              :key="file.path"
              data-testid="tool-launch-selected"
              class="flex items-center gap-2 rounded-field border border-hairline/70 px-2 py-1.5"
            >
              <component
                :is="iconForKind(file.kind)"
                :size="14"
                class="shrink-0 text-base-content/55"
              />
              <div class="min-w-0 flex-1">
                <div class="truncate text-xs" :title="file.path">{{ file.name }}</div>
                <div class="text-3xs text-base-content/50">
                  {{ kindLabel(file.kind)
                  }}<template v-if="file.size"> · {{ formatBytes(file.size) }}</template>
                </div>
              </div>
              <button
                type="button"
                class="shrink-0 rounded-field p-1 text-base-content/45 hover:bg-base-content/10 hover:text-base-content"
                :title="t('tools.launchRemove')"
                :aria-label="t('tools.launchRemove')"
                @click="remove(file.path)"
              >
                <X :size="13" />
              </button>
            </li>
          </ul>
        </div>

        <div class="mt-2 flex flex-col gap-1.5">
          <Button
            variant="solid"
            data-testid="tool-launch-start"
            :disabled="selectedList.length === 0 || busy"
            :loading="busy"
            @click="start"
          >
            {{ t('tools.launchStart') }}
          </Button>
          <Button
            variant="ghost"
            data-testid="tool-launch-skip"
            :disabled="busy"
            @click="emit('launch', [])"
          >
            {{ t('tools.launchOpenEmpty') }}
          </Button>
        </div>
      </aside>
    </div>
  </section>
</template>
