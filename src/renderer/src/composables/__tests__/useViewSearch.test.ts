import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, reactive, ref, type EffectScope } from 'vue';

const mocks = vi.hoisted(() => ({
  ui: null as any
}));

vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => mocks.ui }));

import { useViewSearch } from '../useViewSearch';

const scopes: EffectScope[] = [];

function setup(initial = '') {
  const local = ref(initial);
  const scope = effectScope();
  scopes.push(scope);
  scope.run(() => useViewSearch(local));
  return local;
}

beforeEach(() => {
  mocks.ui = reactive({
    searchMode: 'global' as 'global' | 'view',
    searchQuery: '',
    setSearchQuery: vi.fn((value: string) => {
      mocks.ui.searchQuery = value;
    })
  });
});

afterEach(() => {
  while (scopes.length) scopes.pop()!.stop();
});

describe('external → local', () => {
  it('copies the global query into the view in view mode', async () => {
    const local = setup('old');

    mocks.ui.searchMode = 'view';
    mocks.ui.searchQuery = 'needle';
    await nextTick();

    expect(local.value).toBe('needle');
  });

  it('ignores queries outside view mode', async () => {
    const local = setup('old');

    mocks.ui.searchMode = 'global';
    mocks.ui.searchQuery = 'needle';
    await nextTick();

    expect(local.value).toBe('old');
  });

  it('does not touch the value when it already matches', async () => {
    const local = setup('same');

    mocks.ui.searchMode = 'view';
    mocks.ui.searchQuery = 'same';
    await nextTick();

    expect(local.value).toBe('same');
  });
});

describe('local → external', () => {
  it('publishes local edits in view mode', async () => {
    const local = setup();

    mocks.ui.searchMode = 'view';
    await nextTick();
    local.value = 'typed';
    await nextTick();
    await nextTick();

    expect(mocks.ui.setSearchQuery).toHaveBeenCalledWith('typed');
    expect(mocks.ui.searchQuery).toBe('typed');
  });

  it('ignores local edits outside view mode', async () => {
    const local = setup();

    local.value = 'typed';
    await nextTick();

    expect(mocks.ui.setSearchQuery).not.toHaveBeenCalled();
  });

  it('does not republish the value synchronised from the store', async () => {
    const local = setup();

    mocks.ui.searchMode = 'view';
    mocks.ui.searchQuery = 'from store';
    await nextTick();
    await nextTick();

    expect(local.value).toBe('from store');
    expect(mocks.ui.setSearchQuery).not.toHaveBeenCalled();
  });

  it('skips identical values', async () => {
    const local = setup('same');

    mocks.ui.searchMode = 'view';
    mocks.ui.searchQuery = 'same';
    await nextTick();

    local.value = 'same';
    await nextTick();

    expect(mocks.ui.setSearchQuery).not.toHaveBeenCalled();
  });
});
