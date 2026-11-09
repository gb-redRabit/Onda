import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';

const state = vi.hoisted(() => ({
  home: null as any,
  prompt: null as any,
  sections: new Set<string>(),
  playTrackList: vi.fn(),
  groupLabel: vi.fn((name: string) => `label:${name}`)
}));

vi.mock('@renderer/composables/useHomeView', () => ({ useHomeView: () => state.home }));
vi.mock('@renderer/composables/usePromptDialog', () => ({ usePromptDialog: () => state.prompt }));
vi.mock('@renderer/utils/playTracks', () => ({ playTrackList: state.playTrackList }));
vi.mock('@renderer/utils/libraryLabels', () => ({ groupLabel: state.groupLabel }));

const PageHeaderStub = defineComponent({
  name: 'PageHeaderStub',
  props: { title: String, subtitle: String, icon: Object, sticky: Boolean },
  template:
    '<header data-testid="page-header"><span>{{ title }}</span><slot name="actions" /></header>'
});
const ShelfStub = defineComponent({
  name: 'HomeShelfStub',
  props: { title: String, icon: Object, itemCount: Number, seeAllLabel: String },
  emits: ['see-all'],
  template: `<section data-testid="shelf" :data-title="title" :data-count="itemCount">
    <button data-testid="shelf-see-all" @click="$emit('see-all')" />
    <slot />
  </section>`
});
const MediaCardStub = defineComponent({
  name: 'HomeMediaCardStub',
  props: {
    title: String,
    subtitle: String,
    coverPath: String,
    coverSize: Number,
    badge: String,
    fallback: String,
    stacked: Boolean,
    openLabel: String,
    round: Boolean
  },
  emits: ['play', 'open', 'contextmenu'],
  template: `<div data-testid="media-card" :data-title="title">
    <button data-testid="card-play" @click="$emit('play')" />
    <button data-testid="card-open" @click="$emit('open')" />
  </div>`
});
const ContinueCardStub = defineComponent({
  name: 'HomeContinueCardStub',
  props: { track: Object, position: Number },
  emits: ['play', 'play-from-start'],
  template: `<div data-testid="continue-card">
    <button data-testid="continue-play" @click="$emit('play')" />
    <button data-testid="continue-start" @click="$emit('play-from-start')" />
  </div>`
});
const WelcomeCardStub = defineComponent({
  name: 'HomeWelcomeCardStub',
  props: { canShuffle: Boolean },
  emits: ['shuffle', 'open-files', 'open-folder'],
  template: `<div data-testid="welcome-card" :data-shuffle="canShuffle">
    <button data-testid="welcome-shuffle" @click="$emit('shuffle')" />
    <button data-testid="welcome-files" @click="$emit('open-files')" />
    <button data-testid="welcome-folder" @click="$emit('open-folder')" />
  </div>`
});
const StatsStub = defineComponent({
  name: 'HomeStatsPanelStub',
  props: { items: Array, loading: Boolean },
  emits: ['open'],
  template: '<button data-testid="stats" :data-loading="loading" @click="$emit(\'open\')" />'
});
const QuickPicksStub = defineComponent({
  name: 'HomeQuickPicksStub',
  props: { items: Array, title: String, seeAllLabel: String },
  emits: ['see-all', 'play', 'contextmenu'],
  template: `<div data-testid="quick-picks">
    <button data-testid="quick-see-all" @click="$emit('see-all')" />
    <button data-testid="quick-play" @click="$emit('play', items[0])" />
    <button data-testid="quick-menu" @click="$emit('contextmenu', {})" />
  </div>`
});
const EmptyStub = defineComponent({
  name: 'EmptyStateStub',
  props: { title: String, description: String, icon: Object, compact: Boolean },
  template: '<div data-testid="empty-state">{{ title }}</div>'
});
const PromptStub = defineComponent({
  name: 'ExplorerPromptDialogStub',
  props: { visible: Boolean, isConfirm: Boolean, message: String, value: String },
  emits: ['confirm', 'cancel'],
  template: `<div data-testid="prompt" :data-visible="visible" :data-message="message">
    <button data-testid="prompt-confirm" @click="$emit('confirm')" />
    <button data-testid="prompt-cancel" @click="$emit('cancel')" />
  </div>`
});

