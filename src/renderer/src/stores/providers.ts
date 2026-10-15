import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import type { ProviderDetectResult, ProviderRef, RemoteItem } from '@shared/types/providers';
import type { IpcDownloadJobInput, IpcDownloadTask } from '@shared/types/ipc';
import type { MediaFile } from '@renderer/types/media';
import { getMimeType } from '@shared/mime';
import { usePlayerStore } from '@renderer/stores/player';
import { mediaServerBase } from '@renderer/utils/mediaUrl';

// Store providerów linków (PikPak/MEGA/Drive…): auto-detekcja URL, przeglądanie
// folderów, pobieranie 1:1 i oznaczanie „✓ Pobrano". Oznaczenia trzymane są lokalnie
// (localStorage) — ukończenie rozpoznajemy po zdarzeniu postępu pobierania.

const VIDEO_EXT = /\.(mp4|mkv|mov|webm|avi|ts|m2ts|flv|wmv|m4v)$/i;
const AUDIO_EXT = /\.(mp3|m4a|aac|flac|wav|ogg|opus)$/i;

export interface ProviderCrumb {
  id: string | null;
  name: string;
}

export const useProvidersStore = defineStore('providers', () => {
  const url = ref('');
  const detected = ref<ProviderDetectResult | null>(null);
  const source = ref<ProviderRef | null>(null);
  const crumbs = ref<ProviderCrumb[]>([]);
  const items = ref<RemoteItem[]>([]);
  const loading = ref(false);
  const error = ref('');
  const downloaded = ref<Set<string>>(new Set());
  let listening = false;
  let folderLoadId = 0;

  const canGoUp = computed(() => crumbs.value.length > 1);
  const folders = computed(() => items.value.filter((i) => i.kind === 'folder'));
  const files = computed(() => items.value.filter((i) => i.kind === 'file'));

  function isPlayable(name: string): boolean {
    return VIDEO_EXT.test(name) || AUDIO_EXT.test(name);
  }

  function itemKey(itemId: string): string {
    return source.value ? `${source.value.provider}:${source.value.shareId}:${itemId}` : itemId;
  }

  // IPC (structured clone) NIE potrafi sklonować reaktywnego proxy z `ref` — wysyłamy
  // zwykły obiekt. Bez tego invoke odrzuca: "An object could not be cloned.".
  function plainSource(): ProviderRef | null {
    const s = source.value;
    return s ? { provider: s.provider, shareId: s.shareId } : null;
  }

  function isDownloaded(itemId: string): boolean {
    return downloaded.value.has(itemKey(itemId));
  }

  function ensureProgressListener(): void {
    if (listening) return;
    listening = true;
    try {
      window.api.on('yt:downloadProgress', (payload: unknown) => {
        const task = payload as IpcDownloadTask;
        const src = task?.source;
        if (
          task?.status === 'completed' &&
          src?.mode === 'provider' &&
          src.providerItemId &&
          src.providerRef
        ) {
          const k = `${src.providerRef.provider}:${src.providerRef.shareId}:${src.providerItemId}`;
          if (!downloaded.value.has(k)) {
            downloaded.value = new Set(downloaded.value).add(k);
          }
        }
      });
    } catch {
      // mostek IPC niedostępny (np. w testach) — pomijamy
    }
  }

  // Wczytuje trwałe oznaczenia „✓ pobrano" z main dla bieżącego share.
  async function loadDownloadedMarks(): Promise<void> {
    const ref = plainSource();
    if (!ref) return;
    try {
      const ids = (await window.api.invoke('providers:downloaded', {
        provider: ref.provider,
        shareId: ref.shareId
      })) as string[] | null;
      if (Array.isArray(ids) && ids.length) {
        const next = new Set(downloaded.value);
        for (const id of ids) next.add(`${ref.provider}:${ref.shareId}:${id}`);
        downloaded.value = next;
      }
    } catch {
      /* trwałe oznaczenia niedostępne */
    }
  }

  async function loadFolder(folderId: string | null, force = false): Promise<void> {
    const ref = plainSource();
    if (!ref) return;
    const reqId = ++folderLoadId;
    loading.value = true;
    error.value = '';
    try {
      const res = (await window.api.invoke('providers:list', {
        ref,
        folderId: folderId ?? undefined,
        force
      })) as { success: boolean; error?: string; items: RemoteItem[] };
      if (reqId !== folderLoadId) return;
      if (!res?.success) {
        error.value = res?.error || 'Nie udało się wczytać zawartości';
        items.value = [];
      } else {
        items.value = res.items || [];
      }
    } catch (e) {
      if (reqId !== folderLoadId) return;
      error.value = e instanceof Error ? e.message : String(e);
      items.value = [];
    } finally {
      if (reqId === folderLoadId) loading.value = false;
    }
  }

  async function detect(value: string): Promise<boolean> {
    error.value = '';
    const trimmed = value.trim();
    if (!trimmed) return false;
    try {
      const res = (await window.api.invoke(
        'providers:detect',
        trimmed
      )) as ProviderDetectResult | null;
      if (!res) {
        detected.value = null;
        return false;
      }
      detected.value = res;
      source.value = res.ref;
      url.value = trimmed;
      crumbs.value = [{ id: null, name: res.label }];
      ensureProgressListener();
      await Promise.all([loadFolder(null), loadDownloadedMarks()]);
      return true;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async function openFolder(item: RemoteItem): Promise<void> {
    crumbs.value = [...crumbs.value, { id: item.id, name: item.name }];
    await loadFolder(item.id);
  }

  async function goToCrumb(index: number): Promise<void> {
    const crumb = crumbs.value[index];
    if (!crumb) return;
    crumbs.value = crumbs.value.slice(0, index + 1);
    await loadFolder(crumb.id);
  }

  async function goUp(): Promise<void> {
    if (crumbs.value.length <= 1) return;
    await goToCrumb(crumbs.value.length - 2);
  }

  function buildJobInput(ref: ProviderRef, item: RemoteItem): IpcDownloadJobInput {
    const isAudio = AUDIO_EXT.test(item.name);
    const kind: 'audio' | 'video' = isAudio ? 'audio' : 'video';
    return {
      url: `provider://${ref.provider}/${ref.shareId}/${item.id}`,
      title: item.name,
      thumbnail: item.thumbnail,
      kind,
      format: isAudio ? 'mp3' : 'mp4',
      quality: 'best',
      outputDir: '',
      filenameTemplate: '{title}',
      source: {
        mode: 'provider',
        providerId: ref.provider,
        providerRef: ref,
        providerItemId: item.id,
        fileName: item.name
      }
    };
  }

  async function download(item: RemoteItem): Promise<boolean> {
    const ref = plainSource();
    if (!ref) return false;
    const input = buildJobInput(ref, item);
    try {
      await window.api.invoke('yt:download:add', [input]);
      return true;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  function reset(): void {
    folderLoadId++;
    detected.value = null;
    source.value = null;
    crumbs.value = [];
    items.value = [];
    error.value = '';
  }

  // MIME z rozszerzenia — przekazywany do serwera mediów, gdy upstream daje octet-stream.
  function mimeFor(name: string): string {
    if (/\.m2ts$/i.test(name)) return 'video/mp2t';
    return getMimeType(name);
  }

  // Podgląd/odtwarzanie w aplikacji (przez proxy serwera mediów).
  async function play(item: RemoteItem): Promise<boolean> {
    const ref = plainSource();
    if (!ref) return false;
    error.value = '';
    const mime = mimeFor(item.name);
    try {
      const res = (await window.api.invoke('providers:streamUrl', {
        ref,
        itemId: item.id,
        mime
      })) as { success: boolean; url?: string; streamToken?: string; error?: string };
      let path: string;
      if (res?.success && res.url) {
        path = res.url;
      } else if (res?.success && res.streamToken) {
        // Strumień providera — proxy `/stream?provider=`.
        path = `${mediaServerBase()}/stream?provider=${res.streamToken}`;
      } else {
        error.value = res?.error || 'Nie można odtworzyć tego pliku';
        return false;
      }
      const isVideo = VIDEO_EXT.test(item.name);
      const track: MediaFile = {
        id: `provider:${ref.provider}:${ref.shareId}:${item.id}`,
        name: item.name,
        // URL bezpośredni (player opakowuje zdalne) LUB gotowy proxy `/stream?provider=`.
        path,
        extension: (item.name.split('.').pop() || '').toLowerCase(),
        mimeType: mime !== 'application/octet-stream' ? mime : isVideo ? 'video/mp4' : 'audio/mpeg',
        size: item.size || 0,
        type: isVideo ? 'video' : 'stream',
        duration: 0,
        thumbnail: item.thumbnail,
        addedAt: Date.now(),
        playCount: 0
      };
      usePlayerStore().setTrack(track);
      return true;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  // Rekurencyjne zbieranie plików folderu (BFS) z limitami bezpieczeństwa.
  const BULK_MAX_FOLDERS = 200;
  const BULK_MAX_FILES = 500;

  async function collectFolderFiles(
    rootFolderId: string | null
  ): Promise<{ files: RemoteItem[]; truncated: boolean }> {
    const files: RemoteItem[] = [];
    const queue: Array<string | null> = [rootFolderId];
    let foldersVisited = 0;
    while (queue.length && foldersVisited < BULK_MAX_FOLDERS && files.length < BULK_MAX_FILES) {
      const folderId = queue.shift() ?? null;
      foldersVisited++;
      const ref = plainSource();
      if (!ref) break;
      try {
        const res = (await window.api.invoke('providers:list', {
          ref,
          folderId: folderId ?? undefined
        })) as { success: boolean; items: RemoteItem[] };
        if (!res?.success) continue;
        for (const item of res.items) {
          if (item.kind === 'folder') queue.push(item.id);
          else if (files.length < BULK_MAX_FILES) files.push(item);
        }
      } catch {
        // pomiń folder, który się nie wczytał
      }
    }
    const truncated = files.length >= BULK_MAX_FILES || foldersVisited >= BULK_MAX_FOLDERS;
    return { files, truncated };
  }

  // Pobiera wszystkie pliki bieżącego folderu i podfolderów.
  async function downloadFolder(): Promise<{ queued: number; found: number; truncated: boolean }> {
    const start = crumbs.value.length ? crumbs.value[crumbs.value.length - 1].id : null;
    return enqueueFiles(await collectFolderFiles(start));
  }

  // Pobiera konkretny folder (i jego podfoldery) — np. z karty folderu.
  async function downloadFolderById(
    folderId: string
  ): Promise<{ queued: number; found: number; truncated: boolean }> {
    return enqueueFiles(await collectFolderFiles(folderId));
  }

  // Wysyła całą kolekcję plików w JEDNYM wywołaniu IPC `yt:download:add`,
  // dzięki czemu masowe pobieranie (>20 plików) nie jest blokowane przez rate-limiter IPC.
  async function enqueueFiles(collection: {
    files: RemoteItem[];
    truncated: boolean;
  }): Promise<{ queued: number; found: number; truncated: boolean }> {
    const ref = plainSource();
    if (!ref || collection.files.length === 0) {
      return { queued: 0, found: collection.files.length, truncated: collection.truncated };
    }
    const inputs = collection.files.map((file) => buildJobInput(ref, file));
    try {
      await window.api.invoke('yt:download:add', inputs);
      return {
        queued: inputs.length,
        found: collection.files.length,
        truncated: collection.truncated
      };
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      return { queued: 0, found: collection.files.length, truncated: collection.truncated };
    }
  }

  return {
    url,
    detected,
    source,
    crumbs,
    items,
    loading,
    error,
    downloaded,
    canGoUp,
    folders,
    files,
    isPlayable,
    itemKey,
    isDownloaded,
    detect,
    loadFolder,
    openFolder,
    goToCrumb,
    goUp,
    download,
    downloadFolder,
    downloadFolderById,
    play,
    reset
  };
});
