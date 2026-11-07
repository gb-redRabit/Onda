import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import TrackTagEditor from '../TrackTagEditor.vue';

const state = vi.hoisted(() => ({
  notify: vi.fn(),
  invalidateCover: vi.fn(),
  onOverlayClick: vi.fn(),
  overlayOptions: null as any,
  pickImage: vi.fn(),
  getCover: vi.fn(),
  readCover: vi.fn(),
  writeCover: vi.fn(),
  renameFile: vi.fn(),
  writeTags: vi.fn(),
  createObjectURL: vi.fn(() => 'blob:cover'),
  revokeObjectURL: vi.fn(),
  loggerWarn: vi.fn(),
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/stores/player', () => ({
  usePlayerStore: () => ({ invalidateCoverCache: state.invalidateCover })
}));
vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => ({ notify: state.notify }) }));
vi.mock('@renderer/composables/useUnsavedGuard', () => ({
  useUnsavedGuard: (options: unknown) => {
    state.overlayOptions = options;
    return { onOverlayClick: state.onOverlayClick };
  }
}));
vi.mock('@renderer/utils/pickImage', () => ({ pickImagePath: state.pickImage }));
vi.mock('@shared/logger', () => ({
  logger: { warn: state.loggerWarn, info: vi.fn(), error: vi.fn() }
}));

const ModalShellStub = {
  props: ['visible'],
  emits: ['close', 'escape'],
  template: '<div v-if="visible"><slot /></div>'
};
const MediaCoverStub = {
  props: ['cover', 'size', 'fallback'],
  template: '<div />'
};

let wrapper: VueWrapper | null = null;

function track(name = 'song.mp3', metadata: Record<string, unknown> = {}) {
  return {
    path: `C:\\music\\${name}`,
    name,
    metadata: {
      title: 'Old title',
      artist: 'Old artist',
      album: 'Old album',
      year: 2001,
      genre: 'Rock',
      track: { no: 3 },
      ...metadata
    }
  } as never;
}

function mountEditor(props: { track: unknown }) {
  wrapper = mount(TrackTagEditor, {
    props: props as never,
    attachTo: document.body,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { ModalShell: ModalShellStub, MediaCover: MediaCoverStub }
    }
  });
  return wrapper;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
  await wrapper!.vm.$nextTick();
}

function inputs() {
  return wrapper!.findAll('input');
}

function saveButton() {
  return wrapper!.findAll('button').at(-1)!;
}

beforeEach(() => {
  vi.useFakeTimers();
  state.notify.mockClear();
  state.invalidateCover.mockClear();
  state.onOverlayClick.mockClear();
  state.overlayOptions = null;
  state.pickImage.mockReset();
  state.pickImage.mockResolvedValue('/picked.png');
  state.getCover.mockReset();
  state.getCover.mockResolvedValue({ type: 'image', data: 'data:image/jpeg;base64,cached' });
  state.readCover.mockReset();
  state.readCover.mockResolvedValue(null);
  state.writeCover.mockReset();
  state.writeCover.mockResolvedValue({ success: true });
  state.renameFile.mockReset();
  state.renameFile.mockResolvedValue({ success: true, newPath: 'C:\\music\\new.mp3' });
  state.writeTags.mockReset();
  state.writeTags.mockResolvedValue({ success: true });
  state.createObjectURL.mockClear();
  state.revokeObjectURL.mockClear();
  state.loggerWarn.mockClear();
  state.t.mockClear();
  (URL as unknown as Record<string, unknown>).createObjectURL = state.createObjectURL;
  (URL as unknown as Record<string, unknown>).revokeObjectURL = state.revokeObjectURL;
  (window as { api?: unknown }).api = {
    getCover: state.getCover,
    readCover: state.readCover,
    writeCover: state.writeCover,
    renameFile: state.renameFile,
    writeTags: state.writeTags
  };
  document.body.innerHTML = '';
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.useRealTimers();
  document.body.innerHTML = '';
  delete (window as { api?: unknown }).api;
});

describe('initial values and covers', () => {
  it('fills fields from the track and loads a cached cover', async () => {
    mountEditor({ track: track() });
    await flush();

    const values = inputs().map((input) => (input.element as HTMLInputElement).value);
    expect(values).toEqual(['song', 'Old title', 'Old artist', 'Old album', '2001', 'Rock', '3']);
    expect(state.getCover).toHaveBeenCalledWith('C:\\music\\song.mp3');
    expect(wrapper!.findComponent(MediaCoverStub).props('cover')).toEqual({
      type: 'image',
      data: 'data:image/jpeg;base64,cached'
    });
  });

  it('falls back to the embedded cover as a blob URL', async () => {
    state.getCover.mockResolvedValue({ type: 'image', data: null });
    state.readCover.mockResolvedValue({ data: [1, 2], mime: 'image/png' });
    mountEditor({ track: track() });
    await flush();

    expect(state.createObjectURL).toHaveBeenCalled();
    expect(wrapper!.findComponent(MediaCoverStub).props('cover')).toEqual({
      type: 'image',
      data: 'blob:cover'
    });
  });

  it('revokes a previously owned blob cover', async () => {
    state.getCover.mockResolvedValue(null);
    state.readCover.mockResolvedValue({ data: [1], mime: 'image/jpeg' });
    mountEditor({ track: track() });
    await flush();

    state.readCover.mockResolvedValue({ data: [2], mime: 'image/jpeg' });
    wrapper!.setProps({ track: track('other.mp3') });
    await flush();

    expect(state.revokeObjectURL).toHaveBeenCalledWith('blob:cover');
  });

  it('ignores a stale cover response after switching tracks', async () => {
    const first = { resolve: null as null | ((value: unknown) => void) };
    state.getCover.mockReturnValueOnce(new Promise((resolve) => (first.resolve = resolve)));
    mountEditor({ track: track('first.mp3') });
    await flush();

    state.getCover.mockResolvedValue(null);
    state.readCover.mockResolvedValue(null);
    wrapper!.setProps({ track: track('second.mp3') });
    await flush();
    first.resolve!({ type: 'image', data: 'data:image/jpeg;base64,first' });
    await flush();

    expect(wrapper!.findComponent(MediaCoverStub).props('cover')).toBeUndefined();
  });

  it('hides the dialog without a track', async () => {
    mountEditor({ track: null });
    await flush();
    expect(wrapper!.findComponent(ModalShellStub).props('visible')).toBe(false);
  });
});

