import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';

const h = vi.hoisted(() => ({
  close: vi.fn(),
  prev: vi.fn(),
  next: vi.fn(),
  goTo: vi.fn(),
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
  rotate: vi.fn(),
  fit: vi.fn(),
  changeInterval: vi.fn(),
  handleClose: vi.fn(),
  toggleSlideshow: vi.fn(),
  toggleFullscreen: vi.fn(),
  onImageLoaded: vi.fn(),
  onImageError: vi.fn(),
  onWheel: vi.fn(),
  makeTransform: vi.fn((value: string) => `t:${value}`),
  useImageViewer: vi.fn(),
  useDialogFocus: vi.fn(),
  invoke: vi.fn(),
  state: null as any
}));

vi.mock('@renderer/composables/useImageViewer', () => ({
  useImageViewer: (...args: unknown[]) => {
    h.useImageViewer(...args);
    return h.state;
  }
}));
vi.mock('@renderer/composables/useDialogFocus', () => ({
  useDialogFocus: (...args: unknown[]) => h.useDialogFocus(...args)
}));

const ToolbarStub = defineComponent({
  name: 'ImageViewerToolbar',
  props: [
    'slideshowActive',
    'settingsOpen',
    'slideshowInterval',
    'transitionType',
    'transitionDuration',
    'loop',
    'shuffle',
    'kenBurns',
    'autoHide',
    'fullscreen',
    'uiVisible'
  ],
  emits: [
    'close',
    'toggleSlideshow',
    'toggleSettings',
    'fitToScreen',
    'zoomIn',
    'zoomOut',
    'rotate',
    'edit',
    'toggleFullscreen',
    'update:interval',
    'update:transitionType',
    'update:transitionDuration',
    'update:loop',
    'update:shuffle',
    'update:kenBurns',
    'update:autoHide'
  ],
  template: '<div data-testid="toolbar" />'
});
const ThumbsStub = defineComponent({
  name: 'ImageViewerThumbnails',
  props: [
    'files',
    'currentIndex',
    'thumbCache',
    'visible',
    'showThumbs',
    'scale',
    'rotation',
    'currentFile'
  ],
  emits: ['goTo', 'update:showThumbs'],
  template: '<div data-testid="thumbs" />'
});
const LoaderStub = defineComponent({ name: 'Loader', template: '<span data-testid="loader" />' });

import ImageViewer from '../ImageViewer.vue';

let wrapper: VueWrapper | null = null;

function state() {
  return {
    currentIndex: ref(0),
    scale: ref(1),
    rotation: ref(0),
    displaySrc: ref('file:///a.jpg'),
    oldSrc: ref(''),
    imgError: ref(false),
    settingsOpen: ref(false),
    fullscreen: ref(false),
    loop: ref(true),
    showThumbnails: ref(true),
    showBottom: ref(true),
    uiVisible: ref(true),
    transitionType: ref('fade'),
    transitionDuration: ref(500),
    newStyle: ref({ transform: 'new', opacity: '1' }),
    oldStyle: ref({ transform: 'old', opacity: '0' }),
    thumbCache: ref(new Map()),
    currentFile: ref({ name: 'a.jpg', path: 'D:/a.jpg' } as { name: string; path: string } | null),
    hasPrev: ref(true),
    hasNext: ref(true),
    slideshowActive: ref(false),
    slideshowInterval: ref(3000),
    slideshowProgress: ref(25),
    kenBurns: ref(false),
    shuffleSlideshow: ref(false),
    autoHideUI: ref(true),
    prev: h.prev,
    next: h.next,
    goTo: h.goTo,
    zoomIn: h.zoomIn,
    zoomOut: h.zoomOut,
    rotate: h.rotate,
    fitToScreen: h.fit,
    changeInterval: h.changeInterval,
    handleClose: h.handleClose,
    toggleSlideshow: h.toggleSlideshow,
    toggleFullscreen: h.toggleFullscreen,
    onImageLoaded: h.onImageLoaded,
    onImageError: h.onImageError,
    onWheel: h.onWheel,
    makeTransform: h.makeTransform
  };
}

