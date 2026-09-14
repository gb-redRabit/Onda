import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useUIStore } from '@renderer/stores/ui';
import { useSavedStore } from '@renderer/stores/saved';
import type { IpcSavedPlaylist } from '@shared/types/ipc';
import type { YouTubeResolvedItem } from '@renderer/types/online';
import { resolvedToSavedStream, savedStreamToItem } from '@renderer/utils/onlineHelpers';
import { resolveAllPlaylistItems } from '@renderer/utils/onlineResolveAll';

// Saved-playlist sync + instant playback. `playAllStreams` is injected from the
// store (it owns the player queue wiring) so this module does not import the
// store. The store destructures the returned actions back into the same names.
export function createOnlineSaved(playAllStreams: (items: YouTubeResolvedItem[]) => Promise<void>) {
  const { t } = useI18n();
  const syncingSavedPlaylists = new Set<string>();
  const syncingSavedPlaylistState = ref(new Set<string>());

  // Re-checks a saved playlist against YouTube in the background: new items are
  // appended at the end, removed ones are dropped, and the stored snapshot is
  // updated. Never blocks playback - results only surface through a toast.
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

  // Plays a saved playlist instantly from its stored snapshot (no network wait)
  // and re-checks the source in the background. Entries saved before the item
  // snapshot existed fall back to a full resolve first.
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
