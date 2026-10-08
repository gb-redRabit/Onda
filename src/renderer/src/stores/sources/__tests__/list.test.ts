import { describe, it, expect, afterEach, vi } from 'vitest';
import { createSourcesList } from '../list';
import type { MediaSource } from '@renderer/types/sources';

const originalApi = window.api;

afterEach(() => {
  window.api = originalApi;
});

function stub(invoke: ReturnType<typeof vi.fn>): void {
  window.api = { invoke } as unknown as Window['api'];
}

function src(id: string): MediaSource {
  return {
    id,
    name: id,
    baseUrl: 'https://x.example',
    auth: { type: 'none' },
    createdAt: 0,
    endpoints: [{ id: `${id}-e`, name: 'E', method: 'GET', path: '/', mapping: { fields: {} } }]
  };
}

describe('createSourcesList', () => {
  it('loads sources and selects the first one', async () => {
    const invoke = vi.fn().mockResolvedValue([src('a'), src('b')]);
    stub(invoke);
    const list = createSourcesList();
    await list.loadSources();
    expect(invoke).toHaveBeenCalledWith('sources:list');
    expect(list.sources.value.map((s) => s.id)).toEqual(['a', 'b']);
    expect(list.activeSourceId.value).toBe('a');
    expect(list.activeEndpointId.value).toBe('a-e');
  });

  it('reorders optimistically and keeps the server order', async () => {
    const invoke = vi.fn().mockResolvedValue([src('c'), src('a'), src('b')]);
    stub(invoke);
    const list = createSourcesList();
    list.sources.value = [src('a'), src('b'), src('c')];
    await list.reorderSources(['c', 'a', 'b']);
    expect(invoke).toHaveBeenCalledWith('sources:reorder', ['c', 'a', 'b']);
    expect(list.sources.value.map((s) => s.id)).toEqual(['c', 'a', 'b']);
  });

  it('rolls back the order when reorder fails', async () => {
    const invoke = vi.fn().mockRejectedValue(new Error('boom'));
    stub(invoke);
    const list = createSourcesList();
    list.sources.value = [src('a'), src('b'), src('c')];
    await list.reorderSources(['c', 'a', 'b']);
    expect(list.sources.value.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('deletes a source and selects the first when the active one is removed', async () => {
    const invoke = vi.fn().mockResolvedValue([src('b')]);
    stub(invoke);
    const list = createSourcesList();
    list.sources.value = [src('a'), src('b')];
    list.activeSourceId.value = 'a';
    const res = await list.deleteSource('a');
    expect(res).toEqual({ ok: true, wasActive: true });
    expect(list.sources.value.map((s) => s.id)).toEqual(['b']);
    expect(list.activeSourceId.value).toBe('b');
  });
});
