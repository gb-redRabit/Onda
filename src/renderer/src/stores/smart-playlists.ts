import { ref } from 'vue';
import { defineStore } from 'pinia';
import type { SmartPlaylist } from '@shared/types/smart-playlist';
import { clonePlain } from '@renderer/utils/clone';

const SAVE_DEBOUNCE_MS = 400;

export const useSmartPlaylists = defineStore('smartPlaylists', () => {
  const smartPlaylists = ref<SmartPlaylist[]>([]);
  const loaded = ref(false);
  const loading = ref(false);
  let loadPromise: Promise<void> | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  async function ensureLoaded(): Promise<void> {
    if (loaded.value) return;
    if (loadPromise) return loadPromise;
    loading.value = true;
    loadPromise = (async () => {
      try {
        const list = await window.api?.loadSmartPlaylists();
        if (Array.isArray(list)) smartPlaylists.value = list;
      } catch {
        // brak zapisanych smart playlist
      } finally {
        loaded.value = true;
        loading.value = false;
        loadPromise = null;
      }
    })();
    return loadPromise;
  }

  async function saveNow(): Promise<void> {
    if (saveTimer !== null) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    try {
      await window.api?.saveSmartPlaylists(clonePlain(smartPlaylists.value));
    } catch {
      // niekrytyczne — dane zostają w pamięci sesji
    }
  }

  function scheduleSave(): void {
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void saveNow();
    }, SAVE_DEBOUNCE_MS);
  }

  function create(
    input: Pick<SmartPlaylist, 'name' | 'match' | 'rules' | 'sort' | 'sortDir' | 'limit'>
  ): SmartPlaylist {
    const now = Date.now();
    const playlist: SmartPlaylist = {
      id: `smart-${crypto.randomUUID()}`,
      name: input.name.trim(),
      match: input.match,
      rules: input.rules.map((rule) => ({ ...rule })),
      sort: input.sort,
      sortDir: input.sortDir,
      limit: input.limit,
      createdAt: now,
      updatedAt: now
    };
    smartPlaylists.value.push(playlist);
    scheduleSave();
    return playlist;
  }

  function update(
    id: string,
    patch: Partial<Pick<SmartPlaylist, 'name' | 'match' | 'rules' | 'sort' | 'sortDir' | 'limit'>>
  ): SmartPlaylist | null {
    const playlist = smartPlaylists.value.find((p) => p.id === id);
    if (!playlist) return null;
    if (patch.name !== undefined) playlist.name = patch.name.trim();
    if (patch.match !== undefined) playlist.match = patch.match;
    if (patch.rules !== undefined) playlist.rules = patch.rules.map((rule) => ({ ...rule }));
    if (patch.sort !== undefined) playlist.sort = patch.sort;
    if (patch.sortDir !== undefined) playlist.sortDir = patch.sortDir;
    if (patch.limit !== undefined) playlist.limit = patch.limit;
    playlist.updatedAt = Date.now();
    scheduleSave();
    return playlist;
  }

  function remove(id: string): boolean {
    const before = smartPlaylists.value.length;
    smartPlaylists.value = smartPlaylists.value.filter((p) => p.id !== id);
    if (smartPlaylists.value.length === before) return false;
    scheduleSave();
    return true;
  }

  return {
    smartPlaylists,
    loaded,
    loading,
    ensureLoaded,
    saveNow,
    create,
    update,
    remove
  };
});
