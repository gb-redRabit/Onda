import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, ref } from 'vue';
import { createSourcesNavigation } from '../navigation';

const state = vi.hoisted(() => ({
  itemContext: vi.fn((item: any, endpoint: any) => ({
    kind: 'item',
    item: item.id,
    endpoint: endpoint.id
  })),
  rowContext: vi.fn((context: any, row: any, endpoint: any, table: any) => ({
    kind: 'row',
    from: context,
    row: row.id,
    endpoint: endpoint.id,
    table: table.childId
  }))
}));

vi.mock('@renderer/utils/sourcesNav', () => ({
  itemPassContext: state.itemContext,
  tableRowPassContext: state.rowContext
}));

function source(id: string, endpoints: any[] = []) {
  return { id, name: id, endpoints } as any;
}

function endpoint(id: string, overrides: Record<string, unknown> = {}) {
  return { id, name: id, childId: 'child', ...overrides } as any;
}

function setup(overrides: Record<string, any> = {}) {
  const sources =
    overrides.sources ?? ref([source('s1', [endpoint('e1')]), source('s2', [endpoint('e2')])]);
  const activeSourceId = overrides.activeSourceId ?? ref('s1');
  const activeEndpointId = overrides.activeEndpointId ?? ref('e1');
  const endpointRef = overrides.activeEndpoint ?? ref(endpoint('e1'));
  const startPage = offStartPage();
  const context = ref<any>({ page: 1 });
  const currentPage = ref(3);
  const resetItems = vi.fn();
  const fetchItems = vi.fn().mockResolvedValue(undefined);
  const nav = createSourcesNavigation({
    sources,
    activeSourceId,
    activeEndpointId,
    activeEndpoint: computed(() => endpointRef.value),
    startPage,
    context,
    currentPage,
    resetItems,
    fetchItems
  });
  return {
    nav,
    sources,
    activeSourceId,
    activeEndpointId,
    endpointRef,
    startPage,
    context,
    currentPage,
    resetItems,
    fetchItems
  };
}

function offStartPage() {
  return computed(() => 1);
}

beforeEach(() => {
  state.itemContext.mockClear();
  state.rowContext.mockClear();
});

describe('setActive', () => {
  it('switches to a new source and remembers the old navigation', () => {
    const ctx = setup();
    ctx.nav.navStack.value = [{ endpointId: 'e1', context: { q: 1 } }];
    ctx.context.value = { q: 2 };

    ctx.nav.setActive('s2');
    expect(ctx.activeSourceId.value).toBe('s2');
    expect(ctx.activeEndpointId.value).toBe('e2');
    expect(ctx.nav.navStack.value).toEqual([]);
    expect(ctx.context.value).toBeNull();
    expect(ctx.resetItems).toHaveBeenCalled();
    expect(ctx.currentPage.value).toBe(1);

    ctx.nav.setActive('s1');
    expect(ctx.activeEndpointId.value).toBe('e1');
    expect(ctx.nav.navStack.value).toEqual([{ endpointId: 'e1', context: { q: 1 } }]);
    expect(ctx.context.value).toEqual({ q: 2 });
  });

  it('honours an explicit endpoint and clears navigation', () => {
    const ctx = setup();
    ctx.nav.setActive('s1', 'other');
    expect(ctx.activeEndpointId.value).toBe('other');
    expect(ctx.nav.navStack.value).toEqual([]);
    expect(ctx.context.value).toBeNull();
    expect(ctx.resetItems).toHaveBeenCalled();
  });

  it('falls back to the first endpoint or an empty id', () => {
    const ctx = setup({ sources: ref([source('s3', [])]) });
    ctx.nav.setActive('s3');
    expect(ctx.activeEndpointId.value).toBe('');

    const noSource = setup({ sources: ref([source('s1', [endpoint('e1')])]) });
    noSource.nav.setActive('missing');
    expect(noSource.activeEndpointId.value).toBe('');
  });

  it('does not save the old state without an active source', () => {
    const ctx = setup({ activeSourceId: ref('') });
    ctx.nav.navStack.value = [{ endpointId: 'x', context: 1 }];
    ctx.nav.setActive('s2');
    expect(ctx.activeSourceId.value).toBe('s2');
    expect(ctx.nav.navStack.value).toEqual([]);
  });

  it('ignores the same source without a different endpoint', () => {
    const ctx = setup();
    ctx.nav.setActive('s1');
    expect(ctx.resetItems).not.toHaveBeenCalled();
    expect(ctx.activeEndpointId.value).toBe('e1');

    ctx.nav.setActive('s1', 'e1');
    expect(ctx.resetItems).not.toHaveBeenCalled();
  });
});

