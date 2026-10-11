import { describe, expect, it } from 'vitest';
import { filterAndSortSourceItems, moveItem, parseQueryLines } from '../sourcesView';
import type { SourceItem } from '@renderer/types/sources';

function item(title: string, type: SourceItem['type'], subtitle = ''): SourceItem {
  return { id: title, title, type, subtitle } as SourceItem;
}

describe('moveItem', () => {
  it('moves an item to a new index', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('returns the same array reference for invalid/no-op moves', () => {
    const list = ['a', 'b'];
    expect(moveItem(list, 1, 1)).toBe(list);
    expect(moveItem(list, -1, 0)).toBe(list);
    expect(moveItem(list, 0, 5)).toBe(list);
  });

  it('does not mutate the input', () => {
    const list = ['a', 'b', 'c'];
    moveItem(list, 0, 2);
    expect(list).toEqual(['a', 'b', 'c']);
  });
});

describe('filterAndSortSourceItems', () => {
  const items = [item('Ant', 'audio', 'solo'), item('Banana', 'video'), item('Cherry', 'image')];

  it('filters by title or subtitle, case-insensitively', () => {
    expect(filterAndSortSourceItems(items, 'ant', 'none').map((i) => i.title)).toEqual(['Ant']);
    expect(filterAndSortSourceItems(items, 'SOLO', 'none').map((i) => i.title)).toEqual(['Ant']);
  });

  it('returns the same array when there is nothing to do', () => {
    expect(filterAndSortSourceItems(items, '', 'none')).toBe(items);
  });

  it('sorts by title asc/desc and by type', () => {
    expect(filterAndSortSourceItems(items, '', 'titleAsc').map((i) => i.title)).toEqual([
      'Ant',
      'Banana',
      'Cherry'
    ]);
    expect(filterAndSortSourceItems(items, '', 'titleDesc').map((i) => i.title)).toEqual([
      'Cherry',
      'Banana',
      'Ant'
    ]);
    expect(filterAndSortSourceItems(items, '', 'type').map((i) => i.type)).toEqual([
      'audio',
      'image',
      'video'
    ]);
  });

  it('does not mutate the input when sorting', () => {
    const original = [...items];
    filterAndSortSourceItems(items, '', 'titleDesc');
    expect(items).toEqual(original);
  });
});

describe('parseQueryLines', () => {
  it('parses key=value lines, trims, and ignores blanks/invalid lines', () => {
    expect(parseQueryLines('a=1\n\n b = 2 \ninvalid\n=x')).toEqual({ a: '1', b: '2' });
  });
});
