import { useI18n } from 'vue-i18n';
import type { MediaFile, Playlist } from '@renderer/types/media';
import { useLibraryStore } from '@renderer/stores/library';
import { usePlayerStore } from '@renderer/stores/player';
import { usePluginsStore } from '@renderer/stores/plugins';
import { dirname } from '@renderer/utils/path';
import { useContextMenu } from './useContextMenu';
import { createLibraryMenuDefs } from './libraryMenuDefs';

export function useLibraryContextMenu() {
  const { t } = useI18n();
  const library = useLibraryStore();
  const player = usePlayerStore();
  const plugins = usePluginsStore();
  const { open } = useContextMenu();

  function revealInExplorer(filePath: string) {
    const dir = dirname(filePath);
    // otwórz jako NOWE OKNO eksploratora (nie przełączaj widoku)
    window.api?.invoke('explorer:create', dir);
  }

  const { trackMenu, albumMenu, folderMenu, imageMenu, playlistMenu } = createLibraryMenuDefs({
    t,
    player,
    library,
    plugins,
    revealInExplorer
  });

  function showTrackMenu(e: MouseEvent, track: MediaFile, opts?: { onEdit?: () => void }) {
    const { defs, ctx } = trackMenu(track, opts);
    open(e, defs, ctx);
  }

  function showAlbumMenu(e: MouseEvent, name: string, tracks: MediaFile[]) {
    const { defs, ctx } = albumMenu(name, tracks);
    open(e, defs, ctx);
  }

  function showFolderMenu(e: MouseEvent, folderPath: string, tracks: MediaFile[]) {
    const { defs, ctx } = folderMenu(folderPath, tracks);
    open(e, defs, ctx);
  }

  function showImageMenu(e: MouseEvent, file: MediaFile, onOpen?: () => void) {
    const { defs, ctx } = imageMenu(file, onOpen);
    open(e, defs, ctx);
  }

  function showPlaylistMenu(e: MouseEvent, playlist: Playlist, onRename: (p: Playlist) => void) {
    const { defs, ctx } = playlistMenu(playlist, onRename);
    open(e, defs, ctx);
  }

  return {
    revealInExplorer,
    showTrackMenu,
    showAlbumMenu,
    showFolderMenu,
    showImageMenu,
    showPlaylistMenu
  };
}
