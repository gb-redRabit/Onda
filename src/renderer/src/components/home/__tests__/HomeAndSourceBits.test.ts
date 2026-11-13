import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';

const CoverStub = defineComponent({
  name: 'MediaCover',
  props: {
    path: { type: String },
    size: { type: Number },
    fallback: { type: String },
    still: { type: Boolean }
  },
  template: '<div data-testid="cover" />'
});

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>();
  return { ...actual, useI18n: () => ({ t: (key: string) => key }) };
});

import HomeWelcomeCard from '../HomeWelcomeCard.vue';
import HomeQuickPicks from '../HomeQuickPicks.vue';
import PassKeyRow from '../../sources/PassKeyRow.vue';
import MusicBrainzPreviewTable from '../../library/MusicBrainzPreviewTable.vue';

function mountWelcome(canShuffle = true) {
  return mount(HomeWelcomeCard, {
    props: { canShuffle },
    global: { mocks: { $t: (key: string) => key } }
  });
}

describe('HomeWelcomeCard', () => {
  it('renders the hero copy and actions', () => {
    const wrapper = mountWelcome();
    const buttons = wrapper.findAll('button');

    expect(wrapper.find('[data-testid="home-welcome"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('home.welcomeHeroTitle');
    expect(wrapper.text()).toContain('home.welcomeHeroText');
    expect(buttons.map((b) => b.text())).toEqual([
      'home.shuffleLibrary',
      'home.openFile',
      'home.openFolder'
    ]);
  });

  it('disables shuffle without tracks', () => {
    expect(mountWelcome(false).findAll('button')[0].attributes('disabled')).toBe('');
    expect(mountWelcome(true).findAll('button')[0].attributes('disabled')).toBeUndefined();
  });

  it('emits every action', async () => {
    const wrapper = mountWelcome();
    const buttons = wrapper.findAll('button');

    await buttons[0].trigger('click');
    await buttons[1].trigger('click');
    await buttons[2].trigger('click');

    expect(wrapper.emitted('shuffle')).toEqual([[]]);
    expect(wrapper.emitted('openFiles')).toEqual([[]]);
    expect(wrapper.emitted('openFolder')).toEqual([[]]);
  });
});

const picks = [
  { title: 'One', subtitle: 'Artist', track: { path: '/a.mp3', type: 'audio' } },
  { title: 'Two', subtitle: 'Channel', track: { path: '/b.mp4', type: 'video' } }
];

function mountPicks(over: Record<string, unknown> = {}) {
  return mount(HomeQuickPicks, {
    props: { items: picks as never, title: 'Recently played', ...over },
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { MediaCover: CoverStub },
      directives: { activate: {} }
    }
  });
}

describe('HomeQuickPicks', () => {
  it('renders a card per pick', () => {
    const wrapper = mountPicks();
    const cards = wrapper.findAll('[aria-label]');

    expect(wrapper.text()).toContain('Recently played');
    expect(cards).toHaveLength(2);
    expect(cards[0].attributes('aria-label')).toBe('common.play: One');
    expect(wrapper.text()).toContain('Artist');
    expect(wrapper.text()).toContain('Two');
  });

  it('shows the see-all action only with a label', async () => {
    expect(mountPicks().findAll('button')).toHaveLength(0);

    const wrapper = mountPicks({ seeAllLabel: 'See all' });
    const button = wrapper.get('button');
    expect(button.text()).toBe('See all');

    await button.trigger('click');
    expect(wrapper.emitted('seeAll')).toEqual([[]]);
  });

  it('plays and emits context menus', async () => {
    const wrapper = mountPicks();
    const cards = wrapper.findAll('[aria-label]');

    await cards[1].trigger('click');
    await cards[0].trigger('contextmenu');

    expect(wrapper.emitted('play')![0][0]).toMatchObject(picks[1].track);
    const context = wrapper.emitted('contextmenu')!;
    expect(context[0][0]).toBeInstanceOf(MouseEvent);
    expect(context[0][1]).toMatchObject(picks[0].track);
  });

  it('uses film covers for video picks', () => {
    const covers = mountPicks().findAllComponents(CoverStub);
    expect(covers[1].props('fallback')).toBe('film');
    expect(covers[0].props('fallback')).toBe('music');
  });
});

function mountPassKey(modelValue = { from: 'a', as: 'b', type: 'string' as const }) {
  return mount(PassKeyRow, {
    props: { modelValue, options: ['id', 'page'], idBase: 'pk0' },
    global: { mocks: { $t: (key: string) => key } }
  });
}

describe('PassKeyRow', () => {
  it('renders the current values and options', () => {
    const wrapper = mountPassKey();
    const inputs = wrapper.findAll('input');

    expect((inputs[0].element as HTMLInputElement).value).toBe('a');
    expect((inputs[1].element as HTMLInputElement).value).toBe('b');
    expect(wrapper.get('select').attributes('value')).toBe('string');
    expect(wrapper.get('datalist').attributes('id')).toBe('pk0-from');
    expect(wrapper.findAll('option').map((o) => o.attributes('value'))).toEqual([
      'id',
      'page',
      'string',
      'number'
    ]);
  });

  it('emits merged updates', async () => {
    const wrapper = mountPassKey();
    const inputs = wrapper.findAll('input');

    await inputs[0].setValue('x');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([
      { from: 'x', as: 'b', type: 'string' }
    ]);

    await inputs[1].setValue('y');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([
      { from: 'a', as: 'y', type: 'string' }
    ]);

    await wrapper.get('select').setValue('number');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([
      { from: 'a', as: 'b', type: 'number' }
    ]);
  });

  it('emits remove', async () => {
    const wrapper = mountPassKey();

    await wrapper.get('[aria-label="common.delete"]').trigger('click');

    expect(wrapper.emitted('remove')).toEqual([[]]);
  });
});

const rows = [
  { key: 'title', label: 'Title', old: 'Old', now: 'New', checked: true },
  { key: 'artist', label: 'Artist', old: 'A', now: 'B', checked: false }
];

function mountPreview(over: Record<string, unknown> = {}) {
  return mount(MusicBrainzPreviewTable, {
    props: {
      rows,
      applyResult: null,
      includeFields: { title: true, artist: false },
      ...over
    },
    global: { mocks: { $t: (key: string) => key } }
  });
}

describe('MusicBrainzPreviewTable', () => {
  it('renders the header and rows', () => {
    const wrapper = mountPreview();

    expect(wrapper.text()).toContain('musicbrainz.previewChanges');
    expect(wrapper.text()).toContain('Title');
    expect(wrapper.text()).toContain('Old');
    expect(wrapper.text()).toContain('New');
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(2);
  });

  it('reflects and updates included fields', async () => {
    const includeFields = { title: true, artist: false };
    const wrapper = mountPreview({ includeFields });
    const boxes = wrapper.findAll('input[type="checkbox"]');

    expect((boxes[0].element as HTMLInputElement).checked).toBe(true);
    expect((boxes[1].element as HTMLInputElement).checked).toBe(false);

    await boxes[1].setValue(true);
    expect(includeFields.artist).toBe(true);
  });

  it('renders apply results with tone classes', () => {
    const applyRows = [
      ...rows,
      { key: 'album', label: 'Album', old: 'A', now: 'B', checked: true }
    ];
    const wrapper = mountPreview({
      rows: applyRows,
      applyResult: { title: true, artist: false, album: 'skipped' }
    });
    const chips = wrapper.findAll('span.text-2xs');

    expect(chips[0].classes()).toContain('text-success');
    expect(chips[1].classes()).toContain('text-error');
    expect(chips[2].classes()).toContain('text-base-content/60');
    expect(wrapper.text()).toContain('skipped');
  });

  it('renders an empty result for a row missing from the results', () => {
    const wrapper = mountPreview({ applyResult: { title: true } });
    const chips = wrapper.findAll('span.text-2xs');

    expect(chips).toHaveLength(2);
    expect(chips[1].text()).toBe('');
  });

  it('hides results without them', () => {
    expect(mountPreview().findAll('span.text-2xs')).toHaveLength(0);
  });
});
