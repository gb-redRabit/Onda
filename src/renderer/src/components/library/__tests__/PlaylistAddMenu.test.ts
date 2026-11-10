import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, reactive } from 'vue';

const state = vi.hoisted(() => ({
  library: null as any
}));

vi.mock('@renderer/stores/library', () => ({ useLibraryStore: () => state.library }));

import PlaylistAddMenu from '../PlaylistAddMenu.vue';

const TeleportStub = defineComponent({
  name: 'TeleportStub',
  template: '<div><slot /></div>'
});

let wrapper: VueWrapper | null = null;

function track(path: string) {
  return { path, name: path } as never;
}

function setup(props: Record<string, unknown> = {}) {
  wrapper = mount(PlaylistAddMenu, {
    props: {
      tracks: [track('D:/a.mp3')],
      ...props
    },
    global: {
      stubs: { teleport: TeleportStub },
      mocks: { $t: (key: string) => key }
    }
  });
  return wrapper;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function trigger() {
  return wrapper!.findAll('button')[0];
}

function popup() {
  return wrapper!.find('.playlist-popup');
}

beforeEach(() => {
  state.library = reactive({
    playlists: [
      { id: 'p1', name: 'Mix', tracks: [track('D:/a.mp3'), track('D:/b.mp3')] },
      { id: 'p2', name: 'Empty', tracks: [] }
    ],
    addToPlaylist: vi.fn(),
    removeFromPlaylist: vi.fn()
  });
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('opening', () => {
  it('renders the trigger with an accessible label', () => {
    setup();

    expect(trigger().attributes('aria-label')).toBe('common.addToPlaylist');
    expect(trigger().attributes('title')).toBe('common.addToPlaylist');
    expect(popup().exists()).toBe(false);
  });

  it('opens and closes the popup', async () => {
    setup();
    await trigger().trigger('click');
    expect(popup().exists()).toBe(true);

    await trigger().trigger('click');
    expect(popup().exists()).toBe(false);
  });

  it('stops the trigger click from bubbling', async () => {
    setup();
    const stop = vi.spyOn(Event.prototype, 'stopPropagation');

    await trigger().trigger('click');
    expect(stop).toHaveBeenCalled();
  });

  it('lists playlists with toggle markers', async () => {
    setup();
    await trigger().trigger('click');

    const buttons = popup().findAll('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].text()).toContain('✓ Mix');
    expect(buttons[1].text()).toContain('+ Empty');
    expect(buttons[0].classes()).toContain('text-primary-text');
    expect(buttons[1].classes()).not.toContain('text-primary-text');
  });

  it('shows the empty message', async () => {
    state.library.playlists = [];
    setup();
    await trigger().trigger('click');

    expect(popup().text()).toContain('common.noPlaylists');
  });

  it('omits markers in add mode', async () => {
    setup({ mode: 'add' });
    await trigger().trigger('click');

    const buttons = popup().findAll('button');
    expect(buttons[0].text()).toContain('Mix');
    expect(buttons[0].text()).not.toContain('✓');
    expect(buttons[0].classes()).not.toContain('text-primary-text');
  });
});

describe('positioning', () => {
  it('positions the popup inside the viewport', async () => {
    setup();
    const el = wrapper!.get('.relative').element as HTMLElement;
    el.getBoundingClientRect = () => ({ right: 1200, bottom: 700 }) as DOMRect;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });

    await trigger().trigger('click');

    expect(popup().attributes('style')).toContain('left: 824px');
    expect(popup().attributes('style')).toContain('top: 560px');
  });

  it('clamps to the left and top edges', async () => {
    setup();
    const el = wrapper!.get('.relative').element as HTMLElement;
    el.getBoundingClientRect = () => ({ right: 10, bottom: 10 }) as DOMRect;

    await trigger().trigger('click');

    expect(popup().attributes('style')).toContain('left: 8px');
    expect(popup().attributes('style')).toContain('top: 16px');
  });
});

describe('picking playlists', () => {
  it('toggles membership for each track', async () => {
    setup({
      tracks: [track('D:/a.mp3'), track('D:/c.mp3')]
    });
    await trigger().trigger('click');

    await popup().findAll('button')[0].trigger('click');

    expect(state.library.removeFromPlaylist).toHaveBeenCalledWith('p1', 'D:/a.mp3');
    expect(state.library.addToPlaylist).toHaveBeenCalledWith('p1', track('D:/c.mp3'));
    expect(popup().exists()).toBe(false);
  });

  it('adds every track in add mode', async () => {
    setup({ mode: 'add', tracks: [track('D:/a.mp3'), track('D:/b.mp3')] });
    await trigger().trigger('click');

    await popup().findAll('button')[1].trigger('click');

    expect(state.library.addToPlaylist.mock.calls).toEqual([
      ['p2', track('D:/a.mp3')],
      ['p2', track('D:/b.mp3')]
    ]);
    expect(state.library.removeFromPlaylist).not.toHaveBeenCalled();
  });
});

describe('outside clicks', () => {
  it('closes when clicking outside the trigger and popup', async () => {
    setup();
    await trigger().trigger('click');
    expect(popup().exists()).toBe(true);

    document.body.click();
    await flush();

    expect(popup().exists()).toBe(false);
  });

  it('ignores clicks inside the popup or trigger', async () => {
    setup();
    await trigger().trigger('click');

    (popup().element as HTMLElement).click();
    await flush();
    expect(popup().exists()).toBe(true);

    trigger().element.click();
    await flush();
  });
});
