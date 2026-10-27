<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  AlertCircle,
  CheckCircle2,
  Image as ImageIcon,
  Plus,
  Save,
  Tags,
  Trash2
} from '@lucide/vue';
import EmptyState from '@renderer/components/ui/EmptyState.vue';
import ToolWindowShell from '@renderer/components/tools/ToolWindowShell.vue';
import { useToolBridge } from '@renderer/composables/useToolBridge';
import { getDroppedFilePaths } from '@renderer/utils/fileDrag';
import {
  AUDIO_TAG_FIELDS,
  TAG_EDITOR_MAX_FILES,
  type AudioTagField,
  type TagEditorFile
} from '@shared/types/tools';

type RowTags = Record<AudioTagField, string>;

interface TagRow {
  path: string;
  name: string;
  writable: boolean;
  error?: string;
  writeError?: string;
  coverError?: string;
  selected: boolean;
  dirty: boolean;
  tags: RowTags;
}

// Odczytać można też formaty, których nie zapisujemy — dlatego lista jest szersza
// niż `AUDIO_TAG_FIELDS` obsługiwane przez backend zapisu.
const AUDIO_EXTS = [
  'mp3',
  'flac',
  'm4a',
  'm4b',
  'ogg',
  'oga',
  'opus',
  'wav',
  'aac',
  'wma',
  'aiff',
  'ape'
];

const FIELD_LABEL_KEYS: Record<AudioTagField, string> = {
  title: 'tools.tagTitle',
  artist: 'tools.tagArtist',
  album: 'tools.tagAlbum',
  albumArtist: 'tools.tagAlbumArtist',
  genre: 'tools.tagGenre',
  year: 'tools.tagYear',
  track: 'tools.tagTrack',
  disc: 'tools.tagDisc'
};

const { t } = useI18n();
const { context } = useToolBridge();
const files = ref<TagRow[]>([]);
const loading = ref(false);
const saving = ref(false);
const loadError = ref('');
const batchField = ref<AudioTagField>('album');
const batchValue = ref('');
const lastSave = ref<{ ok: number; failed: number } | null>(null);
const coverImagePath = ref('');
const coverBusy = ref(false);
const coverSummary = ref<{ ok: number; failed: number } | null>(null);
const coverError = ref('');

const selectedRows = computed(() =>
  files.value.filter((row) => row.selected && row.writable && !row.error)
);
const selectedCount = computed(() => selectedRows.value.length);
const dirtyRows = computed(() =>
  files.value.filter((row) => row.dirty && row.writable && !row.error)
);
const allSelected = computed(
  () => files.value.length > 0 && files.value.every((row) => row.selected)
);

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

function extensionOf(path: string): string {
  const name = fileName(path);
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index + 1).toLowerCase() : '';
}

function emptyTags(): RowTags {
  return {
    title: '',
    artist: '',
    album: '',
    albumArtist: '',
    genre: '',
    year: '',
    track: '',
    disc: ''
  };
}

function toRow(file: TagEditorFile): TagRow {
  const tags = emptyTags();
  for (const field of AUDIO_TAG_FIELDS) {
    tags[field] = file.tags[field] ?? '';
  }
  return {
    path: file.path,
    name: fileName(file.path),
    writable: file.writable,
    error: file.error,
    selected: true,
    dirty: false,
    tags
  };
}

async function loadTags(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  loading.value = true;
  loadError.value = '';
  try {
    const rows = await window.api.tagEditorRead(paths);
    files.value = [...files.value, ...rows.map(toRow)];
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error);
  } finally {
    loading.value = false;
  }
}

function addFiles(paths: string[]): void {
  const existing = new Set(files.value.map((row) => row.path));
  const accepted: string[] = [];
  for (const path of paths) {
    if (!AUDIO_EXTS.includes(extensionOf(path))) continue;
    if (existing.has(path)) continue;
    existing.add(path);
    accepted.push(path);
    if (files.value.length + accepted.length >= TAG_EDITOR_MAX_FILES) break;
  }
  void loadTags(accepted);
}

async function pickFiles(): Promise<void> {
  if (saving.value) return;
  const result = (await window.api.invoke('dialog:openFile', {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: t('tools.audio'), extensions: AUDIO_EXTS }]
  })) as { canceled: boolean; filePaths: string[] };
  if (!result.canceled) addFiles(result.filePaths);
}

