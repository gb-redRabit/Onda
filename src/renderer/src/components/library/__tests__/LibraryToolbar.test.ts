import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));

import LibraryToolbar from '../LibraryToolbar.vue';
import type { ChipId } from '@renderer/utils/libraryView';

const InputStub = {
  name: 'Input',
  props: ['modelValue', 'placeholder'],
  emits: ['update:modelValue'],
  template:
    '<input :value="modelValue" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)" />'
};

const chips = [
  { id: 'all' as ChipId, label: 'All' },
  { id: 'liked' as ChipId, label: 'Liked' }
];

let wrapper: VueWrapper | null = null;

function mountToolbar(overrides: Record<string, unknown> = {}) {
  wrapper = mount(LibraryToolbar, {
    props: {
      tab: 'tracks',
      chips,
      query: '',
      sortKey: 'added',
      sortDir: 'asc',
      chip: 'all',
      ...overrides
    },
    global: { stubs: { Input: InputStub } }
  });
  return wrapper;
}

function buttonWithText(text: string) {
  return wrapper!.findAll('button').find((button) => button.text() === text)!;
}

function hasButton(text: string) {
  return wrapper!.findAll('button').some((button) => button.text() === text);
}

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('visibility', () => {
  it('hides every control on the playlists tab', () => {
    mountToolbar({ tab: 'playlists' });

    expect(wrapper!.find('input').exists()).toBe(false);
    expect(wrapper!.find('select').exists()).toBe(false);
  });

  it('shows only search and chips for non-track tabs', () => {
    mountToolbar({ tab: 'artists' });

    expect(wrapper!.find('input').exists()).toBe(true);
    expect(wrapper!.find('select').exists()).toBe(false);
    expect(hasButton('MusicBrainz')).toBe(false);
    expect(hasButton('All')).toBe(false);
  });

  it('shows sorting, chips and MusicBrainz on the tracks tab', () => {
    mountToolbar();

    expect(wrapper!.find('select').exists()).toBe(true);
    expect(hasButton('All')).toBe(true);
    expect(hasButton('MusicBrainz')).toBe(true);
  });
});

describe('search', () => {
  it('uses the overview placeholder and updates the query', async () => {
    mountToolbar({ tab: 'overview' });

    expect(wrapper!.get('input').attributes('placeholder')).toBe('library.searchPlaceholder');

    await wrapper!.get('input').setValue('mix');

    expect(wrapper!.emitted('update:query')).toEqual([['mix']]);
  });

  it('uses the generic placeholder elsewhere', () => {
    mountToolbar({ tab: 'albums' });

    expect(wrapper!.get('input').attributes('placeholder')).toBe('library.search');
  });

  it('clears the query with the inline button', async () => {
    mountToolbar({ query: 'typed' });

    const clear = wrapper!.get('[aria-label="common.close"]');
    await clear.trigger('click');

    expect(wrapper!.emitted('update:query')).toEqual([['']]);
  });
});

describe('sorting', () => {
  it('renders every sort key and forwards changes', async () => {
    mountToolbar();

    const select = wrapper!.get('select');
    expect(select.findAll('option')).toHaveLength(6);
    await select.setValue('artist');

    expect(wrapper!.emitted('update:sortKey')).toEqual([['artist']]);
  });

  it('toggles the sort direction and rotates the icon', async () => {
    mountToolbar({ sortDir: 'asc' });

    const toggle = wrapper!.get('[aria-label="\u2191"]');
    expect(toggle.classes().join(' ')).toContain('bg-base-200/70');
    await toggle.trigger('click');

    expect(wrapper!.emitted('update:sortDir')).toEqual([['desc']]);
  });

  it('reverses from descending', async () => {
    mountToolbar({ sortDir: 'desc' });

    expect(wrapper!.find('[aria-label="\u2193"]').exists()).toBe(true);
    await wrapper!.get('[aria-label="\u2193"]').trigger('click');

    expect(wrapper!.emitted('update:sortDir')).toEqual([['asc']]);
  });
});

describe('chips and actions', () => {
  it('highlights the active chip and selects another', async () => {
    mountToolbar({ chip: 'all' });

    expect(buttonWithText('All').classes()).toContain('bg-primary/18');
    expect(buttonWithText('Liked').classes()).not.toContain('bg-primary/18');

    await buttonWithText('Liked').trigger('click');

    expect(wrapper!.emitted('update:chip')).toEqual([['liked']]);
  });

  it('requests the MusicBrainz lookup', async () => {
    mountToolbar();

    await buttonWithText('MusicBrainz').trigger('click');

    expect(wrapper!.emitted('openMusicbrainz')).toHaveLength(1);
  });
});
