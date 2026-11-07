import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';
import AppSearch from '../AppSearch.vue';

const state = vi.hoisted(() => ({
  ui: null as any,
  library: null as any,
  player: null as any,
  plugins: null as any,
  router: null as any,
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('vue-router', () => ({ useRouter: () => state.router }));
vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => state.ui }));
vi.mock('@renderer/stores/library', () => ({ useLibraryStore: () => state.library }));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => state.player }));
vi.mock('@renderer/stores/plugins', () => ({ usePluginsStore: () => state.plugins }));
vi.mock('@renderer/composables/useDialogFocus', () => ({ useDialogFocus: vi.fn() }));

const ResultsStub = {
  props: ['id', 'role', 'groups', 'flatItems', 'activeIndex'],
  emits: ['activate', 'run'],
  template: '<div data-testid="results">{{ flatItems.length }}</div>'
};

let wrapper: VueWrapper | null = null;

function track(overrides: Record<string, unknown> = {}) {
  return {
    id: 't1',
    name: 'Song.mp3',
    path: 'C:\\music\\Song.mp3',
    extension: 'mp3',
    mimeType: 'audio/mpeg',
    size: 1000,
    type: 'audio',
    metadata: { title: 'Song title', artist: 'Artist', album: 'Album' },
    addedAt: 0,
    playCount: 0,
    ...overrides
  } as never;
}

function mountSearch() {
  wrapper = mount(AppSearch, {
    attachTo: document.body,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { AppSearchResults: ResultsStub }
    }
  });
  return wrapper;
}

async function tick(ms = 0): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  await wrapper!.vm.$nextTick();
}

function input() {
  return wrapper!.get('[data-testid="app-search-input"]');
}

async function type(text: string): Promise<void> {
  const el = input().element as HTMLInputElement;
  el.value = text;
  await input().trigger('input');
}

function results() {
  return wrapper!.findComponent(ResultsStub);
}

function labels(): string[] {
  return (results().props('flatItems') as Array<{ label: string }>).map((i) => i.label);
}