function onDrop(event: DragEvent): void {
  if (saving.value) return;
  addFiles(getDroppedFilePaths(event.dataTransfer));
}

function removeRow(path: string): void {
  if (saving.value) return;
  files.value = files.value.filter((row) => row.path !== path);
}

function clearAll(): void {
  if (saving.value) return;
  files.value = [];
  lastSave.value = null;
  loadError.value = '';
}

function toggleAll(): void {
  const next = !allSelected.value;
  for (const row of files.value) row.selected = next;
}

function markDirty(row: TagRow): void {
  row.dirty = true;
  row.writeError = undefined;
  lastSave.value = null;
}

function applyBatch(): void {
  if (selectedCount.value === 0) return;
  for (const row of selectedRows.value) {
    row.tags[batchField.value] = batchValue.value;
    markDirty(row);
  }
}

async function save(): Promise<void> {
  const entries = dirtyRows.value.map((row) => ({ path: row.path, tags: { ...row.tags } }));
  if (entries.length === 0) return;
  saving.value = true;
  lastSave.value = null;
  loadError.value = '';
  try {
    const results = await window.api.tagEditorWrite(entries);
    const byPath = new Map(results.map((result) => [result.path, result]));
    let ok = 0;
    let failed = 0;
    for (const row of files.value) {
      const result = byPath.get(row.path);
      if (!result) continue;
      if (result.success) {
        row.dirty = false;
        row.writeError = undefined;
        ok += 1;
      } else {
        row.writeError = result.error || t('tools.tagEditorSaveFailed');
        failed += 1;
      }
    }
    lastSave.value = { ok, failed };
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error);
    lastSave.value = { ok: 0, failed: entries.length };
  } finally {
    saving.value = false;
  }
}

async function pickCoverImage(): Promise<void> {
  const result = (await window.api.invoke('dialog:openImage')) as {
    canceled: boolean;
    filePaths: string[];
  };
  const path = result.filePaths?.[0];
  if (!result.canceled && path) {
    coverImagePath.value = path;
    coverSummary.value = null;
    coverError.value = '';
  }
}

async function applyCover(): Promise<void> {
  const rows = selectedRows.value.filter((row) => /\.(mp3|flac|m4a|m4b)$/i.test(row.path));
  if (rows.length === 0 || !coverImagePath.value.trim()) return;
  coverBusy.value = true;
  coverSummary.value = null;
  coverError.value = '';
  let ok = 0;
  let failed = 0;
  try {
    for (const row of rows) {
      const result = await window.api.writeCover(row.path, coverImagePath.value.trim());
      if (result.success) {
        row.coverError = undefined;
        ok += 1;
      } else {
        row.coverError = result.error || t('tools.tagEditorCoverFailed');
        failed += 1;
      }
    }
    coverSummary.value = { ok, failed };
  } catch (error) {
    coverError.value = error instanceof Error ? error.message : String(error);
  } finally {
    coverBusy.value = false;
  }
}

watch(
  () => context.value,
  (ctx) => {
    const paths =
      ctx && ctx.params && Array.isArray(ctx.params.paths)
        ? ctx.params.paths.filter((path): path is string => typeof path === 'string')
        : [];
    if (paths.length > 0) {
      const existing = new Set(files.value.map((row) => row.path));
      const fresh = paths.filter((path) => !existing.has(path));
      if (fresh.length > 0) void loadTags(fresh);
    }
  },
  { immediate: true }
);

function fieldLabel(field: AudioTagField): string {
  return t(FIELD_LABEL_KEYS[field]);
}
</script>

