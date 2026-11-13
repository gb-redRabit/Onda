import { beforeEach, describe, it, expect, vi } from 'vitest';
import { renderToString } from '@vue/server-renderer';
import { createSSRApp, h } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import SourceCarousel from '../SourceCarousel.vue';
import type { SourceItem } from '@renderer/types/sources';

const virtualState = vi.hoisted(() => ({ extraRows: 0 }));

vi.mock('@renderer/composables/useVirtualList', async () => {
  const { ref } = await import('vue');
  return {
    useVirtualList: (opts: {
      count: () => number;
      scrollEl: () => unknown;
      estimateSize: () => number;
    }) => {
      opts.scrollEl();
      opts.estimateSize();
      return ref({
        getVirtualItems: () =>
          Array.from({ length: opts.count() + virtualState.extraRows }, (_, index) => ({
            index,
            start: index * 236
          })),
        getTotalSize: () => opts.count() * 236
      });
    }
  };
});

beforeEach(() => {
  virtualState.extraRows = 0;
});

const items: SourceItem[] = [
  { id: 'a', title: 'Alpha', type: 'video', playerUrl: 'https://p/a' },
  { id: 'b', title: 'Beta', type: 'image', thumbnail: 'https://img/b.jpg' }
];

async function render(props: Record<string, unknown>): Promise<string> {
  const i18n = createI18n({
    legacy: false,
    locale: 'en',
    messages: {
      en: { sources: { download: 'Download', downloaded: 'Downloaded', untitled: 'Untitled' } }
    },
    missingWarn: false,
    fallbackWarn: false
  });
  const app = createSSRApp({ render: () => h(SourceCarousel, props as never) });
  app.use(i18n);
  app.directive('activate', {});
  return renderToString(app);
}

// Zawartość karuzeli jest wirtualizowana poziomo, więc SSR (bez layoutu/scrolla)
// renderuje tylko kontener — kafelki montują się po stronie klienta.
describe('SourceCarousel', () => {
  it('renders the horizontal scroll container', async () => {
    const html = await render({ items });
    expect(html).toContain('data-testid="sources-carousel"');
  });

  it('renders the empty container without items or playable marks', async () => {
    const html = await render({ items: [] });
    expect(html).toContain('data-testid="sources-carousel"');
    expect(html).not.toContain('source-playable');
  });
});

const alpha: SourceItem = {
  id: 'a',
  title: 'Alpha',
  type: 'video',
  playerUrl: 'https://p/a',
  duration: '1:00',
  subtitle: 'S1'
};
const beta: SourceItem = {
  id: 'b',
  title: 'Beta',
  type: 'image',
  thumbnail: 'https://img/b.jpg',
  mediaUrl: 'https://m/b.jpg'
};
const untitled: SourceItem = { id: 'c', title: '', type: 'audio' };
const doc: SourceItem = { id: 'd', title: 'Doc', type: 'file', mediaUrl: 'https://m/d' };
const plain: SourceItem = { id: 'e', title: 'Plain', type: 'video' };

function mountCarousel(props: Record<string, unknown>) {
  return mount(SourceCarousel, {
    props: props as never,
    global: { directives: { activate: {} }, mocks: { $t: (key: string) => key } }
  });
}

describe('SourceCarousel cards', () => {
  it('renders thumbnails, icons, metadata and playable marks', () => {
    const wrapper = mountCarousel({ items: [alpha, beta, untitled] });
    const text = wrapper.text();

    expect(wrapper.findAll('img')).toHaveLength(1);
    expect(text).toContain('Alpha');
    expect(text).toContain('S1');
    expect(text).toContain('1:00');
    expect(text).toContain('sources.untitled');
    expect(wrapper.findAll('[data-testid="source-playable"]')).toHaveLength(1);
  });

  it('filters virtual rows that point past the item list', () => {
    virtualState.extraRows = 1;

    const wrapper = mountCarousel({ items: [alpha] });

    expect(wrapper.findAll('[data-index]')).toHaveLength(1);
    expect(wrapper.findAll('[data-index] .group')).toHaveLength(1);
  });

  it('keys cards without an id by their index', () => {
    const wrapper = mountCarousel({ items: [{ title: 'No id', type: 'image' }] });

    expect(wrapper.findAll('[data-index]')).toHaveLength(1);
    expect(wrapper.find('img').exists()).toBe(false);
  });

  it('emits activate from a card click when not selecting', async () => {
    const wrapper = mountCarousel({ items: [alpha] });

    await wrapper.find('[data-index] .group').trigger('click');

    expect(wrapper.emitted('activate')?.[0]).toMatchObject([{ id: 'a' }]);
  });

  it('offers download buttons only for downloadable items with a URL', () => {
    const wrapper = mountCarousel({
      items: [alpha, beta, untitled, doc, plain],
      downloadable: true,
      downloadedIds: new Set(['b']),
      downloadingItem: doc
    });
    const buttons = wrapper.findAll('button');

    expect(buttons).toHaveLength(3);
    const alphaButton = buttons.find((b) => b.attributes('title') === 'sources.download')!;
    const betaButton = buttons.find((b) => b.attributes('title') === 'sources.downloaded')!;
    const docButton = buttons.at(-1)!;

    expect(alphaButton.attributes('disabled')).toBeUndefined();
    expect(betaButton.attributes('disabled')).toBe('');
    expect(docButton.attributes('disabled')).toBe('');
  });

  it('emits download without activating the card', async () => {
    const wrapper = mountCarousel({ items: [alpha], downloadable: true });
    const button = wrapper.find('button');

    await button.trigger('click');

    expect(wrapper.emitted('download')?.[0]).toMatchObject([{ id: 'a' }]);
    expect(wrapper.emitted('activate')).toBeUndefined();
  });

  it('selects cards and highlights the selected checkbox in select mode', async () => {
    const wrapper = mountCarousel({
      items: [alpha, beta],
      selectable: true,
      selectedIds: new Set(['a'])
    });
    const cards = wrapper.findAll('[data-index] .group');
    const checkboxes = wrapper.findAll('span.w-5.h-5');

    expect(cards[0]!.classes()).toContain('border-primary');
    expect(cards[1]!.classes()).toContain('hover:border-primary/50');
    expect(checkboxes[0]!.classes()).toContain('bg-primary');
    expect(checkboxes[1]!.classes()).toContain('text-transparent');

    await cards[0]!.trigger('click');

    const emitted = wrapper.emitted('select')?.[0] as [SourceItem, MouseEvent];
    expect(emitted[0]).toMatchObject({ id: 'a' });
    expect(emitted[1]).toBeInstanceOf(MouseEvent);
  });
});
