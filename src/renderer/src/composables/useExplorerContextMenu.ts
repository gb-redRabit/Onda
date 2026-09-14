import type { FileItem } from '@renderer/types/explorer';
import { useContextMenu } from './useContextMenu';
import { createExplorerMenuDefs, type ExplorerActionCtx } from '@renderer/utils/explorerMenuDefs';

export type { ExplorerActionCtx } from '@renderer/utils/explorerMenuDefs';

export function useExplorerContextMenu(ctx: ExplorerActionCtx) {
  const { open } = useContextMenu();
  const { emptyMenu, itemMenu } = createExplorerMenuDefs(ctx);

  function handleEmptyContextMenu(event: MouseEvent) {
    ctx.explorer.clearSelection();
    const { defs, menuCtx } = emptyMenu();
    open(event, defs, menuCtx);
  }

  function handleContextMenu(event: MouseEvent, item: FileItem) {
    if (!ctx.explorer.selectedFiles.has(item.path)) {
      ctx.explorer.clearSelection();
      ctx.explorer.selectedFiles.add(item.path);
    }
    const { defs, menuCtx } = itemMenu(item);
    open(event, defs, menuCtx);
  }

  return { handleContextMenu, handleEmptyContextMenu };
}
