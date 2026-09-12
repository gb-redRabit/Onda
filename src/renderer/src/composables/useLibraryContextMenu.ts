import { useI18n } from 'vue-i18n';
import type { MediaFile } from '@renderer/types/media';
import type { Playlist } from '@renderer/types/media';
import { useLibraryStore } from '@renderer/stores/library';
import { usePlayerStore } from '@renderer/stores/player';
import { usePluginsStore } from '@renderer/stores/plugins';
import { snapshotTrack } from '@renderer/stores/plugins';
import type { PluginHookPayload } from '@renderer/modules/plugins/plugin-shim';
import { dirname } from '@renderer/utils/path';
import { useContextMenu, type ContextMenuAction } from './useContextMenu';

interface TrackCtx {
  track: MediaFile;
  onEdit?: () => void;
}
interface AlbumCtx {
  name: string;
  tracks: MediaFile[];
}
interface FolderCtx {
  folderPath: string;
  tracks: MediaFile[];
}
interface ImageCtx {
  file: MediaFile;
  onOpen?: () => void;
}
interface PlaylistCtx {
  playlist: Playlist;
  onRename: (playlist: Playlist) => void;
}

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

  function buildMbQuery(track: MediaFile): string {
    const a = track.metadata?.artist || '';
    const b = track.metadata?.album || '';
    const c = track.metadata?.title || track.name.replace(/\.[^.]+$/, '');
    return [a, b, c].filter(Boolean).join(' ').trim() || c;
  }

  function playFirst(list: MediaFile[]) {
    if (!list.length) return;
    player.clearQueue();
    if (list.length > 1) player.addToQueueMultiple(list.slice(1));
    player.setTrack(list[0]);
    player.play();
  }

  function playlistDefs(track: MediaFile): ContextMenuAction<TrackCtx>[] {
    if (!library.playlists.length) return [{ separator: true, label: '' }];
    return [
      { separator: true, label: '' },
      ...library.playlists.map((p) => {
        const inPl = p.tracks.some((x) => x.path === track.path);
        return {
          label: `${inPl ? '−' : '+'} ${p.name}`,
          action: () => {
            if (inPl) library.removeFromPlaylist(p.id, track.path);
            else library.addToPlaylist(p.id, track);
          }
        };
      })
    ];
  }

  function pluginTrackMenu(track: MediaFile): ContextMenuAction<TrackCtx>[] {
    const cmds = plugins.commandsIn('track-menu');
    if (!cmds.length) return [];
    const snap = snapshotTrack(track) as unknown as PluginHookPayload;
    return [
      { separator: true, label: '' },
      ...cmds.map((cmd) => ({
        label: cmd.label,
        action: () => {
          plugins.invokeCommandWithContext(cmd.id, snap);
        }
      }))
    ];
  }

  function showTrackMenu(e: MouseEvent, track: MediaFile, opts?: { onEdit?: () => void }) {
    const isFav = player.isFavorite(track.path);
    const defs: ContextMenuAction<TrackCtx>[] = [
      {
        label: t('common.play'),
        action: (c) => {
          player.setTrack(c.track);
          player.play();
        }
      },
      {
        label: isFav ? t('common.removeFav') : t('common.addFav'),
        action: () => player.toggleFavorite(track.path)
      },
      { label: t('common.addToQueue'), action: (c) => player.addToQueue(c.track) },
      {
        label: t('ctx.playNext'),
        action: (c) => {
          const idx = player.queue.findIndex((q) => q.path === player.currentTrack?.path);
          if (idx >= 0) player.insertInQueue(idx + 1, c.track);
          else player.addToQueue(c.track);
        }
      },
      { label: t('common.editTags'), action: () => opts?.onEdit?.() },
      {
        label: t('ctx.musicBrainzSearch'),
        when: (c) => c.track.type === 'audio',
        action: (c) =>
          window.dispatchEvent(
            new CustomEvent('onda:openMusicbrainz', {
              detail: { query: buildMbQuery(c.track), track: c.track }
            })
          )
      },
      {
        label: t('common.showInFolder'),
        action: (c) => window.api?.invoke('shell:showItemInFolder', c.track.path)
      },
      {
        label: t('ctx.showInExplorer'),
        action: (c) => revealInExplorer(c.track.path)
      },
      {
        label: t('explorer.copyPath'),
        action: (c) => navigator.clipboard?.writeText(c.track.path)
      },
      ...playlistDefs(track),
      ...pluginTrackMenu(track)
    ];
    open(e, defs, { track, onEdit: opts?.onEdit });
  }

  function showAlbumMenu(e: MouseEvent, name: string, tracks: MediaFile[]) {
    const defs: ContextMenuAction<AlbumCtx>[] = [
      {
        label: t('common.playAlbum') + ` (${tracks.length})`,
        action: (c) => playFirst(c.tracks)
      },
      {
        label: t('common.addAllToQueue'),
        action: (c) => c.tracks.forEach((tr) => player.addToQueue(tr))
      },
      {
        label: t('ctx.musicBrainzAlbum'),
        action: (c) =>
          window.dispatchEvent(
            new CustomEvent('onda:openMusicbrainz', {
              detail: { query: c.name, batchTracks: c.tracks }
            })
          )
      },
      {
        label: t('ctx.showInExplorer'),
        action: (c) => c.tracks[0] && revealInExplorer(c.tracks[0].path)
      },
      {
        label: t('explorer.copyPath'),
        action: (c) => navigator.clipboard?.writeText(c.name)
      }
    ];
    open(e, defs, { name, tracks });
  }

  function showFolderMenu(e: MouseEvent, folderPath: string, tracks: MediaFile[]) {
    const audioTracks = tracks.filter((x) => x.type !== 'image');
    const defs: ContextMenuAction<FolderCtx>[] = [
      {
        label: t('ctx.playFolder', { count: audioTracks.length }),
        when: () => audioTracks.length > 0,
        action: () => playFirst(audioTracks)
      },
      {
        label: t('ctx.playShuffle'),
        when: () => audioTracks.length > 0,
        action: () => playFirst([...audioTracks].sort(() => Math.random() - 0.5))
      },
      {
        label: t('common.addAllToQueue'),
        when: () => audioTracks.length > 0,
        action: () => audioTracks.forEach((tr) => player.addToQueue(tr))
      },
      {
        label: t('ctx.musicBrainzFolder'),
        when: () => audioTracks.length > 0,
        action: () =>
          window.dispatchEvent(
            new CustomEvent('onda:openMusicbrainz', {
              detail: {
                query: folderPath.split(/[\\/]/).pop() || '',
                batchTracks: audioTracks
              }
            })
          )
      },
      {
        label: t('ctx.showInExplorer'),
        action: () => revealInExplorer(folderPath)
      },
      {
        label: t('common.showInFolder'),
        action: () => window.api?.invoke('shell:showItemInFolder', folderPath)
      },
      {
        label: t('explorer.copyPath'),
        action: () => navigator.clipboard?.writeText(folderPath)
      }
    ];
    open(e, defs, { folderPath, tracks });
  }

  function showImageMenu(e: MouseEvent, file: MediaFile, onOpen?: () => void) {
    const defs: ContextMenuAction<ImageCtx>[] = [
      {
        label: t('explorer.openImage'),
        action: (c) => c.onOpen?.()
      },
      {
        label: t('ctx.showInExplorer'),
        action: (c) => revealInExplorer(c.file.path)
      },
      {
        label: t('common.showInFolder'),
        action: (c) => window.api?.invoke('shell:showItemInFolder', c.file.path)
      },
      {
        label: t('explorer.copyPath'),
        action: (c) => navigator.clipboard?.writeText(c.file.path)
      }
    ];
    open(e, defs, { file, onOpen });
  }

  function showPlaylistMenu(e: MouseEvent, playlist: Playlist, onRename: (p: Playlist) => void) {
    const defs: ContextMenuAction<PlaylistCtx>[] = [
      {
        label: t('common.play'),
        when: (c) => c.playlist.tracks.length > 0,
        action: (c) => playFirst(c.playlist.tracks)
      },
      {
        label: t('common.addAllToQueue'),
        when: (c) => c.playlist.tracks.length > 0,
        action: (c) => c.playlist.tracks.forEach((tr) => player.addToQueue(tr))
      },
      { separator: true, label: '' },
      {
        label: t('ctx.playlistRename'),
        action: (c) => c.onRename(c.playlist)
      },
      {
        label: t('ctx.playlistExport'),
        action: (c) => {
          window.api?.invoke('playlist:export', {
            id: c.playlist.id,
            name: c.playlist.name,
            tracks: c.playlist.tracks.map((tr) => tr.path)
          });
        }
      },
      { separator: true, label: '' },
      {
        label: t('ctx.playlistDelete'),
        action: (c) => library.deletePlaylist(c.playlist.id)
      }
    ];
    open(e, defs, { playlist, onRename });
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
