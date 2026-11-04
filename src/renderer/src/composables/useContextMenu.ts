import { markRaw, type Component } from 'vue';
import { CONTEXT_MENU_WIDTH, useUIStore } from '@renderer/stores/ui';
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
      ...(typeof def.checked === 'boolean' ? { checked: def.checked } : {}),
      ...(def.action ? { action: () => def.action!(ctx) } : {}),
      ...(children?.length ? { children } : {})
    };
  }

  // Separatory wynikają z warunków `when`, więc po odfiltrowaniu pozycji mogą
  // zostać na początku, na końcu albo parami. Normalizujemy je w jednym miejscu,
  // żeby żadne menu (Biblioteka, Pobrania, wtyczki) nie rysowało „wiszącej kreski”.
  function sanitizeSeparators(items: ContextMenuItem[]): ContextMenuItem[] {
    const out: ContextMenuItem[] = [];
    for (const item of items) {
      if (item.separator) {
        if (!out.length || out[out.length - 1].separator) continue;
        out.push(item);
        continue;
      }
      if (item.children) {
        const children = sanitizeSeparators(item.children);
        if (children.length) {
          out.push({ ...item, children });
        } else {
          const withoutChildren = { ...item };
          delete withoutChildren.children;
          out.push(withoutChildren);
        }
        continue;
      }
      out.push(item);
    }
    while (out.length && out[out.length - 1].separator) out.pop();
    return out;
  }

  function build<T>(defs: ContextMenuAction<T>[], ctx: T): ContextMenuItem[] {
    const items = defs.map((d) => toItem(d, ctx)).filter((i): i is ContextMenuItem => i !== null);
    return sanitizeSeparators(items);
  }

  function open<T>(e: MouseEvent, defs: ContextMenuAction<T>[], ctx: T) {
    e.preventDefault();
    e.stopPropagation();
    ui.showContextMenu(e.clientX, e.clientY, build(defs, ctx));
  }

  // Menu z przycisku `⋯`: wyrównane do prawej krawędzi kontrolki i otwierane
  // pod nią. Pozycję i tak przycina `ContextMenu.vue`, więc przy dolnej
  // krawędzi okna menu otworzy się nad przyciskiem.
  function openAt<T>(target: HTMLElement, defs: ContextMenuAction<T>[], ctx: T) {
    const rect = target.getBoundingClientRect();
    ui.showContextMenu(
      Math.max(8, rect.right - CONTEXT_MENU_WIDTH),
      rect.bottom + 4,
      build(defs, ctx)
    );
  }

  return { build, open, openAt };
}
