import { ref } from 'vue';
import { i18n } from '@renderer/i18n';
import { useUIStore } from '@renderer/stores/ui';
import { useSavedStore } from '@renderer/stores/saved';
import type { IpcSavedPlaylist } from '@shared/types/ipc';
import type { YouTubeResolvedItem } from '@renderer/types/online';
import { resolvedToSavedStream, savedStreamToItem } from '@renderer/utils/onlineHelpers';
import { resolveAllPlaylistItems } from '@renderer/utils/onlineResolveAll';

// Synchronizacja zapisanej playlisty + natychmiastowe odtwarzanie. `playAllStreams` jest wstrzykiwane ze
// store (posiada okablowanie kolejki odtwarzacza), więc ten moduł nie importuje
// store. Store destrukturyzuje zwrócone akcje z powrotem do tych samych nazw.
export function createOnlineSaved(playAllStreams: (items: YouTubeResolvedItem[]) => Promise<void>) {
  const t = i18n.global.t;
  const syncingSavedPlaylists = new Set<string>();
  const syncingSavedPlaylistState = ref(new Set<string>());

  // Ponownie sprawdza zapisaną playlistę względem YouTube w tle: nowe elementy są
  // dołączane na końcu, usunięte są odrzucane, a zapisany snapshot jest
  // aktualizowany. Nigdy nie blokuje odtwarzania - wyniki pojawiają się tylko przez toast.
  async function syncSavedPlaylist(p: IpcSavedPlaylist): Promise<{
    added: number;
    removed: number;
    total: number;
  } | null> {
    if (syncingSavedPlaylists.has(p.id)) return null;
    syncingSavedPlaylists.add(p.id);
    syncingSavedPlaylistState.value = new Set(syncingSavedPlaylists);
    try {
      const fresh = await resolveAllPlaylistItems(p.url);
      const stored = p.items ?? [];
      const freshIds = new Set(fresh.items.map((i) => i.id));
      const kept = stored.filter((s) => freshIds.has(s.id));
      const removed = stored.length - kept.length;
      const added = fresh.items.filter((i) => !stored.some((s) => s.id === i.id));
      const updated = [...kept, ...added.map(resolvedToSavedStream)];
      if (removed > 0 || added.length > 0) {
        const saved = useSavedStore();
        await saved.updatePlaylistItems(p.id, updated, fresh.totalItems);
      }
      if (removed > 0 || added.length > 0) {
        useUIStore().notify(
          'info',
          p.title,
          t('saved.syncChanged', { added: added.length, removed })
        );
      }
      return { added: added.length, removed, total: updated.length };
    } catch {
      return null;
    } finally {
      syncingSavedPlaylists.delete(p.id);
      syncingSavedPlaylistState.value = new Set(syncingSavedPlaylists);
    }
  }

  // Odtwarza zapisaną playlistę natychmiast z jej zapisanego snapshotu (bez czekania na sieć)
  // i ponownie sprawdza źródło w tle. Wpisy zapisane, zanim istniał snapshot elementów,
  // najpierw wracają do pełnego rozwiązania.
  async function playSavedPlaylist(p: IpcSavedPlaylist) {
    let items = p.items ?? [];
    if (items.length === 0) {
      const fresh = await resolveAllPlaylistItems(p.url);
      items = fresh.items.map(resolvedToSavedStream);
      if (items.length > 0) {
        const saved = useSavedStore();
        await saved.updatePlaylistItems(p.id, items, fresh.totalItems);
      }
    }
    if (items.length === 0) {
      useUIStore().notify('error', p.title, t('saved.playlistEmpty'));
      return;
    }
    void playAllStreams(items.map(savedStreamToItem));
    void syncSavedPlaylist(p);
  }

  return { syncingSavedPlaylistState, syncSavedPlaylist, playSavedPlaylist };
}
