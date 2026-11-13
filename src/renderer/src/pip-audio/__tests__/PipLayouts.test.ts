import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';

import { EDGE_PROGRESS_TRACK_H, EDGE_PROGRESS_TRACK_V } from '../pipTheme';

const CoverStub = defineComponent({
  name: 'PipCover',
  props: ['isVideo', 'videoSrc', 'imgSrc', 'playing'],
  template: '<div data-testid="cover" />'
});
const TransportStub = defineComponent({
  name: 'PipTransport',
  props: ['send', 'isPlaying', 'shuffle', 'repeat', 'layout'],
  template: '<div data-testid="transport" />'
});
const VolumeStub = defineComponent({
  name: 'PipVolume',
  props: [
    'send',
    'volume',
    'volLabel',
    'volPct',
    'onVolumeInput',
    'muted',
    'layout',
    'sliderClass'
  ],
  template: '<div data-testid="volume" />'
});
const EqStub = defineComponent({
  name: 'PipEqPresets',
  props: ['eqPreset', 'selectEqPreset'],
  template: '<div data-testid="eq" />'
});

import PipBarLayout from '../PipBarLayout.vue';
import PipStackLayout from '../PipStackLayout.vue';

const stubs = {
  PipCover: CoverStub,
  PipTransport: TransportStub,
  PipVolume: VolumeStub,
  PipEqPresets: EqStub
};

type Elements = Set<string>;

function state(elements: Elements, over: Record<string, unknown> = {}) {
  return {
    dock: 'bottom',
    progressPct: 42.6,
    isVideoCover: true,
    videoCoverSrc: 'video-src',
    coverData: 'cover-src',
    isPlaying: true,
    has: (id: string) => elements.has(id),
    trackName: 'Track',
    artist: 'Artist',
    nextTrackName: 'Next',
    nextTrackArtist: 'Next artist',
    fmt: (value: number) => `${value}s`,
    currentTime: 10,
    duration: 100,
    onProgressClick: vi.fn(),
    onProgressKeydown: vi.fn(),
    send: vi.fn(),
    shuffle: true,
    repeat: 'all',
    volume: 0.5,
    onVolumeInput: vi.fn(),
    volLabel: '🔊',
    volPct: '50%',
    isMuted: true,
    eqPreset: 'flat',
    selectEqPreset: vi.fn(),
    ...over
  } as never;
}

const ALL: Elements = new Set([
  'progress',
  'cover',
  'trackInfo',
  'nextTrack',
  'controls',
  'volume',
  'eq'
]);

