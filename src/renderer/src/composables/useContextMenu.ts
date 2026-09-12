import { markRaw, type Component } from 'vue';
import { useUIStore } from '@renderer/stores/ui';
import type { ContextMenuItem } from '@renderer/stores/ui';

export interface ContextMenuAction<T> {
  label: string;
  icon?: Component;
  shortcut?: string;
  separator?: boolean;
  disabled?: boolean;
  disabledWhen?: (ctx: T) => boolean;
  when?: (ctx: T) => boolean;
  action?: (ctx: T) => void;
  checked?: boolean;
  children?: ContextMenuAction<T>[];
}

/**
 * Registry dla menu kontekstowych (8.11.3). Buduje `ContextMenuItem[]` z deklaratywnej
 * listy akcji z warunkami widoczności (`when`). Używa przez `useContextMenu()`:
 *
 *   const { build, open } = useContextMenu();
 *   open(event, [ { label, when: c => ..., action: c => ... } ], ctx);
 */
export function useContextMenu() {
  const ui = useUIStore();

  function toItem<T>(def: ContextMenuAction<T>, ctx: T): ContextMenuItem | null {
    if (def.when && !def.when(ctx)) return null;
    if (def.separator) return { separator: true, label: '' };
    const children = def.children
      ?.map((c) => toItem(c, ctx))
      .filter((c): c is ContextMenuItem => c !== null);
    return {
      label: def.label,
      ...(def.icon ? { icon: markRaw(def.icon) } : {}),
      ...(def.shortcut ? { shortcut: def.shortcut } : {}),
      ...(def.disabled || (def.disabledWhen && def.disabledWhen(ctx)) ? { disabled: true } : {}),
      ...(def.checked ? { checked: true } : {}),
      ...(def.action ? { action: () => def.action!(ctx) } : {}),
      ...(children?.length ? { children } : {})
    };
  }

  function build<T>(defs: ContextMenuAction<T>[], ctx: T): ContextMenuItem[] {
    return defs.map((d) => toItem(d, ctx)).filter((i): i is ContextMenuItem => i !== null);
  }

  function open<T>(e: MouseEvent, defs: ContextMenuAction<T>[], ctx: T) {
    e.preventDefault();
    e.stopPropagation();
    ui.showContextMenu(e.clientX, e.clientY, build(defs, ctx));
  }

  return { build, open };
}
