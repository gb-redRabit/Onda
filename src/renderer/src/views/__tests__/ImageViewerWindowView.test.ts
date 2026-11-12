import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';

const h = vi.hoisted(() => ({
  invoke: vi.fn(),
  on: vi.fn(),
  cleanup: vi.fn(),
  handler: null as ((payload: unknown) => void) | null
}));

vi.mock('@renderer/components/explorer/ImageViewer.vue', () => ({
  default: {
    name: 'ImageViewer',
    props: ['files', 'initialIndex'],
    emits: ['close'],
    template: '<div data-testid="image-viewer" />'
  }
}));

import ImageViewerWindowView from '../ImageViewerWindowView.vue';
import type { FileItem } from '@renderer/types/explorer';

const ViewerStub = {
  name: 'ImageViewer',
  props: ['files', 'initialIndex'],
  emits: ['close'],
  template: '<div data-testid="image-viewer" />'
};

let wrapper: VueWrapper | null = null;
let originalApi: Window['api'];

function image(path: string): FileItem {
  return {
    name: path,
    path,
    isDirectory: false,
    size: 1,
    modifiedAt: 0,
    createdAt: 0
  };
}

async function mountView() {
  wrapper = mount(ImageViewerWindowView, { global: { stubs: { ImageViewer: ViewerStub } } });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  originalApi = window.api;
  h.handler = null;
  h.invoke.mockReset().mockResolvedValue({ files: [image('/a.jpg'), image('/b.jpg')], index: 1 });
  h.on.mockReset().mockImplementation(((_channel: string, cb: (payload: unknown) => void) => {
    h.handler = cb;
    return h.cleanup;
  }) as never);
  h.cleanup.mockClear();
  window.api = { ...originalApi, invoke: h.invoke, on: h.on } as Window['api'];
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  window.api = originalApi;
});

describe('initial data', () => {
  it('loads files and the starting index before rendering the viewer', async () => {
    await mountView();

    expect(h.invoke).toHaveBeenCalledWith('imageViewer:getData');
    expect(h.on).toHaveBeenCalledWith('imageViewer:files', expect.any(Function));
    const viewer = wrapper!.findComponent(ViewerStub);
    expect(viewer.props('files')).toEqual([image('/a.jpg'), image('/b.jpg')]);
    expect(viewer.props('initialIndex')).toBe(1);
  });

  it('renders with an empty list when the payload is missing', async () => {
    h.invoke.mockResolvedValue(undefined);

    await mountView();

    const viewer = wrapper!.findComponent(ViewerStub);
    expect(viewer.props('files')).toEqual([]);
    expect(viewer.props('initialIndex')).toBe(0);
  });

  it('ignores a payload without a files array', async () => {
    h.invoke.mockResolvedValue({ files: 'nope', index: 9 });

    await mountView();

    expect(wrapper!.findComponent(ViewerStub).props('files')).toEqual([]);
  });
});

describe('live updates', () => {
  it('replaces the list and index from the files event', async () => {
    await mountView();

    h.handler!({ files: [image('/c.jpg')], index: 0 });
    await flushPromises();

    const viewer = wrapper!.findComponent(ViewerStub);
    expect(viewer.props('files')).toEqual([image('/c.jpg')]);
    expect(viewer.props('initialIndex')).toBe(0);
  });

  it('ignores malformed events', async () => {
    await mountView();

    h.handler!(null);
    h.handler!('payload');
    h.handler!({ other: true });
    await flushPromises();

    expect(wrapper!.findComponent(ViewerStub).props('files')).toHaveLength(2);
  });
});

describe('closing', () => {
  it('asks the main process to close the window', async () => {
    await mountView();

    wrapper!.findComponent(ViewerStub).vm.$emit('close');

    expect(h.invoke).toHaveBeenCalledWith('imageViewer:close');
  });

  it('removes the files listener on unmount', async () => {
    await mountView();

    wrapper!.unmount();
    wrapper = null;

    expect(h.cleanup).toHaveBeenCalledTimes(1);
  });

  it('survives a missing preload API', async () => {
    window.api = undefined as never;

    await mountView();

    expect(wrapper!.findComponent(ViewerStub).props('files')).toEqual([]);
  });
});
