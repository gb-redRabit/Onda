import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useOnlineStore } from '@renderer/stores/online';
import { useSavedStore } from '@renderer/stores/saved';
import { useUIStore } from '@renderer/stores/ui';
import { savedPlaylistId } from '@renderer/utils/onlineSavedPlaylist';

// Zapisz/odznacz aktualnie rozwiązaną playlistę. Zapisany wpis trzyma PEŁNĄ
// listę elementów (wszystkie strony), więc widok Zapisane i odtwarzanie startują natychmiast bez
// ponownego rozwiązywania playlisty przy każdej wizycie.
export function useOnlineSavedPlaylist() {
  const yt = useOnlineStore();
  const saved = useSavedStore();
  const ui = useUIStore();
  const { t } = useI18n();

  const savingPlaylist = ref(false);

  async function savePlaylistAsync(r: NonNullable<typeof yt.resolved>) {
    const { items, totalItems } = await yt.loadAllResolvedItems(r.sourceUrl);
    void saved
      .savePlaylist({
        kind: r.kind,
        url: r.sourceUrl,
        title: r.title,
        thumbnail: r.items[0]?.thumbnail,
        channelTitle: r.meta.channelTitle,
        totalItems: totalItems ?? r.meta.totalItems ?? undefined,
        items: items.length > 0 ? items : r.items
      })
      .then((ok) => {
        if (ok) ui.notify('success', r.title, t('saved.playlistSaved'));
      });
  }

  function saveResolvedPlaylist() {
    const r = yt.resolved;
    if (!r || r.kind === 'video' || savingPlaylist.value) return;
    const id = savedPlaylistId(r);
    if (saved.isPlaylistSaved(id)) {
      void saved.removePlaylist(id);
      return;
    }
    savingPlaylist.value = true;
    void savePlaylistAsync(r).finally(() => {
      savingPlaylist.value = false;
    });
  }

  const resolvedSaved = computed(() => {
    const r = yt.resolved;
    if (!r || r.kind === 'video') return false;
    return saved.isPlaylistSaved(savedPlaylistId(r));
  });

  return { savingPlaylist, saveResolvedPlaylist, resolvedSaved };
}
