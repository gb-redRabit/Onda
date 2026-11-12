import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent } from 'vue';

const h = vi.hoisted(() => ({
  t: vi.fn((key: string) => key),
  decorations: { cover: 'glow' } as Record<string, unknown>,
  resolveDecoration: vi.fn((_el: unknown, _decorations: unknown) => 'decoration-x'),
  elementStyle: vi.fn((_el: unknown, _drag: unknown) => ({ left: '10px', top: '20px' }))
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: h.t }) }));
vi.mock('@renderer/stores/plugins', () => ({
  usePluginsStore: () => ({ decorations: h.decorations })
}));
vi.mock('@renderer/stores/player', () => ({
  usePlayerStore: () => ({ currentTrack: { id: 'track-1' } })
}));
vi.mock('@renderer/utils/audioView', () => ({
  resolveElementDecoration: h.resolveDecoration
}));
vi.mock('@renderer/utils/audioElementStyle', () => ({ elementStyle: h.elementStyle }));
vi.mock('@renderer/utils/audioLayoutEditorMeta', () => ({
  ELEMENT_META: {
    visualization: { labelKey: 'el.visualization' },
    cover: { labelKey: 'el.cover' },
    trackInfo: { labelKey: 'el.trackInfo' },
    progress: { labelKey: 'el.progress' },
    lyrics: { labelKey: 'el.lyrics' },
    controls: { labelKey: 'el.controls' },
    favorite: { labelKey: 'el.favorite' },
    technical: { labelKey: 'el.technical' }
  },
  VARIANT_DEFAULT: {
    cover: 'cover-default',
    trackInfo: 'track-default',
    progress: 'progress-default',
    lyrics: 'lyrics-default',
    controls: 'controls-default',
    favorite: 'favorite-default',
    technical: 'technical-default'
  }
}));

import AudioCanvasElements from '../AudioCanvasElements.vue';
import type { AudioLayoutElement } from '@renderer/types/settings';

const Stub = (name: string, props: string[] = []) =>
  defineComponent({
    name,
    props,
    emits: ['mousedown'],
    template: `<div data-testid="${name}" />`
  });

const stubMap = {
  AudioVisualizer: Stub('AudioVisualizer'),
  AudioCover: Stub('AudioCover', ['size', 'variant', 'decoration']),
  TrackInfo: Stub('TrackInfo', ['track', 'variant', 'audioVariant', 'showFavorite']),
  AudioProgressBar: Stub('AudioProgressBar', ['variant']),
  AudioControls: Stub('AudioControls', ['variant']),
  LyricsPanel: Stub('LyricsPanel', ['variant']),
  AudioFavoriteElement: Stub('AudioFavoriteElement', ['variant']),
  AudioTechnicalInfo: Stub('AudioTechnicalInfo', ['variant'])
};

let wrapper: VueWrapper | null = null;

function element(id: string, overrides: Partial<AudioLayoutElement> = {}): AudioLayoutElement {
  return {
    id,
    x: 1,
    y: 2,
    width: 100,
    height: 50,
    visible: true,
    ...overrides
  } as AudioLayoutElement;
}

const allElements = () =>
  [
    element('visualization'),
    element('cover'),
    element('trackInfo', { variant: 'compact' }),
    element('progress'),
    element('lyrics'),
    element('controls'),
    element('favorite'),
    element('technical')
  ] as AudioLayoutElement[];

function mountCanvas(
  elements: AudioLayoutElement[] = allElements(),
  options: { isFullscreen?: boolean; uiVisible?: boolean; dragPos?: null } = {}
) {
  wrapper = mount(AudioCanvasElements, {
    props: {
      elements,
      dragPos: options.dragPos ?? null,
      isFullscreen: options.isFullscreen ?? false,
      uiVisible: options.uiVisible ?? true
    },
    global: { stubs: stubMap }
  });
  return wrapper;
}

function roots() {
  return wrapper!.findAll('.absolute.overflow-hidden');
}

function rootFor(id: string) {
  return roots()[allElements().findIndex((el) => el.id === id)];
}

function propsOf(name: keyof typeof stubMap): Record<string, unknown> {
  return wrapper!.findComponent(stubMap[name]).props() as Record<string, unknown>;
}

