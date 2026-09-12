import { useI18n } from 'vue-i18n';
import type { MediaFile } from '@renderer/types/media';
import { usePlayerStore } from '@renderer/stores/player';
import { useLibraryStore } from '@renderer/stores/library';
import { useUIStore } from '@renderer/stores/ui';
import { useContextMenu, type ContextMenuAction } from './useContextMenu';

interface RecentCtx {
  track: MediaFile;
}

export function useHomeContextMenu() {
  const { t } = useI18n();
  const player = usePlayerStore();
  const library = useLibraryStore();
  const ui = useUIStore();
  const { open } = useContextMenu();

  function showRecentMenu(e: MouseEvent, track: MediaFile) {
    const defs: ContextMenuAction<RecentCtx>[] = [
      {
        label: t('common.play'),
        action: (c) => {
          player.setTrack(c.track);
          player.play();
        }
      },
      {
        label: t('common.addToQueue'),
        action: (c) => player.addToQueue(c.track)
      },
      { separator: true, label: '' },
      {
        label: t('home.removeFromRecent'),
        action: (c) => {
          library.clearRecent(c.track.path);
          ui.notify('success', t('home.removedFromRecent'));
        }
      }
    ];
    open(e, defs, { track });
  }

  return { showRecentMenu };
}
