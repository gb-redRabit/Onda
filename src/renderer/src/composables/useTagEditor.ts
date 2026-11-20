import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToolBridge } from '@renderer/composables/useToolBridge';
import { getDroppedFilePaths } from '@renderer/utils/fileDrag';
import { filesForTool, toolContextPaths } from '@shared/tool-input';
import {
  AUDIO_TAG_FIELDS,
  TAG_AUDIO_EXTS,
  TAG_EDITOR_MAX_FILES,
  type AudioTagField,
  type TagEditorFile
} from '@shared/types/tools';

export type RowTags = Record<AudioTagField, string>;

export interface TagRow {
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
export const AUDIO_EXTS: readonly string[] = TAG_AUDIO_EXTS;

export const FIELD_LABEL_KEYS: Record<AudioTagField, string> = {
  title: 'tools.tagTitle',
  artist: 'tools.tagArtist',
  album: 'tools.tagAlbum',
  albumArtist: 'tools.tagAlbumArtist',
  genre: 'tools.tagGenre',
  year: 'tools.tagYear',
  track: 'tools.tagTrack',
  disc: 'tools.tagDisc'
};

/**
 * Stan i operacje edytora tagów: wczytywanie plików, edycja wsadowa, zapis
 * oraz okładki. Widok zostaje przy układzie i szablonie. Dialog potwierdzenia
 * jest tworzony przez widok (`usePromptDialog` nie jest singletonem) i tu
 * wstrzykiwany.
 */
export function useTagEditor(prompt: { showConfirm: (message: string) => Promise<boolean> }) {
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
      filters: [{ name: t('tools.audio'), extensions: [...AUDIO_EXTS] }]
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

  let appliedContextKey = '';

  // Otwarcie z Eksploratora zastępuje listę. Jeśli są niezapisane zmiany,
  // pytamy przed ich utratą.
  watch(
    () => context.value,
    async () => {
      const next = filesForTool('tag-editor', toolContextPaths(context.value));
      if (next.length === 0) return;
      const key = next.join('\n');
      if (key === appliedContextKey) return;
      if (files.value.some((row) => row.dirty)) {
        const confirmed = await prompt.showConfirm(t('tools.tagReplaceDirty'));
        if (!confirmed) return;
      }
      appliedContextKey = key;
      files.value = [];
      void loadTags(next);
    },
    { immediate: true }
  );

  function fieldLabel(field: AudioTagField): string {
    return t(FIELD_LABEL_KEYS[field]);
  }

  return {
    files,
    loading,
    saving,
    loadError,
    batchField,
    batchValue,
    lastSave,
    coverImagePath,
    coverBusy,
    coverSummary,
    coverError,
    selectedRows,
    selectedCount,
    dirtyRows,
    allSelected,
    fileName,
    addFiles,
    pickFiles,
    onDrop,
    removeRow,
    clearAll,
    toggleAll,
    markDirty,
    applyBatch,
    save,
    pickCoverImage,
    applyCover,
    fieldLabel
  };
}
