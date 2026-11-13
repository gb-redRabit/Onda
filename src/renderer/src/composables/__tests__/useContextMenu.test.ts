import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import type { Component } from 'vue';
import { useContextMenu, type ContextMenuAction } from '../useContextMenu';
import { CONTEXT_MENU_WIDTH, useUIStore } from '@renderer/stores/ui';

interface Ctx {
  kind: 'dir' | 'file';
  count: number;
}

function stubEvent() {
  return {
    clientX: 10,
    clientY: 15,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn()
  } as unknown as MouseEvent;
}

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('useContextMenu.build', () => {
  it('filters items by `when` (ctx-dependent visibility)', () => {
    const { build } = useContextMenu();
    const defs: ContextMenuAction<Ctx>[] = [
      { label: 'Open', when: (c) => c.kind === 'dir' },
      { label: 'Always' }
    ];
    const items = build(defs, { kind: 'file', count: 1 });
    expect(items.map((i) => i.label)).toEqual(['Always']);
  });

  it('applies `disabledWhen` per context', () => {
    const { build } = useContextMenu();
    const defs: ContextMenuAction<Ctx>[] = [
      { label: 'Delete', disabledWhen: (c) => c.count === 0 }
    ];
    expect(build(defs, { kind: 'file', count: 0 })[0].disabled).toBe(true);
    expect(build(defs, { kind: 'file', count: 1 })[0].disabled).toBeUndefined();
  });

  it('keeps separators between items', () => {
    const { build } = useContextMenu();
    const defs: ContextMenuAction<Ctx>[] = [
      { label: 'A' },
      { separator: true, label: '' },
      { label: 'B' }
    ];
    const items = build(defs, { kind: 'file', count: 1 });
    expect(items.map((i) => i.label)).toEqual(['A', '', 'B']);
    expect(items[1].separator).toBe(true);
  });

  it('drops leading, trailing and doubled separators', () => {
    const { build } = useContextMenu();
    const defs: ContextMenuAction<Ctx>[] = [
      { separator: true, label: '' },
      { label: 'A' },
      { separator: true, label: '' },
      { separator: true, label: '' },
      { label: 'B' },
      { separator: true, label: '' }
    ];
    const items = build(defs, { kind: 'file', count: 1 });
    expect(items.map((i) => i.label)).toEqual(['A', '', 'B']);
  });

  it('drops a separator that became trailing after filtering', () => {
    const { build } = useContextMenu();
    const defs: ContextMenuAction<Ctx>[] = [
      { label: 'A' },
      { separator: true, label: '' },
      { label: 'Hidden', when: (c) => c.count > 5 }
    ];
    const items = build(defs, { kind: 'file', count: 1 });
    expect(items.map((i) => i.label)).toEqual(['A']);
  });

  it('sanitizes separators inside submenu children', () => {
    const { build } = useContextMenu();
    const defs: ContextMenuAction<Ctx>[] = [
      {
        label: 'Group',
        children: [
          { separator: true, label: '' },
          { label: 'Child' },
          { separator: true, label: '' }
        ]
      }
    ];
    const items = build(defs, { kind: 'file', count: 1 });
    expect(items[0].children?.map((c) => c.label)).toEqual(['Child']);
  });

  it('maps ctx actions and recursively filters children', () => {
    const { build } = useContextMenu();
    const defs: ContextMenuAction<Ctx>[] = [
      {
        label: 'Group',
        children: [
          { label: 'Child A', when: (c) => c.count > 5 },
          { label: 'Child B', action: () => undefined }
        ]
      }
    ];
    const items = build(defs, { kind: 'file', count: 1 });
    expect(items[0].children?.map((c) => c.label)).toEqual(['Child B']);
    expect(items[0].children?.[0].action).toBeTypeOf('function');
  });

  it('wraps action so it receives the provided ctx', () => {
    const { build } = useContextMenu();
    const received: Ctx[] = [];
    const defs: ContextMenuAction<Ctx>[] = [{ label: 'Run', action: (c) => received.push(c) }];
    const items = build(defs, { kind: 'file', count: 7 });
    items[0].action?.();
    expect(received).toHaveLength(1);
    expect(received[0].count).toBe(7);
  });

  it('lets icons be components (markRaw safe)', () => {
    const { build } = useContextMenu();
    const icon = { render: () => null } as unknown as Component;
    const defs: ContextMenuAction<Ctx>[] = [{ label: 'I', icon }];
    expect(build(defs, { kind: 'file', count: 1 })[0].icon).toBe(icon);
  });

  it('copies shortcuts and explicit disabled/checked state', () => {
    const { build } = useContextMenu();
    const ctx = { kind: 'file' as const, count: 1 };

    expect(
      build([{ label: 'S', shortcut: 'Ctrl+S', disabled: true, checked: false }], ctx)[0]
    ).toMatchObject({ shortcut: 'Ctrl+S', disabled: true, checked: false });
  });

  it('drops an empty submenu wrapper', () => {
    const { build } = useContextMenu();
    const items = build([{ label: 'Group', children: [{ separator: true, label: '' }] }], {
      kind: 'file',
      count: 1
    });

    expect(items[0].label).toBe('Group');
    expect(items[0].children).toBeUndefined();
  });
});

describe('useContextMenu.open', () => {
  it('prevents default and shows the menu in the ui store', () => {
    const { open } = useContextMenu();
    const ui = useUIStore();
    const e = stubEvent();
    open(e, [{ label: 'X', when: (c) => c.count > 0 }], { kind: 'file', count: 1 });
    expect(e.preventDefault).toHaveBeenCalled();
    expect(ui.contextMenu).not.toBeNull();
    expect(ui.contextMenu?.items.map((i) => i.label)).toEqual(['X']);
    expect(ui.contextMenu?.x).toBe(10);
    expect(ui.contextMenu?.y).toBe(15);
  });

  it('drops hidden items before showing', () => {
    const { open } = useContextMenu();
    const ui = useUIStore();
    const e = stubEvent();
    open(e, [{ label: 'Hide', when: (c) => c.kind === 'dir' }], { kind: 'file', count: 1 });
    expect(ui.contextMenu?.items).toHaveLength(0);
  });

  it('opens a button menu aligned to the right edge and clamps it', () => {
    const { openAt } = useContextMenu();
    const ui = useUIStore();
    const target = (right: number, bottom: number) =>
      ({ getBoundingClientRect: () => ({ right, bottom }) }) as unknown as HTMLElement;

    openAt(target(500, 40), [{ label: 'X' }], { kind: 'file', count: 1 });
    expect(ui.contextMenu?.x).toBe(500 - CONTEXT_MENU_WIDTH);
    expect(ui.contextMenu?.y).toBe(44);

    openAt(target(5, 10), [{ label: 'X' }], { kind: 'file', count: 1 });
    expect(ui.contextMenu?.x).toBe(8);
  });
});