import HomeView from '../HomeView.vue';

const stubs = {
  PageHeader: PageHeaderStub,
  HomeShelf: ShelfStub,
  HomeMediaCard: MediaCardStub,
  HomeContinueCard: ContinueCardStub,
  HomeWelcomeCard: WelcomeCardStub,
  HomeStatsPanel: StatsStub,
  HomeQuickPicks: QuickPicksStub,
  EmptyState: EmptyStub,
  ExplorerPromptDialog: PromptStub
};

let wrapper: VueWrapper | null = null;

function track(name: string, meta: Record<string, unknown> = {}) {
  return { id: name, name, path: `D:/music/${name}.mp3`, metadata: meta } as never;
}

function setup() {
  wrapper = mount(HomeView, {
    global: { stubs, mocks: { $t: (key: string) => key } }
  });
  return wrapper;
}

function shelf(title: string) {
  return wrapper!.findAllComponents(ShelfStub).find((s) => s.props('title') === title)!;
}

beforeEach(() => {
  state.sections = new Set();
  state.playTrackList.mockReset();
  state.groupLabel.mockClear();

  const continueTrack = ref<any>(track('resume', { title: 'Resume Song' }));
  const continuePosition = ref(42);
  const playContinue = vi.fn();
  const playContinueFromStart = vi.fn();
  const setTrack = vi.fn();
  const openLibrary = vi.fn();
  const showHomeMenu = vi.fn();
  const showRecentMenu = vi.fn();
  const showConfirm = vi.fn(async () => true);

  state.home = {
    t: (key: string) => key,
    player: { setTrack, currentTime: 0 },
    library: { totalCount: 12, isLoading: false, isLoaded: true },
    homeContextMenu: { showHomeMenu, showRecentMenu },
    has: (section: string) => state.sections.has(section),
    actions: [
      { id: 'add', labelKey: 'home.action.add', icon: {}, route: vi.fn() },
      { id: 'folder', labelKey: 'home.action.folder', icon: {}, route: vi.fn() }
    ],
    counters: [{ id: 'tracks', value: 12 }],
    openLibrary,
    openFile: vi.fn(),
    openFolder: vi.fn(),
    playRandom: vi.fn(),
    quickPicks: ref([track('quick')]),
    mostPlayed: ref([track('top', { title: 'Top Song' })]),
    favoriteTracks: ref([track('fav', { title: 'Fav Song' })]),
    playlists: ref([
      {
        id: 'pl1',
        name: 'Playlist',
        coverUrl: 'https://cover',
        tracks: [track('pl-a'), track('pl-b')]
      }
    ]),
    albums: ref([['Album', [track('al-a'), track('al-b')]]]),
    artists: ref([['Artist', [track('ar-a')]]]),
    trackTitle: (item: any) => item?.metadata?.title || item?.name,
    trackSubtitle: (item: any) => `sub:${item.name}`,
    trackCountLabel: (count: number) => `${count} tracks`,
    playCountBadge: (count: number) => `${count} plays`,
    continueTrack,
    continuePosition,
    playContinue,
    playContinueFromStart
  };

  state.prompt = {
    promptVisible: ref(false),
    promptIsConfirm: ref(false),
    promptMessage: ref(''),
    promptValue: ref(''),
    showConfirm,
    promptConfirm: vi.fn(),
    promptCancel: vi.fn()
  };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.restoreAllMocks();
});

describe('header', () => {
  it('renders the title and action buttons', async () => {
    setup();

    expect(wrapper!.get('[data-testid="page-header"]').text()).toContain('home.welcome');
    const action = wrapper!.get('[data-testid="home-action-add"]');
    expect(action.attributes('aria-label')).toBe('home.action.add');
    expect(action.attributes('title')).toBe('home.action.add');

    await action.trigger('click');
    expect(state.home.actions[0].route).toHaveBeenCalledTimes(1);
  });

  it('opens the home context menu from the root', () => {
    setup();
    const event = new MouseEvent('contextmenu');
    wrapper!.get('[data-testid="home-view"]').element.dispatchEvent(event);

    expect(state.home.homeContextMenu.showHomeMenu).toHaveBeenCalledWith(event);
  });
});

