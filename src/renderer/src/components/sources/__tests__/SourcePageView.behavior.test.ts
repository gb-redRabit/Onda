import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>();
  return { ...actual, useI18n: () => ({ t: (key: string) => key }) };
});

const CarouselStub = defineComponent({
  name: 'SourceCarousel',
  props: { items: { type: Array }, downloadable: { type: Boolean }, selectable: { type: Boolean } },
  emits: ['activate', 'download', 'select'],
  template: '<div data-testid="carousel" />'
});
const PlayerStub = defineComponent({
  name: 'SourcePlayerView',
  props: { items: { type: Array } },
  emits: ['activate', 'download', 'select'],
  template: '<div data-testid="player" />'
});
const CompactStub = defineComponent({
  name: 'SourceCompact',
  props: { items: { type: Array } },
  emits: ['activate', 'download', 'select'],
  template: '<div data-testid="compact" />'
});
const TileStub = defineComponent({
  name: 'SourceGalleryTile',
  props: { item: { type: Object }, selected: { type: Boolean } },
  emits: ['activate', 'download', 'select'],
  template: '<div data-testid="tile" />'
});

import SourcePageView from '../SourcePageView.vue';

const item = {
  id: 'i1',
  title: 'Episode',
  type: 'video',
  subtitle: 'Sub',
  duration: '12:00',
  thumbnail: 'thumb.jpg',
  mediaUrl: 'https://c/a.mp4',
  playerUrl: 'https://p/a'
};
const rows = [
  { id: 'r1', title: 'Row one', type: 'video', thumbnail: 'r1.jpg' },
  { id: 'r2', title: '', type: 'video', mediaUrl: 'x' }
];

function mountView(over: Record<string, unknown> = {}) {
  return mount(SourcePageView, {
    props: { item: item as never, rows: rows as never, ...over },
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        SourceCarousel: CarouselStub,
        SourcePlayerView: PlayerStub,
        SourceCompact: CompactStub,
        SourceGalleryTile: TileStub
      }
    }
  });
}

describe('SourcePageView', () => {
  it('renders the header and default grid', () => {
    const wrapper = mountView();
    const text = wrapper.text();

    expect(wrapper.get('img').attributes('src')).toBe('thumb.jpg');
    expect(text).toContain('Episode');
    expect(text).toContain('Sub');
    expect(text).toContain('12:00');
    expect(wrapper.findAll('button[title="Row one"]')).toHaveLength(1);
    expect(wrapper.text()).toContain('sources.episodes');
  });

  it('falls back for a missing item', () => {
    const wrapper = mountView({ item: null, rows: [] });

    expect(wrapper.text()).toContain('sources.untitled');
    expect(wrapper.text()).toContain('sources.noTableRows');
  });

  it('shows a download action only for downloadable media', async () => {
    expect(mountView({ downloadable: true }).find('[title="sources.download"]').exists()).toBe(
      true
    );
    expect(
      mountView({ downloadable: true, item: { id: 'x', title: 'X' } })
        .find('[title="sources.download"]')
        .exists()
    ).toBe(false);

    const wrapper = mountView({ downloadable: true });
    await wrapper.get('[title="sources.download"]').trigger('click');
    expect(wrapper.emitted('download')).toEqual([[item]]);
  });

  it('marks a downloaded item and disables its action', () => {
    const wrapper = mountView({ downloadable: true, downloaded: true });
    const button = wrapper.get('[title="sources.downloaded"]');

    expect(button.attributes('disabled')).toBe('');
    expect(button.text()).toContain('sources.downloaded');
  });

  it('emits download-all for rows', async () => {
    const wrapper = mountView({ downloadable: true });

    await wrapper.get('[title="sources.downloadAllRows"]').trigger('click');

    expect(wrapper.emitted('download-all')).toEqual([[rows]]);
  });

  it('switches row views', () => {
    expect(mountView({ viewMode: 'carousel' }).find('[data-testid="carousel"]').exists()).toBe(
      true
    );
    expect(mountView({ viewMode: 'player' }).find('[data-testid="player"]').exists()).toBe(true);
    expect(mountView({ viewMode: 'compact' }).find('[data-testid="compact"]').exists()).toBe(true);
    expect(mountView({ viewMode: 'gallery' }).findAll('[data-testid="tile"]')).toHaveLength(2);
  });

  it('forwards row events from every view', () => {
    for (const [mode, stub] of [
      ['carousel', CarouselStub],
      ['player', PlayerStub],
      ['compact', CompactStub]
    ] as const) {
      const wrapper = mountView({ viewMode: mode });
      const child = wrapper.getComponent(stub);

      child.vm.$emit('activate', rows[0]);
      child.vm.$emit('download', rows[1]);
      child.vm.$emit('select', rows[0], new MouseEvent('click'));

      expect(wrapper.emitted('row-click')).toEqual([[rows[0]]]);
      expect(wrapper.emitted('download')).toEqual([[rows[1]]]);
      expect(wrapper.emitted('select')![0][0]).toBe(rows[0]);
    }
  });

  it('uses index keys for rows without ids', () => {
    const idless = [{ title: 'No id one' }, { title: 'No id two' }];
    const gallery = mountView({ viewMode: 'gallery', rows: idless });

    expect(gallery.findAll('[data-testid="tile"]')).toHaveLength(2);

    const grid = mountView({ rows: idless, item: null });
    expect(grid.findAll('button[title]')).toHaveLength(2);
  });

  it('navigates rows when clickable', async () => {
    const wrapper = mountView({ rowClickable: true });
    const rowButton = wrapper.get('button[title="Row one"]');

    await rowButton.trigger('click');

    expect(wrapper.emitted('row-click')).toEqual([[rows[0]]]);
  });

  it('forwards gallery selection and actions', () => {
    const wrapper = mountView({ viewMode: 'gallery', selectedIds: new Set(['r1']) });
    const tiles = wrapper.findAllComponents(TileStub);

    expect(tiles[0].props('selected')).toBe(true);
    expect(tiles[1].props('selected')).toBe(false);

    tiles[1].vm.$emit('select', rows[1], new MouseEvent('click'));
    tiles[0].vm.$emit('activate', rows[0]);
    tiles[1].vm.$emit('download', rows[1]);

    expect(wrapper.emitted('select')![0][0]).toBe(rows[1]);
    expect(wrapper.emitted('row-click')).toEqual([[rows[0]]]);
    expect(wrapper.emitted('download')).toEqual([[rows[1]]]);
  });

  it('selects rows instead of navigating in selection mode', async () => {
    const wrapper = mountView({ selectable: true, selectedIds: new Set(['r1']) });
    const buttons = wrapper.findAll('button[title]');
    const rowButton = buttons.find((b) => b.attributes('title') === 'Row one')!;

    expect(rowButton.classes()).toContain('border-primary');
    expect(rowButton.find('span.absolute').exists()).toBe(true);

    await rowButton.trigger('click');
    expect(wrapper.emitted('select')![0][0]).toMatchObject(rows[0]);
  });

  it('disables rows when neither clickable nor selectable', () => {
    const wrapper = mountView({ rowClickable: false });

    expect(wrapper.get('button[title="Row one"]').attributes('disabled')).toBe('');
  });

  it('shows a spinner while rows load', () => {
    const wrapper = mountView({ rows: [], rowLoading: true });

    expect(wrapper.find('.animate-spin').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('sources.noTableRows');
  });

  it('shows an empty state without rows', () => {
    const wrapper = mountView({ rows: [] });

    expect(wrapper.text()).toContain('sources.noTableRows');
  });
});