function setup(props: Record<string, unknown> = {}) {
  const component = mount(ImageViewer, {
    props: {
      files: [
        { name: 'a.jpg', path: 'D:/a.jpg' },
        { name: 'b.jpg', path: 'D:/b.jpg' }
      ],
      initialIndex: 0,
      ...props
    } as never,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        ImageViewerToolbar: ToolbarStub,
        ImageViewerThumbnails: ThumbsStub,
        Loader: LoaderStub
      }
    }
  });
  wrapper = component;
  return component;
}

function toolbar() {
  return wrapper!.findComponent(ToolbarStub);
}

beforeEach(() => {
  for (const fn of [
    h.prev,
    h.next,
    h.goTo,
    h.zoomIn,
    h.zoomOut,
    h.rotate,
    h.fit,
    h.changeInterval,
    h.handleClose,
    h.toggleSlideshow,
    h.toggleFullscreen,
    h.onImageLoaded,
    h.onImageError,
    h.onWheel,
    h.useImageViewer,
    h.useDialogFocus,
    h.invoke
  ]) {
    fn.mockReset();
  }
  h.invoke.mockResolvedValue(undefined);
  h.state = state();
  (window as unknown as { api?: unknown }).api = { invoke: h.invoke };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  delete (window as unknown as { api?: unknown }).api;
});

describe('rendering', () => {
  it('passes props to the viewer composable and focus trap', () => {
    setup();

    expect(h.useImageViewer).toHaveBeenCalledWith(
      expect.objectContaining({ initialIndex: 0 }),
      expect.objectContaining({ close: expect.any(Function) })
    );
    expect(h.useDialogFocus).toHaveBeenCalled();
    expect(wrapper!.get('[data-testid="image-viewer"]').attributes('aria-label')).toBe('a.jpg');

    (h.useImageViewer.mock.calls[0][1] as { close: () => void }).close();
    expect(wrapper!.emitted('close')).toHaveLength(1);
  });

  it('shows navigation only outside a slideshow', async () => {
    setup();
    expect(wrapper!.find('[data-testid="image-viewer-prev"]').exists()).toBe(true);
    expect(wrapper!.find('[data-testid="image-viewer-next"]').exists()).toBe(true);

    await wrapper!.get('[data-testid="image-viewer-prev"]').trigger('click');
    await wrapper!.get('[data-testid="image-viewer-next"]').trigger('click');
    expect(h.prev).toHaveBeenCalled();
    expect(h.next).toHaveBeenCalled();

    h.state.slideshowActive.value = true;
    await wrapper!.vm.$nextTick();
    expect(wrapper!.find('[data-testid="image-viewer-prev"]').exists()).toBe(false);
    expect(wrapper!.find('[data-testid="image-viewer-next"]').exists()).toBe(false);
  });

  it('renders the transition layers and wires image events', async () => {
    setup();
    h.state.oldSrc.value = 'file:///old.jpg';
    await wrapper!.vm.$nextTick();

    const images = wrapper!.findAll('img');
    expect(images).toHaveLength(2);
    expect(images[0].attributes('aria-hidden')).toBe('true');
    expect(images[1].attributes('src')).toBe('file:///a.jpg');
    expect(h.makeTransform).toHaveBeenCalledWith('new');
    expect(h.makeTransform).toHaveBeenCalledWith('old');

    await images[1].trigger('load');
    await images[1].trigger('error');
    await images[1].trigger('dblclick');

    expect(h.onImageLoaded).toHaveBeenCalled();
    expect(h.onImageError).toHaveBeenCalled();
    expect(h.fit).toHaveBeenCalled();
  });

  it('shows the loader or the error message', async () => {
    setup();
    h.state.displaySrc.value = '';
    h.state.oldSrc.value = '';
    await wrapper!.vm.$nextTick();
    expect(wrapper!.find('[data-testid="loader"]').exists()).toBe(true);

    h.state.imgError.value = true;
    await wrapper!.vm.$nextTick();
    expect(wrapper!.text()).toContain('imageViewer.loadFailed');
  });

  it('renders slideshow progress', async () => {
    setup();
    h.state.slideshowActive.value = true;
    await wrapper!.vm.$nextTick();

    const progress = wrapper!.get('[data-testid="image-viewer-slideshow-progress"]');
    expect(progress.find('.bg-primary').attributes('style')).toContain('width: 25%');

    h.state.uiVisible.value = false;
    await wrapper!.vm.$nextTick();
    expect(progress.classes()).toContain('opacity-0');
    expect(wrapper!.get('[data-testid="image-viewer"]').classes()).toContain('cursor-none');
  });
});

