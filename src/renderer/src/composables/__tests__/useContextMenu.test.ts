import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import type { Component } from 'vue';
import { useContextMenu, type ContextMenuAction } from '../useContextMenu';
import { useUIStore } from '@renderer/stores/ui';

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

  it('keeps separators and plain items', () => {
    const { build } = useContextMenu();
    const defs: ContextMenuAction<Ctx>[] = [{ separator: true, label: '' }, { label: 'Item' }];
    const items = build(defs, { kind: 'file', count: 1 });
    expect(items).toHaveLength(2);
    expect(items[0].separator).toBe(true);
    expect(items[1].label).toBe('Item');
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
});
