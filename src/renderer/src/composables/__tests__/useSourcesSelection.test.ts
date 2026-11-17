import { describe, expect, it } from 'vitest';
import { computed, ref } from 'vue';
import type { SourceItem } from '@renderer/types/sources';
import { useSourcesSelection } from '../useSourcesSelection';

function item(id: string, overrides: Partial<SourceItem> = {}): SourceItem {
  return { id, name: id, type: 'audio', mediaUrl: 'https://cdn/a.mp3', ...overrides } as SourceItem;
}

function setup(items: SourceItem[]) {
  const pool = ref<(SourceItem | undefined)[]>(items);
  const selection = useSourcesSelection(computed(() => pool.value.filter(Boolean) as SourceItem[]));
  return { pool, selection };
}

describe('useSourcesSelection', () => {
  it('counts only existing, selected and playable items', () => {
    const source = { ...item('a'), id: '' };
    const { selection } = setup([source, item('b'), item('c', { type: 'image' })]);
    selection.toggleSelect({ ...source, id: '' });
    selection.toggleSelect(item('b'));
    selection.toggleSelect(item('c'));

    expect(selection.selectedItems.value).toHaveLength(2);
    expect(selection.selectedCount.value).toBe(2);
    expect(selection.selectedPlayableCount.value).toBe(1);
  });

  it('toggles select mode and clears on exit', () => {
    const { selection } = setup([item('a')]);
    selection.toggleSelect(item('a'));
    selection.toggleSelectMode();
    expect(selection.selectMode.value).toBe(true);

    selection.toggleSelectMode();
    expect(selection.selectMode.value).toBe(false);
    expect(selection.selectedCount.value).toBe(0);
    expect(selection.isSelected('a')).toBe(false);
    expect(selection.isSelected()).toBe(false);
  });

  it('selects ranges with shift and toggles plain clicks', () => {
    const items = [item('a'), item(''), item('b'), item('c')];
    const { selection } = setup(items);

    selection.toggleSelect(items[0]!);
    selection.toggleSelect(items[3]!, { shiftKey: true } as MouseEvent);
    expect([...selection.selectedIds.value]).toEqual(['a', 'b', 'c']);

    selection.toggleSelect(items[2]!);
    expect([...selection.selectedIds.value]).toEqual(['a', 'c']);

    selection.toggleSelect(items[0]!, { shiftKey: true } as MouseEvent);
    expect([...selection.selectedIds.value].sort()).toEqual(['a', 'b', 'c']);
  });

  it('falls back to a plain toggle when a range anchor is missing', () => {
    const items = [item('a'), item('b')];
    const { selection } = setup(items);

    selection.toggleSelect(items[1]!, { shiftKey: true } as MouseEvent);
    expect([...selection.selectedIds.value]).toEqual(['b']);

    selection.toggleSelect(item('ghost'));
    selection.toggleSelect(items[1]!, { shiftKey: true } as MouseEvent);
    expect(selection.selectedIds.value.has('b')).toBe(false);

    selection.toggleSelect(items[0]!);
    selection.toggleSelect(item('outside'), { shiftKey: true } as MouseEvent);
    expect(selection.selectedIds.value.has('outside')).toBe(true);
  });
});