describe('PipBarLayout', () => {
  it('renders every enabled element', () => {
    const wrapper = mount(PipBarLayout, { props: { state: state(ALL) }, global: { stubs } });

    expect(wrapper.find('[data-testid="cover"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="transport"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="volume"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="eq"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Track');
    expect(wrapper.text()).toContain('Artist');
    expect(wrapper.text()).toContain('10s / 100s');
    expect(wrapper.text()).toContain('Next');
    expect(wrapper.text()).toContain('Next artist');
  });

  it('orders the progress bar for bottom and top docks', () => {
    const bottom = mount(PipBarLayout, { props: { state: state(ALL) }, global: { stubs } });
    const bottomProgress = bottom.get('[role="slider"]');

    const bottomClasses = bottomProgress.classes();
    for (const cls of EDGE_PROGRESS_TRACK_H.split(' ')) expect(bottomClasses).toContain(cls);
    expect(bottomProgress.classes()).toContain('order-1');
    expect(bottomProgress.attributes('aria-valuenow')).toBe('43');
    expect(bottomProgress.get('div').attributes('style')).toContain('width: 42.6%');

    const top = mount(PipBarLayout, {
      props: { state: state(ALL, { dock: 'top' }) },
      global: { stubs }
    });
    expect(top.get('[role="slider"]').classes()).toContain('order-2');
  });

  it('forwards progress interactions', async () => {
    const value = state(ALL);
    const wrapper = mount(PipBarLayout, { props: { state: value }, global: { stubs } });

    await wrapper.get('[role="slider"]').trigger('click');
    await wrapper.get('[role="slider"]').trigger('keydown');

    expect(
      (value as { onProgressClick: ReturnType<typeof vi.fn> }).onProgressClick
    ).toHaveBeenCalled();
    expect(
      (value as { onProgressKeydown: ReturnType<typeof vi.fn> }).onProgressKeydown
    ).toHaveBeenCalled();
  });

  it('hides disabled elements', () => {
    const wrapper = mount(PipBarLayout, { props: { state: state(new Set()) }, global: { stubs } });

    expect(wrapper.find('[role="slider"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="cover"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="transport"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="volume"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="eq"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Track');
  });

  it('hides the next track block without a next title and artistless artists', () => {
    const wrapper = mount(PipBarLayout, {
      props: { state: state(new Set(['nextTrack']), { nextTrackName: '', nextTrackArtist: 'X' }) },
      global: { stubs }
    });
    expect(wrapper.text()).not.toContain('↳');

    const next = mount(PipBarLayout, {
      props: { state: state(new Set(['nextTrack']), { nextTrackArtist: '' }) },
      global: { stubs }
    });
    expect(next.text()).toContain('Next');
    expect(next.text()).not.toContain(' — ');
  });

  it('passes cover and volume props through', () => {
    const wrapper = mount(PipBarLayout, { props: { state: state(ALL) }, global: { stubs } });

    expect(wrapper.getComponent(CoverStub).props()).toMatchObject({
      isVideo: true,
      videoSrc: 'video-src',
      imgSrc: 'cover-src',
      playing: true
    });
    expect(wrapper.getComponent(VolumeStub).props()).toMatchObject({
      volume: 0.5,
      volLabel: '🔊',
      volPct: '50%',
      muted: true
    });
  });
});

describe('PipStackLayout', () => {
  it('renders the vertical progress rail and reorders by dock', () => {
    const left = mount(PipStackLayout, {
      props: { state: state(ALL, { dock: 'left' }) },
      global: { stubs }
    });
    const rail = left.get('[role="slider"]');

    const railClasses = rail.classes();
    for (const cls of EDGE_PROGRESS_TRACK_V.split(' ')) expect(railClasses).toContain(cls);
    expect(rail.classes()).toContain('order-2');
    expect(rail.get('div').attributes('style')).toContain('height: 42.6%');

    const right = mount(PipStackLayout, {
      props: { state: state(ALL, { dock: 'right' }) },
      global: { stubs }
    });
    expect(right.get('[role="slider"]').classes()).toContain('order-1');
  });

  it('renders cover, track info, transport, time and vertical volume', () => {
    const wrapper = mount(PipStackLayout, { props: { state: state(ALL) }, global: { stubs } });

    expect(wrapper.find('[data-testid="cover"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Track');
    expect(wrapper.text()).toContain('Next');
    expect(wrapper.text()).toContain('10s / 100s');
    expect(wrapper.getComponent(TransportStub).props('layout')).toBe('vertical');
    expect(wrapper.getComponent(VolumeStub).props('layout')).toBe('vertical');
    expect(wrapper.getComponent(VolumeStub).props('sliderClass')).toBe('my-6 w-14 -rotate-90');
  });

  it('forwards progress interactions', async () => {
    const value = state(ALL);
    const wrapper = mount(PipStackLayout, { props: { state: value }, global: { stubs } });

    await wrapper.get('[role="slider"]').trigger('click');
    await wrapper.get('[role="slider"]').trigger('keydown');

    expect(
      (value as { onProgressClick: ReturnType<typeof vi.fn> }).onProgressClick
    ).toHaveBeenCalled();
    expect(
      (value as { onProgressKeydown: ReturnType<typeof vi.fn> }).onProgressKeydown
    ).toHaveBeenCalled();
  });

  it('hides disabled elements', () => {
    const wrapper = mount(PipStackLayout, {
      props: { state: state(new Set()) },
      global: { stubs }
    });

    expect(wrapper.find('[role="slider"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="cover"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="transport"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="volume"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Track');
  });
});
