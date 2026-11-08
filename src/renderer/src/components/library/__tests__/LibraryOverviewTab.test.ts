import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, reactive } from 'vue';
import LibraryOverviewTab from '../LibraryOverviewTab.vue';

const state = vi.hoisted(() => ({
  library: null as any,
  player: null as any,
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/stores/library', () => ({ useLibraryStore: () => state.library }));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => state.player }));
vi.mock('@renderer/composables/useCountLabel', () => ({
  useCountLabel: () => ({ trackCount: (count: number) => `count:${count}` })
}));
vi.mock('@renderer/utils/shuffle', () => ({
  shuffled: (items: unknown[]) => [...items].reverse()
}));

const CardStub = defineComponent({
  props: ['track', 'showPlaylist'],
  emits: ['play', 'edit'],
  template: '<div data-testid="track-card" />'
});
const EmptyStub = defineComponent({
  props: ['title', 'description', 'icon', 'compact'],
  template: '<div data-testid="empty-state" />'
});

let wrapper: VueWrapper | null = null;

function track(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    path: `C:/music/${id}.mp3`,
    name: `${id}.mp3`,
    type: 'audio',
    addedAt: 100,
    duration: 10,
    ...overrides
  } as any;
}

function mountTab(props: Record<string, unknown> = {}) {
  wrapper = mount(LibraryOverviewTab, {
    props: { query: '', filteredAll: [], ...props } as never,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { LibraryTrackCard: CardStub, EmptyState: EmptyStub }
    }
  });
  return wrapper;
}

beforeEach(() => {
  state.library = reactive({
    tracks: [],
    audioTracks: [],
    recentTracks: [],
    mostPlayed: [],
    totalCount: 0,
    audioCount: 0,
    playlists: []
  });
  state.player = reactive({ favorites: [] });
  state.t.mockClear();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('search results mode', () => {
  it('renders the count and play-all for results', async () => {
    const results = [track('a'), track('b')];
    mountTab({ query: 'song', filteredAll: results });
    expect(wrapper!.text()).toContain('count:2');
    expect(wrapper!.findAllComponents(CardStub)).toHaveLength(2);

    await wrapper!.get('button').trigger('click');
    expect(wrapper!.emitted('playTracks')?.[0]).toEqual([results]);
  });

  it('hides play-all and shows an empty state without results', () => {
    mountTab({ query: 'none', filteredAll: [] });
    expect(wrapper!.findComponent(EmptyStub).props()).toMatchObject({
      title: 'library.searchNoResults',
      description: 'none'
    });
    expect(wrapper!.findAll('button')).toHaveLength(0);
  });

  it('limits results and reveals more in batches of 48', async () => {
    const results = Array.from({ length: 120 }, (_, index) => track(`t${index}`));
    mountTab({ query: 'x', filteredAll: results });
    expect(wrapper!.findAllComponents(CardStub)).toHaveLength(48);

    const showMore = wrapper!
      .findAll('button')
      .find((b) => b.text().includes('library.showMoreResults'));
    await showMore!.trigger('click');
    expect(wrapper!.findAllComponents(CardStub)).toHaveLength(96);

    await wrapper!
      .findAll('button')
      .find((b) => b.text().includes('library.showMoreResults'))!
      .trigger('click');
    expect(wrapper!.findAllComponents(CardStub)).toHaveLength(120);
    expect(wrapper!.text()).not.toContain('library.showMoreResults');
  });

  it('resets the limit when the query changes', async () => {
    const results = Array.from({ length: 60 }, (_, index) => track(`t${index}`));
    mountTab({ query: 'a', filteredAll: results });
    await wrapper!
      .findAll('button')
      .find((b) => b.text().includes('library.showMoreResults'))!
      .trigger('click');
    expect(wrapper!.findAllComponents(CardStub)).toHaveLength(60);

    await wrapper!.setProps({ query: 'ab' });
    expect(wrapper!.findAllComponents(CardStub)).toHaveLength(48);
  });

  it('forwards card play and edit events', () => {
    const item = track('a');
    mountTab({ query: 'x', filteredAll: [item] });
    const card = wrapper!.findComponent(CardStub);
    card.vm.$emit('play', item);
    card.vm.$emit('edit', item);
    expect(wrapper!.emitted('play')?.[0]).toEqual([item]);
    expect(wrapper!.emitted('edit')?.[0]).toEqual([item]);
  });
});

describe('liked hero', () => {
  const liked = [track('l1'), track('l2')];

  function mountLiked() {
    state.library.tracks = [...liked, track('not-liked'), track('liked-image', { type: 'image' })];
    state.player.favorites = ['C:/music/l1.mp3', 'C:/music/l2.mp3', 'C:/music/liked-image.mp3'];
    return mountTab();
  }

  it('renders only up to six liked audio tracks', () => {
    mountLiked();
    expect(wrapper!.text()).toContain('library.likedSongs');
    expect(wrapper!.text()).toContain('2 common.tracks');
    const likedCards = wrapper!
      .findAllComponents(CardStub)
      .filter((c) => ['l1', 'l2'].includes(c.props('track').id));
    expect(likedCards).toHaveLength(2);
  });

  it('plays and shuffles the liked tracks', async () => {
    mountLiked();
    const buttons = wrapper!.findAll('button[aria-label]');
    await buttons.find((b) => b.attributes('aria-label') === 'library.playAll')!.trigger('click');
    expect(wrapper!.emitted('playTracks')?.[0]).toEqual([liked]);

    await buttons.find((b) => b.attributes('aria-label') === 'library.shuffle')!.trigger('click');
    expect(wrapper!.emitted('playTracks')?.[1]).toEqual([[...liked].reverse()]);
  });

  it('caps the liked list at six tracks', () => {
    state.library.tracks = Array.from({ length: 9 }, (_, index) =>
      track(`l${index}`, { path: `C:/music/l${index}.mp3` })
    );
    state.player.favorites = state.library.tracks.map((t: any) => t.path);
    mountTab();
    expect(wrapper!.text()).toContain('6 common.tracks');
  });

  it('omits the hero when there are no favorites', () => {
    mountTab();
    expect(wrapper!.findAll('button[aria-label="library.playAll"]')).toHaveLength(0);
    expect(wrapper!.findAll('button[aria-label="library.shuffle"]')).toHaveLength(0);
  });
});

describe('overview sections', () => {
  it('renders five sections with empty placeholders', () => {
    mountTab();
    expect(wrapper!.findAll('section')).toHaveLength(5);
    expect(wrapper!.findAllComponents(EmptyStub)).toHaveLength(0);
    expect(wrapper!.text()).toContain('library.likedEmpty');
    expect(wrapper!.text()).toContain('library.noAudio');
    expect(wrapper!.findAll('section')[0].text()).toContain('library.likedSongs');
    expect(wrapper!.findAll('section')[4].text()).toContain('library.random');
  });

  it('renders recent and most played slices', () => {
    state.library.recentTracks = [track('r1'), track('r2')];
    state.library.mostPlayed = [track('m1')];
    mountTab();
    const sections = wrapper!.findAll('section');
    expect(sections[1].findAllComponents(CardStub)).toHaveLength(2);
    expect(sections[2].findAllComponents(CardStub)).toHaveLength(1);
  });

  it('sorts newest tracks and keeps only six', () => {
    state.library.audioTracks = [
      track('a', { addedAt: 10 }),
      track('b', { addedAt: 50 }),
      track('c', { addedAt: 30 }),
      track('d', { addedAt: 60 }),
      track('e', { addedAt: 20 }),
      track('f', { addedAt: 40 }),
      track('g', { addedAt: 5 })
    ];
    mountTab();
    const newestCards = wrapper!.findAll('section')[3].findAllComponents(CardStub);
    expect(newestCards.map((c: any) => c.props('track').id)).toEqual([
      'd',
      'b',
      'f',
      'c',
      'e',
      'a'
    ]);
  });

  it('handles empty and small audio sets for random/newest', () => {
    mountTab();
    expect(wrapper!.findAll('section')[3].text()).toContain('library.noAudio');

    state.library.audioTracks = [track('a'), track('b')];
    wrapper!.unmount();
    mountTab();
    expect(wrapper!.findAll('section')[3].findAllComponents(CardStub)).toHaveLength(2);
    expect(wrapper!.findAll('section')[4].findAllComponents(CardStub)).toHaveLength(2);
  });

  it('samples six random tracks and refreshes when the set grows', async () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    state.library.audioTracks = Array.from({ length: 10 }, (_, index) =>
      track(`t${index}`, { addedAt: index })
    );
    mountTab();
    const randomSection = () => wrapper!.findAll('section')[4].findAllComponents(CardStub);
    expect(randomSection()).toHaveLength(6);
    const unique = new Set(randomSection().map((c: any) => c.props('track').id));
    expect(unique.size).toBe(6);
    expect(random).toHaveBeenCalled();

    state.library.audioTracks = [track('only')];
    await wrapper!.vm.$nextTick();
    expect(randomSection()).toHaveLength(1);
  });

  it('shuffles sections with more than one track and emits play tracks', async () => {
    state.library.recentTracks = [track('r1'), track('r2')];
    mountTab();
    const section = wrapper!.findAll('section')[1];
    await section.get('button[title="library.shuffle"]').trigger('click');
    expect(wrapper!.emitted('playTracks')?.[0]).toEqual([
      [state.library.recentTracks[1], state.library.recentTracks[0]]
    ]);
  });

  it('shows all only for non-empty sections and forwards the section id', async () => {
    state.library.recentTracks = [track('r1')];
    mountTab();
    const sections = wrapper!.findAll('section');
    expect(sections[0].find('button.text-primary-text').exists()).toBe(false);
    expect(sections[1].find('button.text-primary-text').exists()).toBe(true);
    expect(sections[1].find('button[title="library.shuffle"]').exists()).toBe(false);

    await sections[1].find('button.text-primary-text').trigger('click');
    expect(wrapper!.emitted('showAll')?.[0]).toEqual(['recent']);
  });

  it('ignores play and shuffle for empty track lists', async () => {
    mountTab();
    const heroPlay = wrapper!.findAll('button[aria-label]');
    expect(heroPlay).toHaveLength(0);
    expect(wrapper!.emitted('playTracks')).toBeUndefined();
  });

  it('renders footer statistics', () => {
    state.library.totalCount = 100;
    state.library.audioCount = 80;
    state.library.playlists = [{ id: 'p1' }, { id: 'p2' }];
    mountTab();
    expect(wrapper!.text()).toContain('home.statFiles: 100');
    expect(wrapper!.text()).toContain('home.statAudio: 80');
    expect(wrapper!.text()).toContain('home.statPlaylists: 2');
  });
});