beforeEach(() => {
  vi.useFakeTimers();
  state.ui = reactive({
    searchMode: 'global',
    searchQuery: '',
    closeSearch: vi.fn(() => {
      state.ui.searchMode = 'closed';
    }),
    setSearchQuery: vi.fn((q: string) => {
      state.ui.searchQuery = q;
    }),
    openSetupWizard: vi.fn()
  });
  state.library = reactive({
    tracks: [
      track(),
      track({
        id: 't2',
        name: 'Other.mp3',
        path: 'C:\\music\\Other.mp3',
        metadata: { title: 'Other', artist: 'Different', album: 'Elsewhere' }
      })
    ],
    playlists: [
      { name: 'Chill mix', tracks: [track(), track({ id: 't2' })] },
      { name: 'Empty', tracks: [] }
    ]
  });
  state.player = {
    clearQueue: vi.fn(),
    addToQueueMultiple: vi.fn(),
    setTrack: vi.fn(),
    play: vi.fn()
  };
  state.plugins = reactive({
    commands: [
      { id: 'cmd1', label: 'Plugin: reset stats' },
      { id: 'cmd2', label: 'Plugin: export' }
    ],
    dispatchCommand: vi.fn()
  });
  state.router = { push: vi.fn() };
  state.t.mockClear();
  document.body.innerHTML = '';
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('visibility', () => {
  it('renders nothing when search is closed', () => {
    state.ui.searchMode = 'closed';
    mountSearch();
    expect(wrapper!.find('[data-testid="app-search"]').exists()).toBe(false);
  });

  it('renders a global palette with results and focus', async () => {
    state.ui.searchMode = 'closed';
    mountSearch();
    state.ui.searchMode = 'global';
    await tick(40);

    expect(wrapper!.get('[data-testid="app-search"]').attributes('role')).toBe('dialog');
    expect(input().attributes('aria-expanded')).toBe('true');
    expect(input().attributes('aria-activedescendant')).toBe('app-search-item-0');
    expect(results().exists()).toBe(true);
    expect(document.activeElement).toBe(input().element);
  });

  it('renders the compact view search without results', () => {
    state.ui.searchMode = 'view';
    mountSearch();

    expect(input().attributes('aria-expanded')).toBe('false');
    expect(input().attributes('aria-activedescendant')).toBeUndefined();
    expect(input().attributes('placeholder')).toBe('menu.viewSearch');
    expect(results().exists()).toBe(false);
  });
});

describe('groups', () => {
  it('lists tracks, playlists, actions and plugin commands for an empty query', () => {
    mountSearch();
    const groups = results().props('groups') as Array<{ key: string; items: unknown[] }>;
    expect(groups.map((g) => g.key)).toEqual(['tracks', 'playlists', 'views', 'plugins']);
    expect(groups[0].items).toHaveLength(2);
    expect(labels()).toContain('Chill mix');
    expect(labels()).toContain('Plugin: reset stats');
    expect(labels()).toContain('nav.home');
  });

  it('matches tracks by title, artist and album after the debounce', async () => {
    mountSearch();
    await type('different');
    expect(labels()).toContain('Song title');

    await tick(160);
    expect(labels()).toContain('Other');
    expect(labels()).not.toContain('Song title');

    await type('elsewhere');
    await tick(160);
    expect(labels()).toContain('Other');

    await type('song title');
    await tick(160);
    expect(labels()).toContain('Song title');
  });

  it('filters playlists and plugin commands', async () => {
    mountSearch();
    await type('chill');
    await tick(160);

    expect(labels()).toContain('Chill mix');
    expect(labels()).not.toContain('Empty');

    await type('export');
    await tick(160);
    expect(labels()).toContain('Plugin: export');
    expect(labels()).not.toContain('Plugin: reset stats');
  });

  it('uses the command wording only while a query is present', async () => {
    mountSearch();
    let views = (results().props('groups') as Array<{ key: string; label: string }>).find(
      (g) => g.key === 'views'
    );
    expect(views?.label).toBe('cmdPalette.views');

    await type('home');
    await tick(160);
    views = (results().props('groups') as Array<{ key: string; label: string }>).find(
      (g) => g.key === 'views'
    );
    expect(views?.label).toBe('cmdPalette.viewsCommands');
  });

  it('clears a pending debounce on unmount', async () => {
    mountSearch();
    await type('other');
    wrapper!.unmount();
    wrapper = null;
    await vi.advanceTimersByTimeAsync(200);
    expect(state.t).toBeDefined();
  });
});

describe('running items', () => {
  it('plays a selected track', async () => {
    mountSearch();
    const item = (results().props('flatItems') as Array<{ type: string }>).find(
      (i) => i.type === 'track'
    )!;
    results().vm.$emit('run', item);
    await wrapper!.vm.$nextTick();

    expect(state.player.setTrack).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }));
    expect(state.player.play).toHaveBeenCalled();
    expect(state.ui.closeSearch).toHaveBeenCalled();
  });

  it('plays a playlist, queueing the remaining tracks', async () => {
    mountSearch();
    const item = (results().props('flatItems') as Array<{ type: string; label: string }>).find(
      (i) => i.label === 'Chill mix'
    )!;
    results().vm.$emit('run', item);
    await wrapper!.vm.$nextTick();

    expect(state.player.clearQueue).toHaveBeenCalled();
    expect(state.player.addToQueueMultiple).toHaveBeenCalledWith([
      expect.objectContaining({ id: 't2' })
    ]);
    expect(state.player.setTrack).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }));
    expect(state.player.play).toHaveBeenCalled();
    expect(state.ui.closeSearch).toHaveBeenCalled();
  });

  it('does nothing for an empty playlist', async () => {
    state.library.playlists = [{ name: 'Empty', tracks: [] }];
    mountSearch();
    const item = (results().props('flatItems') as Array<{ label: string }>).find(
      (i) => i.label === 'Empty'
    )!;
    results().vm.$emit('run', item);
    await wrapper!.vm.$nextTick();

    expect(state.player.clearQueue).not.toHaveBeenCalled();
    expect(state.player.setTrack).not.toHaveBeenCalled();
    expect(state.ui.closeSearch).toHaveBeenCalled();
  });

  it('navigates and opens the setup wizard from actions', async () => {
    mountSearch();
    const items = results().props('flatItems') as Array<{
      type: string;
      label: string;
      action: () => void;
    }>;

    items.find((i) => i.label === 'nav.library')!.action();
    expect(state.router.push).toHaveBeenCalledWith('/library');

    items.find((i) => i.label === 'wizard.title')!.action();
    expect(state.ui.openSetupWizard).toHaveBeenCalled();
  });

  it('dispatches plugin commands and closes', async () => {
    mountSearch();
    const items = results().props('flatItems') as Array<{
      label: string;
      action: () => void;
    }>;
    items.find((i) => i.label === 'Plugin: reset stats')!.action();

    expect(state.plugins.dispatchCommand).toHaveBeenCalledWith('cmd1');
    expect(state.ui.closeSearch).toHaveBeenCalled();
  });

  it('tracks the active item emitted by the results list', async () => {
    mountSearch();
    results().vm.$emit('activate', 3);
    await wrapper!.vm.$nextTick();
    expect(results().props('activeIndex')).toBe(3);
  });
});

