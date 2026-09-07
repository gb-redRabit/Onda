import { useI18n } from 'vue-i18n';
import { useContextMenu, type ContextMenuAction } from './useContextMenu';

interface SettingsCtx {
  onOpenSection?: (sectionId: string) => void;
  onExport: () => void;
  onImport: () => void;
  onReset: () => void;
}

export function useSettingsContextMenu() {
  const { t } = useI18n();
  const { open } = useContextMenu();

  function showSettingsMenu(e: MouseEvent, ctx: SettingsCtx, sectionId?: string) {
    const defs: ContextMenuAction<SettingsCtx>[] = [];
    if (sectionId && ctx.onOpenSection) {
      defs.push(
        {
          label: t('settings.openSection'),
          action: (c) => c.onOpenSection?.(sectionId)
        },
        { separator: true, label: '' }
      );
    }
    defs.push(
      {
        label: t('settings.export'),
        action: (c) => c.onExport()
      },
      {
        label: t('settings.import'),
        action: (c) => c.onImport()
      },
      {
        label: t('settings.reset'),
        action: (c) => c.onReset()
      }
    );
    open(e, defs, ctx);
  }

  return { showSettingsMenu };
}