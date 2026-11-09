import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick, reactive } from 'vue';

const state = vi.hoisted(() => ({
  router: { push: vi.fn() },
  route: null as any,
  t: vi.fn((key: string) => key),
  online: null as any,
  library: null as any,
  settings: null as any,
  groupLabel: vi.fn((album: string) => `label:${album}`)
}));

vi.mock('vue-router', () => ({
  useRouter: () => state.router,
  useRoute: () => state.route
}));
vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>();
  return { ...actual, useI18n: () => ({ t: state.t }) };
});
vi.mock('@renderer/stores/online', () => ({ useOnlineStore: () => state.online }));
vi.mock('@renderer/stores/library', () => ({ useLibraryStore: () => state.library }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('@renderer/utils/libraryLabels', () => ({ groupLabel: state.groupLabel }));

import Sidebar from '../Sidebar.vue';

const PlaylistsStub = { name: 'SidebarPlaylists', template: '<div data-testid="playlists" />' };
const QueueStub = { name: 'SidebarQueuePreview', template: '<div data-testid="queue-preview" />' };

let wrapper: VueWrapper | null = null;

function setup() {
  wrapper = mount(Sidebar, {
    global: {
      stubs: { SidebarPlaylists: PlaylistsStub, SidebarQueuePreview: QueueStub },
      directives: { activate: {} },
      mocks: { $t: (key: string) => key }
    }
  });
  return wrapper;
}

function buttons() {
  return wrapper!.findAll('button');
}

function buttonByLabel(label: string) {
  return buttons().find((button) => button.attributes('aria-label') === label)!;
}

function asideWidth() {
  return wrapper!.get('aside').attributes('style');
}

beforeEach(() => {
  state.router.push.mockReset();
  state.route = reactive({ path: '/' });
  state.t.mockClear();
  state.online = reactive({ downloads: [] as unknown[] });
  state.library = reactive({ albums: [] as Array<[string, unknown[]]> });
  state.settings = {
    appearance: reactive({
      sidebarCollapsed: false,
      showPlaylists: true,
      showAlbums: true
    }),
    updateAppearance: vi.fn()
  };
  state.groupLabel.mockClear();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('navigation', () => {
  it('renders every destination', () => {
    setup();
    const labels = buttons()
      .map((button) => button.attributes('aria-label'))
      .filter((label) => label?.startsWith('nav.'));
    expect(labels).toEqual([
      'nav.home',
      'nav.library',
      'nav.explorer',
      'nav.online',
      'nav.webcast',
      'nav.sources',
      'nav.downloads',
      'nav.tools',
      'nav.settings',
      'nav.collapse'
    ]);
  });

  it('marks the active route and navigates on click', async () => {
    state.route.path = '/library';
    setup();
    const library = buttonByLabel('nav.library');

    expect(library.attributes('aria-current')).toBe('page');
    expect(library.classes().join(' ')).toContain('bg-primary/14');
    expect(buttonByLabel('nav.home').attributes('aria-current')).toBeUndefined();

    await library.trigger('click');
    expect(state.router.push).toHaveBeenCalledWith('/library');

    await buttonByLabel('nav.settings').trigger('click');
    expect(state.router.push).toHaveBeenLastCalledWith('/settings');
  });

  it('marks settings as current', () => {
    state.route.path = '/settings';
    setup();
    expect(buttonByLabel('nav.settings').attributes('aria-current')).toBe('page');
  });
});

describe('collapsing', () => {
  it('hides labels and sections when collapsed', () => {
    state.settings.appearance.sidebarCollapsed = true;
    setup();

    expect(asideWidth()).toContain('width: 54px');
    expect(wrapper!.text()).not.toContain('nav.home');
    expect(buttonByLabel('nav.home').attributes('title')).toBe('nav.home');
    expect(wrapper!.find('[data-testid="playlists"]').exists()).toBe(false);
    expect(wrapper!.find('[data-testid="queue-preview"]').exists()).toBe(false);
    expect(wrapper!.find('.cursor-col-resize').exists()).toBe(false);
    expect(buttonByLabel('nav.expand').exists()).toBe(true);
  });

  it('persists the collapsed state', async () => {
    setup();
    expect(asideWidth()).toContain('width: 220px');

    await buttonByLabel('nav.collapse').trigger('click');

    expect(state.settings.updateAppearance).toHaveBeenCalledWith({ sidebarCollapsed: true });
    expect(asideWidth()).toContain('width: 54px');
  });

  it('follows external collapsed changes', async () => {
    setup();

    state.settings.appearance.sidebarCollapsed = true;
    await nextTick();

    expect(asideWidth()).toContain('width: 54px');
    expect(buttonByLabel('nav.expand').exists()).toBe(true);
  });

  it('expands again', async () => {
    state.settings.appearance.sidebarCollapsed = true;
    setup();

    await buttonByLabel('nav.expand').trigger('click');

    expect(asideWidth()).toContain('width: 220px');
    expect(state.settings.updateAppearance).toHaveBeenCalledWith({ sidebarCollapsed: false });
  });
});

describe('sections', () => {
  it('shows playlists and the queue when enabled', () => {
    setup();
    expect(wrapper!.find('[data-testid="playlists"]').exists()).toBe(true);
    expect(wrapper!.find('[data-testid="queue-preview"]').exists()).toBe(true);
  });

  it('hides playlists when the setting is off', () => {
    state.settings.appearance.showPlaylists = false;
    setup();
    expect(wrapper!.find('[data-testid="playlists"]').exists()).toBe(false);
  });

  it('lists albums with counts and opens one', async () => {
    state.library.albums.push(['My Album', [{}, {}]]);
    setup();

    const text = wrapper!.text();
    expect(text).toContain('library.albums');
    expect(text).toContain('label:My Album');
    expect(text).toContain('2');
    expect(state.groupLabel).toHaveBeenCalledWith('My Album', expect.any(Function));

    await wrapper!.get('.group').trigger('click');
    expect(state.router.push).toHaveBeenCalledWith('/library?album=My%20Album');
  });

  it('collapses and expands the album list', async () => {
    state.library.albums.push(['My Album', [{}]]);
    setup();
    const header = buttons().find((button) => button.text().includes('library.albums'))!;

    await header.trigger('click');
    expect(wrapper!.find('.group').exists()).toBe(false);

    await header.trigger('click');
    expect(wrapper!.find('.group').exists()).toBe(true);
  });

  it('hides albums when the setting is off or the sidebar is collapsed', () => {
    state.library.albums.push(['My Album', [{}]]);
    state.settings.appearance.showAlbums = false;
    setup();
    expect(wrapper!.text()).not.toContain('library.albums');

    wrapper!.unmount();
    state.settings.appearance.showAlbums = true;
    state.settings.appearance.sidebarCollapsed = true;
    setup();
    expect(wrapper!.text()).not.toContain('library.albums');
  });
});

describe('download blink', () => {
  it('blinks when the queue grows after the baseline', async () => {
    vi.useFakeTimers();
    setup();
    const download = () => buttonByLabel('nav.downloads');

    state.online.downloads.push({ id: 'a' });
    await nextTick();
    expect(download().find('.animate-download-blink').exists()).toBe(false);

    state.online.downloads.push({ id: 'b' });
    await nextTick();
    expect(download().find('.animate-download-blink').exists()).toBe(true);

    vi.advanceTimersByTime(1799);
    await nextTick();
    expect(download().find('.animate-download-blink').exists()).toBe(true);

    vi.advanceTimersByTime(1);
    await nextTick();
    expect(download().find('.animate-download-blink').exists()).toBe(false);
  });

  it('does not blink when the queue shrinks', async () => {
    vi.useFakeTimers();
    setup();
    state.online.downloads.push({ id: 'a' });
    await nextTick();

    state.online.downloads.pop();
    await nextTick();

    expect(buttonByLabel('nav.downloads').find('.animate-download-blink').exists()).toBe(false);
  });
});

describe('resizing', () => {
  it('tracks the pointer and clamps the width', async () => {
    setup();
    const handle = wrapper!.get('.cursor-col-resize');

    await handle.trigger('mousedown', { clientX: 100 });
    expect(handle.classes()).toContain('bg-primary/40');

    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 160 }));
    await nextTick();
    expect(asideWidth()).toContain('width: 280px');

    document.dispatchEvent(new MouseEvent('mousemove', { clientX: -2000 }));
    await nextTick();
    expect(asideWidth()).toContain('width: 160px');

    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 2000 }));
    await nextTick();
    expect(asideWidth()).toContain('width: 400px');

    document.dispatchEvent(new MouseEvent('mouseup'));
    await nextTick();
    expect(wrapper!.get('.cursor-col-resize').classes()).not.toContain('bg-primary/40');

    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 50 }));
    await nextTick();
    expect(asideWidth()).toContain('width: 400px');
  });
});
