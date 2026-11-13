import { describe, it, expect } from 'vitest';
import { renderToString } from '@vue/server-renderer';
import { createSSRApp, h } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import SourceCompact from '../SourceCompact.vue';
import type { SourceItem } from '@renderer/types/sources';

const items: SourceItem[] = [
  { id: 'a', title: 'Odcinek 1', subtitle: 'S1', type: 'video', duration: '24:00' },
  { id: 'b', title: '', type: 'audio' }
];

async function render(props: Record<string, unknown>): Promise<string> {
  const i18n = createI18n({
    legacy: false,
    locale: 'en',
    messages: {
      en: {
        sources: { untitled: 'Untitled', download: 'Download', downloaded: 'Downloaded' }
      }
    },
    missingWarn: false,
    fallbackWarn: false
  });
  const app = createSSRApp({ render: () => h(SourceCompact, props as never) });
  app.use(i18n);
  app.directive('activate', {});
  return renderToString(app);
}

describe('SourceCompact', () => {
  it('renders a dense row per item with duration and untitled fallback', async () => {
    const html = await render({ items });
    expect(html).toContain('sources-compact');
    expect(html).toContain('Odcinek 1');
    expect(html).toContain('24:00');
    expect(html).toContain('Untitled');
  });

  it('shows the download button only when downloadable', async () => {
    const withUrl: SourceItem[] = [
      { id: 'a', title: 'A', type: 'video', mediaUrl: 'https://c/a.mp4' }
    ];
    expect(await render({ items: withUrl, downloadable: false })).not.toContain('Download');
    expect(await render({ items: withUrl, downloadable: true })).toContain('Download');
  });

  it('reflects the selection state in select mode', async () => {
    const html = await render({ items, selectable: true, selectedIds: new Set(['a']) });
    expect(html).toContain('ring-primary');
  });
});

const denseItems: SourceItem[] = [
  {
    id: 'a',
    title: 'Episode',
    subtitle: 'S1',
    type: 'video',
    duration: '24:00',
    mediaUrl: 'https://m/a.mp4',
    thumbnail: 'https://img/a.jpg'
  },
  { id: 'b', title: '', type: 'audio' },
  { id: 'c', title: 'Shot', type: 'image' },
  { id: 'd', title: 'File', type: 'file' }
];

function mountCompact(props: Record<string, unknown>) {
  return mount(SourceCompact, {
    props: props as never,
    global: { directives: { activate: {} }, mocks: { $t: (key: string) => key } }
  });
}

describe('SourceCompact rows', () => {
  it('renders thumbnails or type icons with metadata', () => {
    const wrapper = mountCompact({ items: denseItems });

    expect(wrapper.findAll('img')).toHaveLength(1);
    expect(wrapper.findAll('svg').length).toBeGreaterThanOrEqual(3);
    expect(wrapper.text()).toContain('Episode');
    expect(wrapper.text()).toContain('S1');
    expect(wrapper.text()).toContain('24:00');
    expect(wrapper.text()).toContain('sources.untitled');
  });

  it('emits activate from a row when not selecting', async () => {
    const wrapper = mountCompact({ items: denseItems });

    await wrapper.find('.group').trigger('click');

    expect(wrapper.emitted('activate')?.[0]).toMatchObject([{ id: 'a' }]);
  });

  it('keys rows without an id by their index', () => {
    const wrapper = mountCompact({ items: [{ title: 'No id', type: 'image' }] });

    expect(wrapper.findAll('.group')).toHaveLength(1);
  });

  it('shows a download button only with downloadable URLs', () => {
    expect(mountCompact({ items: denseItems, downloadable: false }).findAll('button')).toHaveLength(
      0
    );

    const wrapper = mountCompact({ items: denseItems, downloadable: true });
    const buttons = wrapper.findAll('button');

    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.attributes('title')).toBe('sources.download');
    expect(buttons[0]!.attributes('disabled')).toBeUndefined();
  });

  it('marks downloaded and in-progress rows as disabled', () => {
    const downloaded = mountCompact({
      items: denseItems,
      downloadable: true,
      downloadedIds: new Set(['a'])
    });
    const button = downloaded.find('button');

    expect(button.attributes('disabled')).toBe('');
    expect(button.attributes('title')).toBe('sources.downloaded');
    expect(button.classes()).toContain('bg-success');
    expect(downloaded.html()).toContain('lucide-check');

    const busy = mountCompact({
      items: denseItems,
      downloadable: true,
      downloadingItem: denseItems[0]
    });
    expect(busy.find('button').attributes('disabled')).toBe('');
  });

  it('emits download without activating the row', async () => {
    const wrapper = mountCompact({ items: denseItems, downloadable: true });

    await wrapper.find('button').trigger('click');

    expect(wrapper.emitted('download')?.[0]).toMatchObject([{ id: 'a' }]);
    expect(wrapper.emitted('activate')).toBeUndefined();
  });

  it('highlights selected rows and emits select in select mode', async () => {
    const wrapper = mountCompact({
      items: denseItems,
      selectable: true,
      selectedIds: new Set(['a'])
    });
    const rows = wrapper.findAll('.group');
    const checkboxes = wrapper.findAll('span.w-5.h-5');

    expect(rows[0]!.classes()).toContain('ring-1');
    expect(rows[1]!.classes()).not.toContain('ring-1');
    expect(checkboxes[0]!.classes()).toContain('bg-primary');
    expect(checkboxes[1]!.classes()).toContain('border-base-content/30');

    await rows[0]!.trigger('click');

    const emitted = wrapper.emitted('select')?.[0] as [SourceItem, MouseEvent];
    expect(emitted[0]).toMatchObject({ id: 'a' });
    expect(emitted[1]).toBeInstanceOf(MouseEvent);
  });
});
