import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';

import { BTN, BTN_PLAY } from '../pipTheme';

const CoverStub = defineComponent({
  name: 'PipCover',
  props: {
    isVideo: { type: Boolean },
    videoSrc: { type: String },
    imgSrc: { type: String },
    playing: { type: Boolean },
    size: { type: String }
  },
  template: '<div data-testid="cover" />'
});
const TransportStub = defineComponent({
  name: 'PipTransport',
  props: {
    send: { type: Function },
    isPlaying: { type: Boolean },
    shuffle: { type: Boolean },
    repeat: { type: String },
    btnClass: { type: String },
    playBtnClass: { type: String }
  },
  template: '<div data-testid="transport" />'
});
const VolumeStub = defineComponent({
  name: 'PipVolume',
  props: {
    send: { type: Function },
    volume: { type: Number },
    volLabel: { type: String },
    volPct: { type: String },
    onVolumeInput: { type: Function },
    muted: { type: Boolean },
    sliderClass: { type: String }
  },
  template: '<div data-testid="volume" />'
});
const EqStub = defineComponent({
  name: 'PipEqPresets',
  props: { eqPreset: { type: String }, selectEqPreset: { type: Function } },
  template: '<div data-testid="eq" />'
});

import PipCardLayout from '../PipCardLayout.vue';

type Elements = Set<string>;

function state(elements: Elements, over: Record<string, unknown> = {}) {
  return {
    isVideoCover: true,
    videoCoverSrc: 'video',
    coverData: 'cover',
    isPlaying: true,
    has: (id: string) => elements.has(id),
    trackName: 'Track',
    artist: 'Artist',
    nextTrackName: 'Next',
    nextTrackArtist: 'Next artist',
    fmt: (value: number) => `${value}s`,
    currentTime: 10,
    duration: 100,
    progressPct: 42.6,
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

const stubs = {
  PipCover: CoverStub,
  PipTransport: TransportStub,
  PipVolume: VolumeStub,
  PipEqPresets: EqStub
};
const ALL: Elements = new Set([
  'cover',
  'trackInfo',
  'nextTrack',
  'progress',
  'controls',
  'volume',
  'eq'
]);

describe('PipCardLayout', () => {
  it('renders every enabled element', () => {
    const wrapper = mount(PipCardLayout, { props: { state: state(ALL) }, global: { stubs } });

    expect(wrapper.find('[data-testid="cover"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="transport"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="volume"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="eq"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Track');
    expect(wrapper.text()).toContain('Artist');
    expect(wrapper.text()).toContain('Next');
    expect(wrapper.text()).toContain('Next artist');
  });

  it('passes the small cover and transport theme classes', () => {
    const wrapper = mount(PipCardLayout, { props: { state: state(ALL) }, global: { stubs } });

    expect(wrapper.getComponent(CoverStub).props()).toMatchObject({
      isVideo: true,
      videoSrc: 'video',
      imgSrc: 'cover',
      playing: true,
      size: 'sm'
    });
    expect(wrapper.getComponent(TransportStub).props()).toMatchObject({
      btnClass: BTN,
      playBtnClass: BTN_PLAY
    });
  });

  it('renders the progress slider with the current width', () => {
    const wrapper = mount(PipCardLayout, { props: { state: state(ALL) }, global: { stubs } });
    const slider = wrapper.get('[data-testid="pip-progress"]');

    expect(slider.attributes('role')).toBe('slider');
    expect(slider.attributes('aria-valuenow')).toBe('43');
    expect(wrapper.text()).toContain('10s');
    expect(wrapper.text()).toContain('100s');
    expect(slider.get('div').attributes('style')).toContain('width: 42.6%');
  });

  it('forwards progress interactions', async () => {
    const value = state(ALL);
    const wrapper = mount(PipCardLayout, { props: { state: value }, global: { stubs } });

    await wrapper.get('[data-testid="pip-progress"]').trigger('click');
    await wrapper.get('[data-testid="pip-progress"]').trigger('keydown');

    expect(
      (value as { onProgressClick: ReturnType<typeof vi.fn> }).onProgressClick
    ).toHaveBeenCalled();
    expect(
      (value as { onProgressKeydown: ReturnType<typeof vi.fn> }).onProgressKeydown
    ).toHaveBeenCalled();
  });

  it('passes volume props and a narrower slider', () => {
    const wrapper = mount(PipCardLayout, { props: { state: state(ALL) }, global: { stubs } });

    expect(wrapper.getComponent(VolumeStub).props()).toMatchObject({
      volume: 0.5,
      volLabel: '🔊',
      volPct: '50%',
      muted: true,
      sliderClass: 'w-14'
    });
  });

  it('hides disabled elements', () => {
    const wrapper = mount(PipCardLayout, { props: { state: state(new Set()) }, global: { stubs } });

    expect(wrapper.find('[data-testid="cover"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="transport"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="volume"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="eq"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="pip-progress"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Track');
  });

  it('omits the next track block without a title and separator without an artist', () => {
    const empty = mount(PipCardLayout, {
      props: { state: state(new Set(['trackInfo', 'nextTrack']), { nextTrackName: '' }) },
      global: { stubs }
    });
    expect(empty.text()).not.toContain('↳');

    const artistless = mount(PipCardLayout, {
      props: { state: state(new Set(['trackInfo', 'nextTrack']), { nextTrackArtist: '' }) },
      global: { stubs }
    });
    expect(artistless.text()).toContain('Next');
    expect(artistless.text()).not.toContain(' — ');
  });

  it('keeps the volume column when only the equalizer is enabled', () => {
    const wrapper = mount(PipCardLayout, {
      props: { state: state(new Set(['eq'])) },
      global: { stubs }
    });

    expect(wrapper.find('[data-testid="eq"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="volume"]').exists()).toBe(false);
  });
});
