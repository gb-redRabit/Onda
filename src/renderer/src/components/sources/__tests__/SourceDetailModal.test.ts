import { describe, it, expect } from 'vitest';
import { renderToString } from '@vue/server-renderer';
import { createSSRApp, defineComponent, h, type App } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import SourceDetailModal from '../SourceDetailModal.vue';
import type { SourceItem } from '@renderer/types/sources';

const item: SourceItem = {
  id: 'x',
  title: 'Odcinek 1',
  subtitle: 'Sezon 1',
  duration: '24:00',
  type: 'video',
  sourceUrl: 'https://site/watch/x'
};

function i18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    messages: {
      en: {
        common: { close: 'Close' },
        sources: {
          untitled: 'Untitled',
          titleField: 'Title',
          subtitleField: 'Subtitle',
          durationField: 'Duration',
          sourceUrlField: 'Source URL',
          openInBrowser: 'Open in browser',
          openInPreview: 'Open in preview window',
          download: 'Download',
          downloaded: 'Downloaded',
          unmarkDownloaded: 'Unmark as downloaded'
        }
      }
    },
    missingWarn: false,
    fallbackWarn: false
  });
}

// ModalShell teleportuje do <body>, więc treść dialogu trafia do kontekstu SSR.
async function render(props: Record<string, unknown>): Promise<string> {
  const app: App = createSSRApp({ render: () => h(SourceDetailModal, props as never) });
  app.use(i18n());
  const ctx: { teleports?: Record<string, string> } = {};
  const appHtml = await renderToString(app, ctx);
  return (ctx.teleports?.body ?? '') + appHtml;
}

describe('SourceDetailModal', () => {
  it('renders the header, type badge and metadata', async () => {
    const html = await render({ item });
    expect(html).toContain('Odcinek 1');
    expect(html).toContain('video');
    expect(html).toContain('Subtitle');
    expect(html).toContain('Duration');
    expect(html).toContain('24:00');
    expect(html).toContain('Source URL');
  });

  it('renders nothing when there is no item', async () => {
    const html = await render({ item: null });
    expect(html).not.toContain('source-detail-modal-title');
  });

  it('embeds the player when playerUrl is set', async () => {
    const html = await render({
      item: { id: 'p', title: 'Player', type: 'video', playerUrl: 'https://p/embed' }
    });
    expect(html).toContain('data-testid="embed-webview"');
  });

  it('shows the download button only when the level is downloadable and a url exists', async () => {
    const withUrl: SourceItem = { id: 'm', title: 'M', type: 'video', mediaUrl: 'https://m/a.mp4' };
    expect(await render({ item: withUrl, downloadable: false })).not.toContain('>Download<');
    const html = await render({ item: withUrl, downloadable: true });
    expect(html).toContain('Download');
  });

  it('reflects the downloaded state and offers unmark', async () => {
    const withUrl: SourceItem = { id: 'm', title: 'M', type: 'video', mediaUrl: 'https://m/a.mp4' };
    const html = await render({ item: withUrl, downloadable: true, downloaded: true });
    expect(html).toContain('Downloaded');
    expect(html).toContain('Unmark as downloaded');
  });
});

const ModalShellStub = defineComponent({
  name: 'ModalShell',
  props: {
    visible: { type: Boolean, default: false },
    labelledBy: { type: String, default: '' },
    panelClass: { type: String, default: '' }
  },
  emits: ['close', 'escape'],
  template: '<div v-if="visible" data-testid="modal-shell"><slot /></div>'
});

const mountGlobal = {
  mocks: { $t: (key: string) => key },
  stubs: {
    ModalShell: ModalShellStub,
    EmbedWebview: {
      props: ['src', 'title'],
      template: '<div data-testid="embed-webview" />'
    }
  }
};

function mountModal(props: Record<string, unknown>) {
  return mount(SourceDetailModal, { props: props as never, global: mountGlobal });
}