describe('hero', () => {
  it('shows the continue card when a track is available', () => {
    state.sections.add('continue');
    setup();

    expect(wrapper!.find('[data-testid="continue-card"]').exists()).toBe(true);
    expect(wrapper!.find('[data-testid="welcome-card"]').exists()).toBe(false);
    expect(wrapper!.getComponent(ContinueCardStub).props()).toMatchObject({
      position: 42
    });
  });

  it('falls back to the welcome card', async () => {
    setup();
    expect(wrapper!.find('[data-testid="welcome-card"]').exists()).toBe(true);
    expect(wrapper!.get('[data-testid="welcome-card"]').attributes('data-shuffle')).toBe('true');

    await wrapper!.get('[data-testid="welcome-shuffle"]').trigger('click');
    await wrapper!.get('[data-testid="welcome-files"]').trigger('click');
    await wrapper!.get('[data-testid="welcome-folder"]').trigger('click');

    expect(state.home.playRandom).toHaveBeenCalledTimes(1);
    expect(state.home.openFile).toHaveBeenCalledTimes(1);
    expect(state.home.openFolder).toHaveBeenCalledTimes(1);
  });

  it('disables shuffle for an empty library', () => {
    state.home.library.totalCount = 0;
    setup();
    expect(wrapper!.get('[data-testid="welcome-card"]').attributes('data-shuffle')).toBe('false');
  });

  it('forwards the continue actions', async () => {
    state.sections.add('continue');
    setup();

    await wrapper!.get('[data-testid="continue-play"]').trigger('click');
    await wrapper!.get('[data-testid="continue-start"]').trigger('click');

    expect(state.home.playContinue).toHaveBeenCalledTimes(1);
    expect(state.home.playContinueFromStart).toHaveBeenCalledTimes(1);
  });

  it('passes counters and loading state to the stats panel', async () => {
    state.home.library.isLoaded = false;
    setup();

    const stats = wrapper!.get('[data-testid="stats"]');
    expect(stats.attributes('data-loading')).toBe('true');

    await stats.trigger('click');
    expect(state.home.openLibrary).toHaveBeenCalledTimes(1);
  });
});

describe('quick picks', () => {
  it('renders and forwards events', async () => {
    state.sections.add('recent');
    setup();

    expect(wrapper!.find('[data-testid="quick-picks"]').exists()).toBe(true);
    await wrapper!.get('[data-testid="quick-see-all"]').trigger('click');
    await wrapper!.get('[data-testid="quick-play"]').trigger('click');
    await wrapper!.get('[data-testid="quick-menu"]').trigger('click');

    expect(state.home.openLibrary).toHaveBeenCalledWith('tracks');
    expect(state.home.player.setTrack).toHaveBeenCalledTimes(1);
    expect(state.home.homeContextMenu.showRecentMenu).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state when there is nothing to resume', () => {
    state.sections.add('recent');
    state.home.quickPicks.value = [];
    state.home.continueTrack.value = null;
    setup();

    expect(wrapper!.find('[data-testid="empty-state"]').exists()).toBe(true);
    expect(wrapper!.text()).toContain('home.noTracks');
  });

  it('hides both when the section is disabled', () => {
    state.home.quickPicks.value = [];
    setup();
    expect(wrapper!.find('[data-testid="quick-picks"]').exists()).toBe(false);
    expect(wrapper!.find('[data-testid="empty-state"]').exists()).toBe(false);
  });
});