describe('drilling down', () => {
  it('opens items with a child endpoint', async () => {
    const ctx = setup();
    ctx.endpointRef.value = endpoint('e1', { childId: 'child-1' });
    const item = { id: 'i1' };

    await ctx.nav.openItem(item as never);
    expect(ctx.nav.navStack.value).toEqual([{ endpointId: 'e1', context: { page: 1 } }]);
    expect(ctx.activeEndpointId.value).toBe('child-1');
    expect(ctx.context.value).toEqual({ kind: 'item', item: 'i1', endpoint: 'e1' });
    expect(state.itemContext).toHaveBeenCalledWith(item, ctx.endpointRef.value);
    expect(ctx.resetItems).toHaveBeenCalled();
    expect(ctx.fetchItems).toHaveBeenCalled();
  });

  it('ignores items without a child endpoint', async () => {
    const ctx = setup();
    ctx.endpointRef.value = endpoint('e1', { childId: undefined });
    await ctx.nav.openItem({ id: 'i' } as never);
    expect(ctx.nav.navStack.value).toEqual([]);
    expect(ctx.fetchItems).not.toHaveBeenCalled();
  });

  it('opens table rows with row context', async () => {
    const ctx = setup();
    const table = { childId: 'table-child' };
    ctx.endpointRef.value = endpoint('e1', { table });
    const row = { id: 'r1' };

    await ctx.nav.openTableRow(row as never);
    expect(ctx.nav.navStack.value).toEqual([{ endpointId: 'e1', context: { page: 1 } }]);
    expect(ctx.activeEndpointId.value).toBe('table-child');
    expect(ctx.context.value).toEqual({
      kind: 'row',
      from: { page: 1 },
      row: 'r1',
      endpoint: 'e1',
      table: 'table-child'
    });
    expect(state.rowContext).toHaveBeenCalledWith({ page: 1 }, row, ctx.endpointRef.value, table);
    expect(ctx.resetItems).toHaveBeenCalled();
    expect(ctx.fetchItems).toHaveBeenCalled();
  });

  it('ignores rows without a table child', async () => {
    const ctx = setup();
    ctx.endpointRef.value = endpoint('e1', { table: {} });
    await ctx.nav.openTableRow({ id: 'r' } as never);
    expect(ctx.fetchItems).not.toHaveBeenCalled();
  });
});

describe('going back', () => {
  function withStack() {
    const ctx = setup();
    ctx.nav.navStack.value = [
      { endpointId: 'root', context: { level: 0 } },
      { endpointId: 'one', context: { level: 1 } },
      { endpointId: 'two', context: { level: 2 } }
    ];
    return ctx;
  }

  it('returns to the last previous endpoint', async () => {
    const ctx = withStack();
    await ctx.nav.goBack();
    expect(ctx.activeEndpointId.value).toBe('two');
    expect(ctx.context.value).toEqual({ level: 2 });
    expect(ctx.nav.navStack.value).toEqual([
      { endpointId: 'root', context: { level: 0 } },
      { endpointId: 'one', context: { level: 1 } }
    ]);
    expect(ctx.resetItems).toHaveBeenCalled();
    expect(ctx.fetchItems).toHaveBeenCalled();
  });

  it('returns to roots and arbitrary depths', async () => {
    const ctx = withStack();
    await ctx.nav.goBackTo(0);
    expect(ctx.activeEndpointId.value).toBe('root');
    expect(ctx.context.value).toEqual({ level: 0 });
    expect(ctx.nav.navStack.value).toEqual([]);

    const invalid = withStack();
    await invalid.nav.goBackTo(-1);
    await invalid.nav.goBackTo(5);
    expect(invalid.fetchItems).not.toHaveBeenCalled();
    expect(invalid.nav.navStack.value).toHaveLength(3);
  });

  it('handles an empty stack', async () => {
    const ctx = setup();
    await ctx.nav.goBack();
    expect(ctx.fetchItems).not.toHaveBeenCalled();
  });

  it('falls back to the root id when the depth entry is missing', async () => {
    const ctx = setup();
    ctx.nav.navStack.value = [{ endpointId: 'root', context: { level: 0 } }];
    await ctx.nav.goBackTo(0);
    expect(ctx.activeEndpointId.value).toBe('root');
  });
});

describe('memory helpers', () => {
  it('forgets saved navigation for a source', () => {
    const ctx = setup();
    ctx.nav.navStack.value = [{ endpointId: 'e1', context: 1 }];
    ctx.nav.setActive('s2');
    ctx.nav.forgetSource('s1');
    ctx.nav.setActive('s1');
    expect(ctx.activeEndpointId.value).toBe('e1');
    expect(ctx.nav.navStack.value).toEqual([]);
  });

  it('resets the navigation stack and context', () => {
    const ctx = setup();
    ctx.nav.navStack.value = [{ endpointId: 'x', context: 1 }];
    ctx.context.value = { a: 1 };
    ctx.nav.resetNavigation();
    expect(ctx.nav.navStack.value).toEqual([]);
    expect(ctx.context.value).toBeNull();
  });
});