describe('keyboard and clearing', () => {
  it('moves the active item with arrows and clamps at the bounds', async () => {
    mountSearch();
    await tick();

    const total = (results().props('flatItems') as unknown[]).length;
    const down = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true });
    const prevent = vi.spyOn(down, 'preventDefault');
    document.dispatchEvent(down);
    await wrapper!.vm.$nextTick();
    expect(prevent).toHaveBeenCalled();
    expect(results().props('activeIndex')).toBe(1);

    for (let i = 0; i < total + 2; i += 1) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    }
    await wrapper!.vm.$nextTick();
    expect(results().props('activeIndex')).toBe(total - 1);

    for (let i = 0; i < total + 2; i += 1) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    }
    await wrapper!.vm.$nextTick();
    expect(results().props('activeIndex')).toBe(0);
  });

  it('runs the active action on Enter and ignores track items', async () => {
    state.library.tracks = [];
    state.library.playlists = [];
    state.plugins.commands = [];
    mountSearch();
    await type('settings');
    await tick(160);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await wrapper!.vm.$nextTick();
    expect(state.router.push).toHaveBeenCalledWith('/settings');
    expect(state.ui.closeSearch).toHaveBeenCalled();

    state.router.push.mockClear();
    state.ui.closeSearch.mockClear();
    state.ui.searchMode = 'global';
    state.library.tracks = [track()];
    state.library.playlists = [];
    state.plugins.commands = [];
    await tick(160);
    await type('');
    await tick(160);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await wrapper!.vm.$nextTick();
    expect(state.player.setTrack).not.toHaveBeenCalled();
  });

  it('closes on Escape', async () => {
    mountSearch();
    await tick();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(state.ui.closeSearch).toHaveBeenCalledTimes(1);
  });

  it('closes when the backdrop is clicked', async () => {
    mountSearch();
    await tick();

    await wrapper!.get('[data-testid="app-search"]').trigger('click');
    expect(state.ui.closeSearch).toHaveBeenCalledTimes(1);
  });

  it('ignores keys while closed', async () => {
    state.ui.searchMode = 'closed';
    mountSearch();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(state.ui.closeSearch).not.toHaveBeenCalled();
  });

  it('clears the query and refocuses the input', async () => {
    state.ui.searchQuery = 'abc';
    mountSearch();
    await tick();

    await wrapper!.get('[aria-label="common.clear"]').trigger('click');
    await tick(0);
    expect(state.ui.setSearchQuery).toHaveBeenCalledWith('');
    expect(results().props('activeIndex')).toBe(0);
    expect(document.activeElement).toBe(input().element);
  });

  it('refocuses and resets the active item when the mode opens', async () => {
    state.ui.searchMode = 'closed';
    mountSearch();

    state.ui.searchMode = 'global';
    await tick(40);
    expect(results().props('activeIndex')).toBe(0);
    expect(document.activeElement).toBe(input().element);
  });
});