describe('SourceDetailModal actions', () => {
  it('emits close from the header button and ModalShell events', async () => {
    const wrapper = mountModal({ item });
    const shell = wrapper.findComponent(ModalShellStub);

    await wrapper.find('button[aria-label="common.close"]').trigger('click');
    shell.vm.$emit('close');
    shell.vm.$emit('escape');

    expect(wrapper.emitted('close')).toHaveLength(3);
  });

  it('emits play, queue and download for a playable item', async () => {
    const playable = {
      id: 'm',
      title: 'M',
      type: 'video',
      mediaUrl: 'https://cdn/a.mp4'
    } as SourceItem;
    const wrapper = mountModal({ item: playable, downloadable: true });

    await wrapper.find('[data-testid="source-play-now"]').trigger('click');
    await wrapper.find('button[title="sources.addToQueue"]').trigger('click');

    const download = wrapper.findAll('button').find((b) => b.text() === 'sources.download')!;
    await download.trigger('click');

    expect(wrapper.emitted('play')?.[0]).toMatchObject([{ id: 'm' }]);
    expect(wrapper.emitted('queue')?.[0]).toMatchObject([{ id: 'm' }]);
    expect(wrapper.emitted('download')?.[0]).toMatchObject([{ id: 'm' }]);
  });

  it('renders image and audio media', () => {
    const image = mountModal({
      item: { id: 'i', title: 'Shot', type: 'image', mediaUrl: 'https://cdn/a.jpg' }
    });
    expect(image.find('img').attributes('src')).toBe('https://cdn/a.jpg');

    const audio = mountModal({
      item: { id: 'a', title: 'Track', type: 'audio', mediaUrl: 'https://cdn/a.mp3' }
    });
    expect(audio.find('audio').attributes('src')).toBe('https://cdn/a.mp3');
  });

  it('uses the player URL for embeds, download availability and links', async () => {
    const wrapper = mountModal({
      item: { id: 'p', title: 'Player', type: 'audio', playerUrl: 'https://p/embed' },
      downloadable: true
    });

    expect(wrapper.find('[data-testid="embed-webview"]').exists()).toBe(true);
    expect(wrapper.findAll('a').some((a) => a.attributes('href') === 'https://p/embed')).toBe(true);
    const download = wrapper.findAll('button').find((b) => b.text() === 'sources.download')!;
    expect(download.attributes('disabled')).toBeUndefined();
  });

  it('falls back to the media URL in the browser link', () => {
    const wrapper = mountModal({
      item: { id: 'm', title: 'M', type: 'video', mediaUrl: 'https://cdn/a.mp4' }
    });

    expect(wrapper.findAll('a').some((a) => a.attributes('href') === 'https://cdn/a.mp4')).toBe(
      true
    );
  });

  it('handles an empty item with the untitled fallback', () => {
    const wrapper = mountModal({
      item: { id: 'e', type: 'file' } as SourceItem,
      downloadable: true
    });

    expect(wrapper.text()).toContain('sources.untitled');
    expect(wrapper.find('[data-testid="source-play-now"]').exists()).toBe(false);
    expect(wrapper.findAll('a')).toHaveLength(1);
    expect(wrapper.find('a').attributes('href')).toBe('');
    const download = wrapper.findAll('button').find((b) => b.text() === 'sources.download')!;
    expect(download.attributes('disabled')).toBe('');
  });

  it('offers unmark when the item is already downloaded', async () => {
    const wrapper = mountModal({
      item: { id: 'd', title: 'Done', type: 'video', mediaUrl: 'https://cdn/d.mp4' },
      downloadable: true,
      downloaded: true
    });
    const unmark = wrapper.findAll('button').find((b) => b.text() === 'sources.unmarkDownloaded')!;

    await unmark.trigger('click');

    expect(wrapper.emitted('unmark')?.[0]).toMatchObject([{ id: 'd' }]);
  });
});
