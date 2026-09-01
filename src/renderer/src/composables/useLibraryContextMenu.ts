import { useI18n } from 'vue-i18n';
import type { MediaFile } from '@renderer/types/media';
import { useLibraryStore } from '@renderer/stores/library';
import { usePlayerStore } from '@renderer/stores/player';
import { useUIStore } from '@renderer/stores/ui';
import { dirname } from '@renderer/utils/path';

export function useLibraryContextMenu() {
  const { t } = useI18n();
  const library = useLibraryStore();
  const player = usePlayerStore();
  const ui = useUIStore();

  function revealInExplorer(filePath: string) {
    const dir = dirname(filePath);
    // otwórz jako NOWE OKNO eksploratora (nie przełączaj widoku)
    window.api?.invoke('explorer:create', dir);
  }

  function buildMbQuery(track: MediaFile): string {
    const a = track.metadata?.artist || '';
    const b = track.metadata?.album || '';
    const c = track.metadata?.title || track.name.replace(/\.[^.]+$/, '');
    return [a, b, c].filter(Boolean).join(' ').trim() || c;
  }
  function showTrackMenu(e: MouseEvent, track: MediaFile, opts?: { onEdit?: () => void }) {
    e.preventDefault();
    const isFav = player.isFavorite(track.path);
    ui.showContextMenu(e.clientX, e.clientY, [
      { label: t('common.play'), action: () => { player.setTrack(track); player.play(); } },
      { label: isFav ? t('common.removeFav') : t('common.addFav'), action: () => player.toggleFavorite(track.path) },
      { label: t('common.addToQueue'), action: () => player.addToQueue(track) },
      {
        label: 'Odtwórz jako następny',
        action: () => {
          const idx = player.queue.findIndex((q) => q.path === player.currentTrack?.path);
          if (idx >= 0) player.insertInQueue(idx + 1, track);
          else player.addToQueue(track);
        }
      },
      { label: t('common.editTags'), action: () => opts?.onEdit?.() },
      ...(track.type === 'audio'
        ? [{ label: 'MusicBrainz — szukaj', action: () => window.dispatchEvent(new CustomEvent('onda:openMusicbrainz', { detail: { query: buildMbQuery(track), track } })) } as const]
        : []),
      { label: t('common.showInFolder'), action: () => window.api?.invoke('shell:showItemInFolder', track.path) },
      { label: 'Pokaż w Eksploratorze (Onda)', action: () => revealInExplorer(track.path) },
      { label: 'Kopiuj ścieżkę', action: () => navigator.clipboard?.writeText(track.path) },
      ...(library.playlists.length > 0 ? [{ label: '—', separator: true } as const] : []),
      ...library.playlists.map((p) => {
        const inPl = p.tracks.some((t) => t.path === track.path);
        return {
          label: `${inPl ? '−' : '+'} ${p.name}`,
          action: () => {
            if (inPl) library.removeFromPlaylist(p.id, track.path);
            else library.addToPlaylist(p.id, track);
          }
        };
      })
    ]);
  }

  function showAlbumMenu(e: MouseEvent, name: string, tracks: MediaFile[]) {
    e.preventDefault();
    ui.showContextMenu(e.clientX, e.clientY, [
      { label: t('common.playAlbum') + ` (${tracks.length})`, action: () => { if (tracks.length) { player.clearQueue(); if (tracks.length > 1) player.addToQueueMultiple(tracks.slice(1)); player.setTrack(tracks[0]); player.play(); } } },
      { label: t('common.addAllToQueue'), action: () => tracks.forEach((t) => player.addToQueue(t)) },
      { label: 'MusicBrainz — batch album', action: () => window.dispatchEvent(new CustomEvent('onda:openMusicbrainz', { detail: { query: name, batchTracks: tracks } })) },
      { label: 'Pokaż w Eksploratorze (Onda)', action: () => tracks[0] && revealInExplorer(tracks[0].path) },
      { label: 'Kopiuj nazwę albumu', action: () => navigator.clipboard?.writeText(name) },
    ]);
  }

  function showFolderMenu(e: MouseEvent, folderPath: string, tracks: MediaFile[]) {
    e.preventDefault();
    const count = tracks.filter((t) => t.type !== 'image').length;
    const hasAudio = count > 0;
    ui.showContextMenu(e.clientX, e.clientY, [
      ...(hasAudio
        ? [
            { label: `Odtwórz folder (${count})`, action: () => { const filtered = tracks.filter((t) => t.type !== 'image'); if (filtered.length) { player.clearQueue(); if (filtered.length > 1) player.addToQueueMultiple(filtered.slice(1)); player.setTrack(filtered[0]); player.play(); } } },
            { label: 'Odtwórz losowo', action: () => { const f = tracks.filter((t) => t.type !== 'image'); if (f.length) { const s = [...f].sort(() => Math.random() - 0.5); player.clearQueue(); if (s.length > 1) player.addToQueueMultiple(s.slice(1)); player.setTrack(s[0]); player.play(); } } },
            { label: t('common.addAllToQueue'), action: () => tracks.filter((t) => t.type !== 'image').forEach((t) => player.addToQueue(t)) },
            { label: 'MusicBrainz — batch folder', action: () => window.dispatchEvent(new CustomEvent('onda:openMusicbrainz', { detail: { query: folderPath.split(/[\\/]/).pop() || '', batchTracks: tracks.filter((t) => t.type === 'audio') } })) },
          ]
        : []),
      { label: 'Pokaż w Eksploratorze (Onda)', action: () => revealInExplorer(folderPath) },
      { label: t('common.showInFolder'), action: () => window.api?.invoke('shell:showItemInFolder', folderPath) },
      { label: 'Kopiuj ścieżkę', action: () => navigator.clipboard?.writeText(folderPath) },
    ]);
  }

  function showImageMenu(e: MouseEvent, file: MediaFile, onOpen?: () => void) {
    e.preventDefault();
    ui.showContextMenu(e.clientX, e.clientY, [
      { label: 'Otwórz obraz', action: () => onOpen?.() },
      { label: 'Pokaż w Eksploratorze (Onda)', action: () => revealInExplorer(file.path) },
      { label: t('common.showInFolder'), action: () => window.api?.invoke('shell:showItemInFolder', file.path) },
      { label: 'Kopiuj ścieżkę', action: () => navigator.clipboard?.writeText(file.path) },
    ]);
  }

  return { revealInExplorer, showTrackMenu, showAlbumMenu, showFolderMenu, showImageMenu };
}