<template>
  <ToolWindowShell :title="t('tools.tagEditorTitle')" :icon="Tags">
    <div data-testid="tools-tag-editor-view" class="flex h-full flex-col">
      <div
        class="flex flex-wrap items-center gap-2 border-b border-base-300 px-3 py-2"
        @dragover.prevent
        @drop.prevent="onDrop"
      >
        <button
          data-testid="tools-tag-add"
          class="fx-noise flex items-center gap-1 rounded-field border border-base-300 px-2.5 py-1.5 text-xs transition-colors hover:bg-base-content/10 disabled:opacity-40"
          :disabled="saving"
          @click="pickFiles"
        >
          <Plus :size="12" />
          {{ t('tools.addFiles') }}
        </button>
        <button
          class="fx-noise rounded-field border border-base-300 px-2.5 py-1.5 text-xs text-base-content/60 transition-colors hover:bg-base-content/10 hover:text-base-content disabled:opacity-40"
          :disabled="saving || files.length === 0"
          @click="clearAll"
        >
          {{ t('tools.clear') }}
        </button>

        <span class="text-[11px] text-base-content/50">
          {{ t('tools.tagEditorSelected', { selected: selectedCount, total: files.length }) }}
        </span>

        <div class="ml-auto flex flex-wrap items-center gap-1.5">
          <select
            v-model="batchField"
            data-testid="tools-tag-batch-field"
            :disabled="saving || selectedCount === 0"
            class="rounded-field border border-base-300 bg-base-100 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-40"
          >
            <option v-for="field in AUDIO_TAG_FIELDS" :key="field" :value="field">
              {{ fieldLabel(field) }}
            </option>
          </select>
          <input
            v-model="batchValue"
            data-testid="tools-tag-batch-value"
            type="text"
            :disabled="saving || selectedCount === 0"
            :placeholder="t('tools.tagEditorBatchValue')"
            class="w-44 rounded-field border border-base-300 bg-base-100 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-40"
            @keydown.enter="applyBatch"
          />
          <button
            data-testid="tools-tag-apply"
            class="fx-noise rounded-field bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-content transition-colors hover:bg-primary/90 disabled:opacity-40"
            :disabled="saving || selectedCount === 0"
            @click="applyBatch"
          >
            {{ t('tools.tagEditorApply') }}
          </button>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2 border-b border-base-300 px-3 py-2">
        <span class="text-[11px] font-medium text-base-content/60">
          {{ t('tools.tagEditorCover') }}
        </span>
        <input
          v-model="coverImagePath"
          data-testid="tools-tag-cover-path"
          type="text"
          :disabled="coverBusy"
          :placeholder="t('tools.tagEditorCoverPick')"
          class="min-w-0 flex-1 rounded-field border border-base-300 bg-base-100 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-40"
        />
        <button
          class="fx-noise flex items-center gap-1 rounded-field border border-base-300 px-2.5 py-1.5 text-xs transition-colors hover:bg-base-content/10 disabled:opacity-40"
          :disabled="coverBusy"
          @click="pickCoverImage"
        >
          <ImageIcon :size="12" />
          {{ t('tools.tagEditorCoverPick') }}
        </button>
        <button
          data-testid="tools-tag-cover-apply"
          class="fx-noise rounded-field bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-content transition-colors hover:bg-primary/90 disabled:opacity-40"
          :disabled="coverBusy || !coverImagePath.trim() || selectedCount === 0"
          @click="applyCover"
        >
          {{ coverBusy ? t('tools.tagEditorCoverApplying') : t('tools.tagEditorCoverApply') }}
        </button>
        <span
          v-if="coverSummary"
          class="text-[11px]"
          :class="coverSummary.failed === 0 ? 'text-success' : 'text-error'"
        >
          {{
            coverSummary.failed === 0
              ? t('tools.tagEditorCoverApplied', { count: coverSummary.ok })
              : t('tools.tagEditorCoverFailedCount', {
                  ok: coverSummary.ok,
                  failed: coverSummary.failed
                })
          }}
        </span>
        <span v-if="coverError" class="text-[11px] text-error">{{ coverError }}</span>
        <span class="w-full text-[10px] text-base-content/45">
          {{ t('tools.tagEditorCoverHint') }}
        </span>
      </div>

      <p
        v-if="loadError"
        class="border-b border-error/30 bg-error/10 px-3 py-2 text-[11px] text-error"
      >
        {{ loadError }}
      </p>

      <div
        data-testid="tools-tag-drop"
        class="min-h-0 flex-1 overflow-auto p-3"
        @dragover.prevent
        @drop.prevent="onDrop"
      >
        <EmptyState
          v-if="files.length === 0"
          :title="t('tools.tagEditorEmpty')"
          :description="t('tools.tagEditorDropHint')"
          :icon="Tags"
        />

        <table v-else class="w-full min-w-[980px] border-separate border-spacing-0 text-xs">
          <thead class="sticky top-0 z-10">
            <tr class="text-left text-[11px] uppercase tracking-wider text-base-content/50">
              <th class="w-8 border-b border-base-300 bg-base-100 px-2 py-2">
                <input
                  type="checkbox"
                  :checked="allSelected"
                  :aria-label="t('tools.tagEditorSelectAll')"
                  @change="toggleAll"
                />
              </th>
              <th class="border-b border-base-300 bg-base-100 px-2 py-2">
                {{ t('tools.tagEditorFile') }}
              </th>
              <th
                v-for="field in AUDIO_TAG_FIELDS"
                :key="field"
                class="border-b border-base-300 bg-base-100 px-2 py-2"
              >
                {{ fieldLabel(field) }}
              </th>
              <th class="w-8 border-b border-base-300 bg-base-100 px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in files"
              :key="row.path"
              class="align-top"
              :class="row.selected ? 'bg-primary/5' : ''"
            >
              <td class="border-b border-base-300/60 px-2 py-1.5">
                <input
                  v-model="row.selected"
                  type="checkbox"
                  :disabled="saving"
                  :aria-label="row.name"
                />
              </td>
              <td class="max-w-56 border-b border-base-300/60 px-2 py-1.5">
                <div class="flex items-center gap-1.5">
                  <span class="truncate" :title="row.path">{{ row.name }}</span>
                  <span
                    v-if="!row.writable"
                    class="shrink-0 rounded-full border border-base-300 px-1.5 py-0.5 text-[9px] text-base-content/50"
                  >
                    {{ t('tools.tagEditorReadOnly') }}
                  </span>
                  <span
                    v-if="row.dirty"
                    class="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] text-primary-text"
                  >
                    {{ t('tools.tagEditorChanged') }}
                  </span>
                </div>
                <p v-if="row.error" class="mt-0.5 text-[10px] text-error line-clamp-1">
                  {{ row.error }}
                </p>
                <p v-else-if="row.writeError" class="mt-0.5 text-[10px] text-error line-clamp-1">
                  {{ row.writeError }}
                </p>
                <p v-else-if="row.coverError" class="mt-0.5 text-[10px] text-error line-clamp-1">
                  {{ row.coverError }}
                </p>
              </td>
              <td
                v-for="field in AUDIO_TAG_FIELDS"
                :key="field"
                class="border-b border-base-300/60 px-1.5 py-1.5"
              >
                <input
                  v-model="row.tags[field]"
                  type="text"
                  :disabled="saving || !row.writable || !!row.error"
                  :aria-label="`${row.name} ${fieldLabel(field)}`"
                  class="w-full min-w-24 rounded-field border border-base-300/70 bg-base-100 px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-40"
                  @input="markDirty(row)"
                />
              </td>
              <td class="border-b border-base-300/60 px-1.5 py-1.5">
                <button
                  class="fx-noise rounded-field p-1 text-base-content/40 transition-colors hover:bg-error/10 hover:text-error disabled:opacity-30"
                  :title="t('tools.remove')"
                  :aria-label="t('tools.remove')"
                  :disabled="saving"
                  @click="removeRow(row.path)"
                >
                  <Trash2 :size="12" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="flex items-center gap-3 border-t border-base-300 px-3 py-2">
        <p v-if="lastSave" class="flex items-center gap-1.5 text-[11px]">
          <CheckCircle2 v-if="lastSave.failed === 0" :size="13" class="text-success" />
          <AlertCircle v-else :size="13" class="text-error" />
          <span :class="lastSave.failed === 0 ? 'text-success' : 'text-error'">
            {{
              lastSave.failed === 0
                ? t('tools.tagEditorSaved', { count: lastSave.ok })
                : t('tools.tagEditorSaveFailedCount', {
                    ok: lastSave.ok,
                    failed: lastSave.failed
                  })
            }}
          </span>
        </p>
        <span v-else class="text-[11px] text-base-content/45">
          {{ loading ? t('tools.tagEditorLoading') : t('tools.tagEditorHint') }}
        </span>
        <button
          data-testid="tools-tag-save"
          class="fx-noise ml-auto flex items-center gap-1.5 rounded-field bg-primary px-4 py-2 text-xs font-medium text-primary-content transition-colors hover:bg-primary/90 disabled:opacity-40"
          :disabled="saving || dirtyRows.length === 0"
          @click="save"
        >
          <Save :size="13" />
          {{ saving ? t('tools.tagEditorSaving') : t('tools.tagEditorSave') }}
        </button>
      </div>
    </div>
  </ToolWindowShell>
</template>
