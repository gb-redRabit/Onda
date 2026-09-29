import { useI18n } from 'vue-i18n';
import type { MediaFile } from '@renderer/types/media';
import { usePlayerStore } from '@renderer/stores/player';
import { useLibraryStore } from '@renderer/stores/library';
import { useSettingsStore } from '@renderer/stores/settings';
import { useUIStore } from '@renderer/stores/ui';
import { HOME_SECTION_ORDER, toggleHomeSection } from '@renderer/utils/homeSections';
import { useContextMenu, type ContextMenuAction } from './useContextMenu';

interface RecentCtx {
  track: MediaFile;
}

export function useHomeContextMenu() {
  const { t } = useI18n();
  const player = usePlayerStore();
  const library = useLibraryStore();
  const settings = useSettingsStore();
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

  // Background menu: which shelves Home shows (same ✓ pattern as the status
  // bar's section menu, so the app stays consistent).
  function showHomeMenu(e: MouseEvent) {
    const defs: ContextMenuAction<null>[] = HOME_SECTION_ORDER.map((id) => {
      const on = settings.home.sections.includes(id);
      return {
        label: `${on ? '✓ ' : ''}${t(`home.sections.${id}`)}`,
        action: () =>
          settings.updateHome({ sections: toggleHomeSection(settings.home.sections, id) })
      };
    });
    defs.push({ separator: true, label: '' });
    defs.push({
      label: t('home.resetSections'),
      action: () => settings.updateHome({ sections: [...HOME_SECTION_ORDER] })
    });
    open(e, defs, null);
  }

  return { showRecentMenu, showHomeMenu };
}