describe('toolbar and thumbnails', () => {
  it('forwards toolbar events', async () => {
    setup();

    toolbar().vm.$emit('close');
    toolbar().vm.$emit('toggleSlideshow');
    toolbar().vm.$emit('fitToScreen');
    toolbar().vm.$emit('zoomIn');
    toolbar().vm.$emit('zoomOut');
    toolbar().vm.$emit('rotate');
    toolbar().vm.$emit('toggleFullscreen');

    expect(h.handleClose).toHaveBeenCalled();
    expect(h.toggleSlideshow).toHaveBeenCalled();
    expect(h.fit).toHaveBeenCalled();
    expect(h.zoomIn).toHaveBeenCalled();
    expect(h.zoomOut).toHaveBeenCalled();
    expect(h.rotate).toHaveBeenCalled();
    expect(h.toggleFullscreen).toHaveBeenCalled();
  });

  it('toggles settings and applies viewer options', async () => {
    setup();

    toolbar().vm.$emit('toggleSettings');
    await wrapper!.vm.$nextTick();
    expect(h.state.settingsOpen.value).toBe(true);

    toolbar().vm.$emit('update:interval', 5000);
    toolbar().vm.$emit('update:transitionType', 'zoom');
    toolbar().vm.$emit('update:transitionDuration', 800);
    toolbar().vm.$emit('update:loop', false);
    toolbar().vm.$emit('update:shuffle', true);
    toolbar().vm.$emit('update:kenBurns', true);
    toolbar().vm.$emit('update:autoHide', false);
    await wrapper!.vm.$nextTick();

    expect(h.changeInterval).toHaveBeenCalledWith(5000);
    expect(h.state.transitionType.value).toBe('zoom');
    expect(h.state.transitionDuration.value).toBe(800);
    expect(h.state.loop.value).toBe(false);
    expect(h.state.shuffleSlideshow.value).toBe(true);
    expect(h.state.kenBurns.value).toBe(true);
    expect(h.state.autoHideUI.value).toBe(false);
  });

  it('opens the image studio for the current file', async () => {
    setup();

    toolbar().vm.$emit('edit');
    await Promise.resolve();
    expect(h.invoke).toHaveBeenCalledWith('tools:openWindow', 'image-studio', {
      path: 'D:/a.jpg'
    });

    h.state.currentFile.value = null;
    h.invoke.mockClear();
    toolbar().vm.$emit('edit');
    await Promise.resolve();
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it('forwards thumbnail events and props', async () => {
    setup();
    const thumbs = wrapper!.findComponent(ThumbsStub);

    expect(thumbs.props('currentIndex')).toBe(0);
    expect(thumbs.props('showThumbs')).toBe(true);

    thumbs.vm.$emit('goTo', 1);
    thumbs.vm.$emit('update:showThumbs', false);
    await wrapper!.vm.$nextTick();

    expect(h.goTo).toHaveBeenCalledWith(1);
    expect(h.state.showThumbnails.value).toBe(false);
  });

  it('closes from the backdrop and forwards wheel events', async () => {
    setup();

    await wrapper!.get('[data-testid="image-viewer"]').trigger('click');
    await wrapper!.get('[data-testid="image-viewer"]').trigger('wheel');

    expect(h.handleClose).toHaveBeenCalled();
    expect(h.onWheel).toHaveBeenCalled();
  });

  it('closes the settings backdrop', async () => {
    setup();
    h.state.settingsOpen.value = true;
    await wrapper!.vm.$nextTick();

    const backdrop = wrapper!.get('div[role="presentation"]');
    await backdrop.trigger('click');

    expect(h.state.settingsOpen.value).toBe(false);
  });
});
