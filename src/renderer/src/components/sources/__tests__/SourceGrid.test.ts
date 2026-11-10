import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';

const h = vi.hoisted(() => ({
  observe: vi.fn(),
  destroy: vi.fn(),
  measure: vi.fn(),
  cols: 2,
  virtualRows: [
    { index: 0, start: 0 },
    { index: 1, start: 260 }
  ],
  totalSize: 520
}));

vi.mock('../../../composables/useVirtualGrid', async () => {
  const { ref } = await import('vue');
  return {
    useVirtualGrid: (_el: unknown, width: () => number) => {
      width();
      return {
        cols: ref(h.cols),
        observe: h.observe,
        destroy: h.destroy
      };
    }
  };
});
vi.mock('../../../composables/useVirtualList', async () => {
  const { ref } = await import('vue');
  return {
    useVirtualList: (options: {
      count: () => number;
      scrollEl: () => unknown;
      estimateSize: () => number;
    }) => {
      options.count();
      options.scrollEl();
      options.estimateSize();
      return ref({
        getVirtualItems: () => h.virtualRows,
        getTotalSize: () => h.totalSize,
        measureElement: h.measure
      });
    }
  };
});

vi.mock('../SourceCard.vue', async () => {
  const { defineComponent } = await import('vue');
  return {
    default: defineComponent({
      name: 'SourceCard',
      props: [
        'item',
        'downloading',
        'downloadable',
        'downloaded',
        'selectable',
        'selected',
        'showType'
      ],
      emits: ['preview', 'activate', 'download', 'select'],
      template: '<button data-testid="card" />'
    })
  };
});
vi.mock('../SourceGalleryTile.vue', async () => {
  const { defineComponent } = await import('vue');
  return {
    default: defineComponent({
      name: 'SourceGalleryTile',
      props: [
        'item',
        'downloading',
        'downloadable',
        'downloaded',
        'selectable',
        'selected',
        'showType'
      ],
      emits: ['preview', 'activate', 'download', 'select'],
      template: '<button data-testid="gallery" />'
    })
  };
});

import SourceCard from '../SourceCard.vue';
import SourceGalleryTile from '../SourceGalleryTile.vue';
import SourceGrid from '../SourceGrid.vue';

let wrapper: VueWrapper | null = null;

function item(id: string, type = 'video') {
  return { id, title: id, type } as never;
}

function setup(props: Record<string, unknown> = {}) {
  wrapper = mount(SourceGrid, {
    props: {
      items: [item('a'), item('b'), item('c')],
      viewMode: 'cards',
      downloadable: true,
      downloadedIds: new Set<string>(),
      downloadingItem: null,
      selectable: true,
      selectedIds: new Set<string>(),
      ...props
    }
  });
  return wrapper;
}

function cards() {
  return wrapper!.findAllComponents(SourceCard);
}

beforeEach(() => {
  h.observe.mockReset();
  h.destroy.mockReset();
  h.measure.mockReset();
  h.cols = 2;
  h.virtualRows = [
    { index: 0, start: 0 },
    { index: 1, start: 260 }
  ];
  h.totalSize = 520;
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('rendering', () => {
  it('slices items into virtual rows and passes flags down', () => {
    const a = item('a');
    const b = item('b');
    const c = item('c');
    setup({
      items: [a, b, c],
      downloadedIds: new Set(['a']),
      selectedIds: new Set(['c']),
      downloadingItem: b
    });

    const rendered = cards();
    expect(rendered).toHaveLength(3);
    expect(rendered[0].props()).toMatchObject({
      downloading: false,
      downloadable: true,
      downloaded: true,
      selectable: true,
      selected: false,
      showType: false
    });
    expect(rendered[1].props('downloading')).toBe(true);
    expect(rendered[2].props()).toMatchObject({ downloaded: false, selected: true });
    expect(wrapper!.get('.relative').attributes('style')).toContain('height: 520px');
    expect(wrapper!.get('[data-index="0"]').attributes('style')).toContain(
      'grid-template-columns: repeat(2, minmax(0, 1fr))'
    );
  });

  it('switches to gallery tiles', () => {
    setup({ viewMode: 'gallery' });

    expect(wrapper!.findAllComponents(SourceGalleryTile)).toHaveLength(3);
    expect(cards()).toHaveLength(0);
  });

  it('shows the type badge only for mixed lists', async () => {
    setup({ items: [item('a', 'image'), item('b', 'image')] });
    expect(cards()[0].props('showType')).toBe(false);

    await wrapper!.setProps({ items: [item('a', 'image'), item('b', 'video')] });
    expect(cards()[0].props('showType')).toBe(true);
  });

  it('measures only element rows', async () => {
    setup();
    await nextTick();

    expect(h.measure).toHaveBeenCalled();
    expect(h.measure.mock.calls[0][0]).toBeInstanceOf(HTMLElement);
  });
});

describe('events', () => {
  it('forwards card events', async () => {
    const source = item('a');
    setup({ items: [source] });
    const card = cards()[0];

    card.vm.$emit('preview', source);
    card.vm.$emit('activate', source);
    card.vm.$emit('download', source);
    const event = new MouseEvent('click');
    card.vm.$emit('select', source, event);

    expect(wrapper!.emitted('preview')).toEqual([[source]]);
    expect(wrapper!.emitted('activate')).toEqual([[source]]);
    expect(wrapper!.emitted('download')).toEqual([[source]]);
    expect(wrapper!.emitted('select')).toEqual([[source, event]]);
  });
});

describe('lifecycle', () => {
  it('observes on mount, content and view changes', async () => {
    setup();
    await nextTick();
    expect(h.observe).toHaveBeenCalledTimes(1);

    await wrapper!.setProps({ items: [item('a'), item('b')] });
    await nextTick();
    expect(h.observe.mock.calls.length).toBeGreaterThan(1);

    const before = h.observe.mock.calls.length;
    await wrapper!.setProps({ viewMode: 'gallery' });
    await nextTick();
    expect(h.observe.mock.calls.length).toBeGreaterThan(before);
  });

  it('skips observing for empty item lists and non-grid modes', async () => {
    setup({ items: [item('a')] });
    await nextTick();
    h.observe.mockClear();

    await wrapper!.setProps({ items: [] });
    await wrapper!.setProps({ viewMode: 'table' });
    await nextTick();

    expect(h.observe).not.toHaveBeenCalled();
  });

  it('destroys the grid on unmount', () => {
    setup();
    wrapper!.unmount();
    wrapper = null;

    expect(h.destroy).toHaveBeenCalledTimes(1);
  });
});