describe('shelves', () => {
  beforeEach(() => {
    state.sections.add('mostPlayed');
    state.sections.add('favorites');
    state.sections.add('playlists');
    state.sections.add('albums');
    state.sections.add('artists');
  });

  it('renders every shelf with its cards', () => {
    setup();

    expect(wrapper!.findAll('[data-testid="shelf"]')).toHaveLength(5);
    expect(shelf('home.mostPlayed').props('itemCount')).toBe(1);
    expect(shelf('library.playlists').props('itemCount')).toBe(1);
    expect(wrapper!.findAll('[data-testid="media-card"]')).toHaveLength(5);
    expect(state.groupLabel).toHaveBeenCalledWith('Album', expect.any(Function));
  });

  it('maps track metadata to cards', () => {
    setup();
    const cards = wrapper!.findAllComponents(MediaCardStub);
    const top = cards.find((card) => card.props('title') === 'Top Song')!;

    expect(top.props()).toMatchObject({
      subtitle: 'sub:top',
      coverPath: 'D:/music/top.mp3',
      coverSize: 132,
      badge: 'undefined plays'
    });
  });

  it('opens library pages from the headers', async () => {
    setup();

    for (const title of [
      'home.mostPlayed',
      'home.favorites',
      'library.playlists',
      'library.albums',
      'library.artists'
    ]) {
      await shelf(title).get('[data-testid="shelf-see-all"]').trigger('click');
    }

    expect(state.home.openLibrary.mock.calls).toEqual([
      ['tracks'],
      ['tracks'],
      ['playlists'],
      ['albums'],
      ['artists']
    ]);
  });

  it('plays tracks and opens collections from the cards', async () => {
    setup();
    const cards = wrapper!.findAllComponents(MediaCardStub);

    const top = cards.find((card) => card.props('title') === 'Top Song')!;
    await top.get('[data-testid="card-play"]').trigger('click');
    expect(state.home.player.setTrack).toHaveBeenCalledTimes(1);

    const playlist = cards.find((card) => card.props('title') === 'Playlist')!;
    await playlist.get('[data-testid="card-play"]').trigger('click');
    expect(state.playTrackList).toHaveBeenCalledWith(state.home.playlists.value[0].tracks);
    await playlist.get('[data-testid="card-open"]').trigger('click');
    expect(state.home.openLibrary).toHaveBeenCalledWith('playlists');

    const album = cards.find((card) => card.props('title') === 'label:Album')!;
    await album.get('[data-testid="card-play"]').trigger('click');
    expect(state.playTrackList).toHaveBeenCalledWith(state.home.albums.value[0][1]);
    await album.get('[data-testid="card-open"]').trigger('click');
    expect(state.home.openLibrary).toHaveBeenCalledWith('albums');

    const artist = cards.find((card) => card.props('title') === 'label:Artist')!;
    await artist.get('[data-testid="card-open"]').trigger('click');
    expect(state.home.openLibrary).toHaveBeenCalledWith('artists');
  });

  it('hides shelves with no items', () => {
    state.home.mostPlayed.value = [];
    setup();

    expect(wrapper!.findAll('[data-testid="shelf"]')).toHaveLength(4);
  });
});

describe('play from start', () => {
  it('starts directly without meaningful progress', async () => {
    state.sections.add('continue');
    state.home.continuePosition.value = 3;
    setup();

    await wrapper!.get('[data-testid="continue-start"]').trigger('click');

    expect(state.prompt.showConfirm).not.toHaveBeenCalled();
    expect(state.home.playContinueFromStart).toHaveBeenCalledTimes(1);
  });

  it('asks before discarding progress', async () => {
    state.sections.add('continue');
    setup();

    await wrapper!.get('[data-testid="continue-start"]').trigger('click');

    expect(state.prompt.showConfirm).toHaveBeenCalledWith('home.playFromStartConfirm');
    expect(state.home.playContinueFromStart).toHaveBeenCalledTimes(1);
  });

  it('aborts when the confirmation is refused', async () => {
    state.sections.add('continue');
    state.prompt.showConfirm.mockResolvedValue(false);
    setup();

    await wrapper!.get('[data-testid="continue-start"]').trigger('click');

    expect(state.home.playContinueFromStart).not.toHaveBeenCalled();
  });

  it('does nothing without a track', async () => {
    state.home.continueTrack.value = null;
    state.sections.add('continue');
    setup();

    expect(wrapper!.find('[data-testid="continue-card"]').exists()).toBe(false);
  });
});

describe('prompt dialog', () => {
  it('renders and forwards events when visible', async () => {
    state.prompt.promptVisible.value = true;
    state.prompt.promptMessage.value = 'Sure?';
    setup();

    const dialog = wrapper!.getComponent(PromptStub);
    expect(dialog.props()).toMatchObject({ visible: true, message: 'Sure?' });

    await wrapper!.get('[data-testid="prompt-confirm"]').trigger('click');
    await wrapper!.get('[data-testid="prompt-cancel"]').trigger('click');

    expect(state.prompt.promptConfirm).toHaveBeenCalledTimes(1);
    expect(state.prompt.promptCancel).toHaveBeenCalledTimes(1);
  });
});