beforeEach(() => {
  h.t.mockClear();
  h.resolveDecoration.mockClear();
  h.elementStyle.mockClear();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('rendering elements', () => {
  it('renders every element type with its child component', () => {
    mountCanvas();

    expect(wrapper!.findComponent(stubMap.AudioVisualizer).exists()).toBe(true);
    expect(wrapper!.findComponent(stubMap.AudioCover).exists()).toBe(true);
    expect(wrapper!.findComponent(stubMap.TrackInfo).exists()).toBe(true);
    expect(wrapper!.findComponent(stubMap.AudioProgressBar).exists()).toBe(true);
    expect(wrapper!.findComponent(stubMap.LyricsPanel).exists()).toBe(true);
    expect(wrapper!.findComponent(stubMap.AudioControls).exists()).toBe(true);
    expect(wrapper!.findComponent(stubMap.AudioFavoriteElement).exists()).toBe(true);
    expect(wrapper!.findComponent(stubMap.AudioTechnicalInfo).exists()).toBe(true);
  });

  it('hides invisible elements and applies computed styles', () => {
    mountCanvas([element('cover', { visible: false }), element('lyrics')]);

    const [hidden, shown] = roots();
    expect((hidden.element as HTMLElement).style.display).toBe('none');
    expect((shown.element as HTMLElement).style.display).not.toBe('none');
    expect(h.elementStyle).toHaveBeenCalledTimes(2);
    expect((shown.element as HTMLElement).getAttribute('style')).toContain('left: 10px');
  });

  it('passes variants and decorations to the cover and lyrics panels', () => {
    mountCanvas([element('cover', { variant: 'bordered' }), element('lyrics')]);

    const cover = wrapper!.findComponent(stubMap.AudioCover);
    expect(cover.props()).toMatchObject({
      size: 'w-full h-full',
      variant: 'bordered',
      decoration: 'decoration-x'
    });
    expect(h.resolveDecoration).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'cover' }),
      h.decorations
    );

    expect(propsOf('LyricsPanel').variant).toBe('lyrics-default');
  });

  it('passes default variants and the current track to child components', () => {
    mountCanvas([
      element('trackInfo'),
      element('progress'),
      element('controls'),
      element('favorite'),
      element('technical')
    ]);

    expect(wrapper!.findComponent(stubMap.TrackInfo).props()).toMatchObject({
      track: { id: 'track-1' },
      variant: 'audio',
      audioVariant: 'track-default'
    });
    expect(propsOf('TrackInfo').showFavorite).toBe('');
    expect(propsOf('AudioProgressBar').variant).toBe('progress-default');
    expect(propsOf('AudioControls').variant).toBe('controls-default');
    expect(propsOf('AudioFavoriteElement').variant).toBe('favorite-default');
    expect(propsOf('AudioTechnicalInfo').variant).toBe('technical-default');
  });
});

describe('dragging', () => {
  it('makes fullscreen elements draggable except the visualization', () => {
    mountCanvas(allElements(), { isFullscreen: true });

    const visualization = rootFor('visualization');
    const cover = rootFor('cover');
    const track = rootFor('trackInfo');

    expect(visualization.attributes('tabindex')).toBeUndefined();
    expect(visualization.attributes('role')).toBeUndefined();

    expect(cover.attributes('tabindex')).toBe('0');
    expect(cover.attributes('role')).toBe('group');
    expect(cover.attributes('aria-label')).toBe('el.cover');
    expect(cover.attributes('aria-keyshortcuts')).toBe('ArrowUp ArrowDown ArrowLeft ArrowRight');
    expect(h.t).toHaveBeenCalledWith('el.cover');

    expect(track.attributes('aria-label')).toBe('el.trackInfo');
  });

  it('is not draggable outside fullscreen', () => {
    mountCanvas();

    expect(rootFor('cover').attributes('tabindex')).toBeUndefined();
    expect(rootFor('cover').attributes('role')).toBeUndefined();
  });

  it('emits mousedown and keydown for draggable elements', async () => {
    mountCanvas(allElements(), { isFullscreen: true });
    const coverRoot = rootFor('cover');
    const coverEl = allElements()[1];

    (coverRoot.element.firstElementChild as HTMLElement).dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true })
    );
    await coverRoot.trigger('keydown', { key: 'ArrowRight' });

    expect(wrapper!.emitted('element-mousedown')![0][1]).toEqual(coverEl);
    expect(wrapper!.emitted('element-keydown')![0][1]).toEqual(coverEl);
  });

  it('ignores keydown outside fullscreen', async () => {
    mountCanvas();
    const coverRoot = rootFor('cover');

    await coverRoot.trigger('keydown', { key: 'ArrowRight' });

    expect(wrapper!.emitted('element-keydown')).toBeUndefined();
  });
});

describe('visibility classes', () => {
  it('fades controls when the UI is hidden', () => {
    mountCanvas(allElements(), { uiVisible: false });

    expect(rootFor('progress').find('div').classes()).toContain('opacity-0');
    expect(rootFor('controls').find('div').classes()).toContain('opacity-0');
  });

  it('fades track info, favorite and technical info in fullscreen without UI', () => {
    mountCanvas(allElements(), { isFullscreen: true, uiVisible: false });

    expect(rootFor('trackInfo').find('div').classes()).toContain('opacity-0');
    expect(rootFor('favorite').find('div').classes()).toContain('opacity-0');
    expect(rootFor('technical').find('div').classes()).toContain('opacity-0');
  });

  it('keeps the cover fully visible', () => {
    mountCanvas(allElements(), { isFullscreen: true, uiVisible: false });

    expect(rootFor('cover').find('div').classes()).not.toContain('opacity-0');
  });
});

describe('mousedown forwarding', () => {
  it.each(['trackInfo', 'progress', 'controls', 'favorite', 'technical'] as const)(
    'emits element-mousedown from %s',
    (id) => {
      mountCanvas(allElements());
      const root = rootFor(id);
      const target = root.element.firstElementChild as HTMLElement;

      target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

      const emitted = wrapper!.emitted('element-mousedown') ?? [];
      expect(emitted).toHaveLength(1);
      expect(emitted[0][1]).toEqual(expect.objectContaining({ id }));
    }
  );

  it('falls back to the element id when it has no label metadata', async () => {
    mountCanvas([element('customWidget')], { isFullscreen: true });
    const root = roots()[0];

    expect(root.attributes('aria-label')).toBe('customWidget');
    await root.trigger('keydown', { key: 'ArrowDown' });

    expect(wrapper!.emitted('element-keydown')![0][1]).toEqual(
      expect.objectContaining({ id: 'customWidget' })
    );
  });
});
