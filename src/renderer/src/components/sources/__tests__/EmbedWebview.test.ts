import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';

import EmbedWebview from '../EmbedWebview.vue';

const invoke = vi.mocked(window.api.invoke);
let wrapper: VueWrapper | null = null;

function mountEmbed(props: { src: string; title?: string }) {
  wrapper = mount(EmbedWebview, { props, attachTo: document.body });
  return wrapper;
}

function webviews(): HTMLUnknownElement[] {
  return [...document.querySelectorAll('webview')] as HTMLUnknownElement[];
}

beforeEach(() => {
  invoke.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

describe('embed creation', () => {
  it('prepares the preview session and injects a webview', async () => {
    mountEmbed({ src: 'https://player.example/embed/1', title: 'Player' });
    await flushPromises();

    expect(invoke).toHaveBeenCalledWith('preview:prepare');
    const [view] = webviews();
    expect(view).toBeTruthy();
    expect(view.getAttribute('src')).toBe('https://player.example/embed/1');
    expect(view.getAttribute('partition')).toBe('persist:onda-preview');
    expect(view.getAttribute('webpreferences')).toBe(
      'contextIsolation=yes,sandbox=yes,nodeIntegration=no'
    );
    expect(view.getAttribute('title')).toBe('Player');
    expect(view.style.position).toBe('absolute');
    expect(view.style.width).toBe('100%');
    expect(view.style.height).toBe('100%');
    expect(wrapper!.get('[data-testid="embed-webview"]').element.firstElementChild).toBe(view);
  });

  it('omits the title attribute when none is provided', async () => {
    mountEmbed({ src: 'https://player.example/embed/2' });
    await flushPromises();

    expect(webviews()[0].hasAttribute('title')).toBe(false);
  });

  it('still embeds when preparing the session fails', async () => {
    invoke.mockRejectedValue(new Error('ipc down'));

    mountEmbed({ src: 'https://player.example/embed/3' });
    await flushPromises();

    expect(webviews()).toHaveLength(1);
  });

  it('does not create a webview without a source', async () => {
    mountEmbed({ src: '' });
    await flushPromises();

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(webviews()).toHaveLength(0);
  });

  it('prepares the session only once', async () => {
    mountEmbed({ src: 'https://player.example/embed/4' });
    await flushPromises();

    await wrapper!.setProps({ src: 'https://player.example/embed/5' });
    await flushPromises();

    expect(invoke).toHaveBeenCalledTimes(1);
  });
});

describe('source changes', () => {
  it('replaces the webview when the source changes', async () => {
    mountEmbed({ src: 'https://player.example/one' });
    await flushPromises();
    const first = webviews()[0];

    await wrapper!.setProps({ src: 'https://player.example/two' });
    await flushPromises();

    const views = webviews();
    expect(views).toHaveLength(1);
    expect(views[0]).not.toBe(first);
    expect(views[0].getAttribute('src')).toBe('https://player.example/two');
  });

  it('removes the webview on unmount', async () => {
    mountEmbed({ src: 'https://player.example/one' });
    await flushPromises();

    wrapper!.unmount();
    wrapper = null;

    expect(webviews()).toHaveLength(0);
  });
});