describe('saving', () => {
  it('renames when the filename changed and emits saved data', async () => {
    mountEditor({ track: track() });
    await flush();
    await inputs()[0].setValue('new');
    await inputs()[4].setValue('2005');
    await inputs()[6].setValue('7');

    await saveButton().trigger('click');
    await flush();

    expect(state.renameFile).toHaveBeenCalledWith('C:\\music\\song.mp3', 'new');
    expect(state.writeTags).toHaveBeenCalledWith('C:\\music\\new.mp3', {
      title: 'Old title',
      artist: 'Old artist',
      album: 'Old album',
      year: '2005',
      genre: 'Rock',
      trackNumber: '7'
    });
    expect(wrapper!.emitted('saved')?.[0]?.[0]).toMatchObject({
      year: 2005,
      track: { no: 7 },
      name: 'new',
      path: 'C:\\music\\new.mp3'
    });
    expect(state.notify).toHaveBeenCalledWith('success', 'tags.saved');

    vi.advanceTimersByTime(600);
    expect(wrapper!.emitted('close')).toHaveLength(1);
  });

  it('skips rename when the name is unchanged and drops empty tags', async () => {
    mountEditor({ track: track() });
    await flush();
    await inputs()[1].setValue('');

    await saveButton().trigger('click');
    await flush();

    expect(state.renameFile).not.toHaveBeenCalled();
    expect(state.writeTags).toHaveBeenCalledWith('C:\\music\\song.mp3', {
      title: undefined,
      artist: 'Old artist',
      album: 'Old album',
      year: '2001',
      genre: 'Rock',
      trackNumber: '3'
    });
  });

  it('reports rename failures without writing tags', async () => {
    state.renameFile.mockResolvedValue({ success: false, error: 'denied' });
    mountEditor({ track: track() });
    await flush();
    await inputs()[0].setValue('new');

    await saveButton().trigger('click');
    await flush();

    expect(state.writeTags).not.toHaveBeenCalled();
    expect(state.notify).toHaveBeenCalledWith('error', 'tags.renameError', 'denied');
  });

  it('reports tag write failures', async () => {
    state.writeTags.mockResolvedValue({ success: false, error: 'locked' });
    mountEditor({ track: track() });
    await flush();
    await saveButton().trigger('click');
    await flush();
    expect(state.notify).toHaveBeenCalledWith('error', 'tags.saveError', 'locked');
  });
});

describe('covers and closing', () => {
  it('uploads a picked cover and reloads it', async () => {
    mountEditor({ track: track() });
    await flush();
    state.getCover.mockClear();

    const coverButton = wrapper!.findAll('button')[1];
    await coverButton.trigger('click');
    await flush();

    expect(state.pickImage).toHaveBeenCalled();
    expect(state.writeCover).toHaveBeenCalledWith('C:\\music\\song.mp3', '/picked.png');
    expect(state.invalidateCover).toHaveBeenCalledWith('C:\\music\\song.mp3');
    expect(state.notify).toHaveBeenCalledWith('success', 'tags.coverSaved');
    expect(state.getCover).toHaveBeenCalled();
  });

  it('ignores a canceled image pick and reports cover failures', async () => {
    mountEditor({ track: track() });
    await flush();
    state.pickImage.mockResolvedValueOnce(null);
    await wrapper!.findAll('button')[1].trigger('click');
    await flush();
    expect(state.writeCover).not.toHaveBeenCalled();

    state.writeCover.mockResolvedValueOnce({ success: false, error: 'bad image' });
    await wrapper!.findAll('button')[1].trigger('click');
    await flush();
    expect(state.notify).toHaveBeenCalledWith('error', 'tags.coverError', 'bad image');

    state.writeCover.mockRejectedValueOnce(new Error('io'));
    await wrapper!.findAll('button')[1].trigger('click');
    await flush();
    expect(state.notify).toHaveBeenCalledWith('error', 'tags.coverError', 'Error: io');
  });

  it('delegates overlay clicks to the unsaved guard and closes on escape', async () => {
    mountEditor({ track: track() });
    await flush();

    state.onOverlayClick();
    expect(state.onOverlayClick).toHaveBeenCalled();
    expect(state.overlayOptions).toMatchObject({
      dirtyWindowMs: 2500,
      notifyOnClosingClick: false
    });

    wrapper!.findComponent(ModalShellStub).vm.$emit('escape');
    expect(wrapper!.emitted('close')).toHaveLength(1);
  });
});
