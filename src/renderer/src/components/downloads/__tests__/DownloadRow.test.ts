import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import DownloadRow from '../DownloadRow.vue';

const state = vi.hoisted(() => ({
  t: vi.fn((key: string) => key),
  cancelDownload: vi.fn(),
  openMenu: vi.fn(),
  showConfirm: vi.fn(),
  prompt: null as any,
  errorCodeKey: vi.fn(),
  invoke: vi.fn()
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/stores/online', () => ({
  useOnlineStore: () => ({ cancelDownload: state.cancelDownload })
}));
vi.mock('@renderer/composables/useDownloadsContextMenu', () => ({
  useDownloadsContextMenu: () => ({ openMenu: state.openMenu })
}));
vi.mock('@renderer/composables/usePromptDialog', () => ({
  usePromptDialog: () => state.prompt
}));
vi.mock('@renderer/utils/errorCodes', () => ({ errorCodeKey: state.errorCodeKey }));

const ActionsStub = defineComponent({
  name: 'DownloadRowActionsStub',
  props: { task: Object },
  emits: ['play', 'edit-meta', 'open-library', 'cancel'],
  template: `<div data-testid="actions">
    <button data-testid="action-play" @click="$emit('play')" />
    <button data-testid="action-edit" @click="$emit('edit-meta')" />
    <button data-testid="action-library" @click="$emit('open-library')" />
    <button data-testid="action-cancel" @click="$emit('cancel')" />
  </div>`
});

const PromptStub = defineComponent({
  name: 'ExplorerPromptDialogStub',
  props: { visible: Boolean, isConfirm: Boolean, message: String, value: String },
  emits: ['update:value', 'confirm', 'cancel'],
  template: `<div data-testid="prompt">
    <button data-testid="prompt-confirm" @click="$emit('confirm')" />
    <button data-testid="prompt-cancel" @click="$emit('cancel')" />
    <button data-testid="prompt-input" @click="$emit('update:value', 'typed')" />
  </div>`
});

const stubs = {
  DownloadRowActions: ActionsStub,
  ExplorerPromptDialog: PromptStub
};

function task(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    title: 'A video',
    format: 'MP4',
    status: 'completed',
    kind: 'video',
    progress: 0,
    speed: '',
    eta: '',
    ...overrides
  } as never;
}

let wrapper: VueWrapper | null = null;

function setup(overrides: Record<string, unknown> = {}) {
  wrapper = mount(DownloadRow, {
    props: { task: task(overrides) },
    global: { stubs }
  });
  return wrapper;
}

function row() {
  return wrapper!.get('[data-testid="download-row"]');
}

beforeEach(() => {
  state.t.mockClear();
  state.cancelDownload.mockReset();
  state.openMenu.mockReset();
  state.showConfirm.mockReset();
  state.showConfirm.mockResolvedValue(true);
  state.errorCodeKey.mockReset();
  state.errorCodeKey.mockReturnValue(null);
  state.invoke.mockReset();
  state.invoke.mockResolvedValue(undefined);
  state.prompt = {
    showConfirm: state.showConfirm,
    promptVisible: ref(false),
    promptIsConfirm: ref(false),
    promptMessage: ref(''),
    promptValue: ref(''),
    promptConfirm: vi.fn(),
    promptCancel: vi.fn()
  };
  (window as unknown as { api?: unknown }).api = { invoke: state.invoke };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  delete (window as unknown as { api?: unknown }).api;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('rendering', () => {
  it('shows the thumbnail, title and format', () => {
    setup({ thumbnail: 'https://img/cover.jpg' });

    expect(wrapper!.get('img').attributes('src')).toBe('https://img/cover.jpg');
    expect(wrapper!.text()).toContain('A video');
    expect(wrapper!.text()).toContain('MP4');
  });

  it('falls back to a status icon without a thumbnail', () => {
    setup();
    expect(wrapper!.find('img').exists()).toBe(false);
    expect(wrapper!.find('svg').exists()).toBe(true);
  });

  it('sizes video and audio thumbnails differently', () => {
    setup({ kind: 'video' });
    expect(row().find('.aspect-video').exists()).toBe(true);

    wrapper!.unmount();
    setup({ kind: 'audio' });
    expect(row().find('.size-12').exists()).toBe(true);
  });
});

describe('meta line', () => {
  it('translates a mapped error code', () => {
    state.errorCodeKey.mockReturnValue('errors.quota');
    setup({ status: 'error', error: 'raw', errorCode: 'quota' });

    expect(state.errorCodeKey).toHaveBeenCalledWith('quota');
    expect(wrapper!.text()).toContain('errors.quota');
    expect(wrapper!.get('p').classes()).toContain('text-error/80');
  });

  it('falls back to the raw error', () => {
    setup({ status: 'error', error: 'network down' });
    expect(wrapper!.text()).toContain('network down');
  });

  it('translates a progress message', () => {
    setup({ status: 'downloading', message: 'downloads.preparing' });
    expect(wrapper!.text()).toContain('downloads.preparing');
  });

  it('combines progress, speed and eta', () => {
    setup({ status: 'downloading', progress: 42, speed: '1.2 MB/s', eta: '0:30' });
    expect(wrapper!.text()).toContain('42% · 1.2 MB/s · 0:30');
    expect(wrapper!.get('p').classes()).toContain('font-mono');
  });

  it('omits zero progress', () => {
    setup({ status: 'downloading', progress: 0, speed: '1.2 MB/s', eta: '0:30' });
    expect(wrapper!.text()).toContain('1.2 MB/s · 0:30');
    expect(wrapper!.text()).not.toContain('0%');
  });

  it('labels pending and paused states', () => {
    setup({ status: 'pending' });
    expect(wrapper!.text()).toContain('downloads.statusPending');

    wrapper!.unmount();
    setup({ status: 'paused' });
    expect(wrapper!.text()).toContain('downloads.statusPaused');
  });

  it('uses the artist override and then the channel', () => {
    setup({
      status: 'completed',
      channelTitle: 'Channel',
      metaOverride: { artist: 'Artist' }
    });
    expect(wrapper!.text()).toContain('Artist');

    wrapper!.unmount();
    setup({ status: 'completed', channelTitle: 'Channel' });
    expect(wrapper!.text()).toContain('Channel');
    expect(wrapper!.get('p').attributes('title')).toBeUndefined();
  });

  it('exposes the output path for completed rows', () => {
    setup({ status: 'completed', outputPath: 'C:/out/file.mp4', channelTitle: 'Channel' });
    expect(wrapper!.get('p').attributes('title')).toBe('C:/out/file.mp4');
  });

  it('hides the line when there is nothing to show', () => {
    setup({ status: 'cancelled' });
    expect(wrapper!.find('p').exists()).toBe(false);
  });
});

describe('progress bar', () => {
  it('shows active progress', () => {
    setup({ status: 'downloading', progress: 55 });
    const bar = wrapper!.get('[role="progressbar"]');
    expect(bar.attributes('aria-valuenow')).toBe('55');
    expect(bar.find('div').attributes('style')).toContain('width: 55%');
  });

  it('shows pending rows and hides finished ones', () => {
    setup({ status: 'pending', progress: 0 });
    expect(wrapper!.find('[role="progressbar"]').exists()).toBe(true);

    wrapper!.unmount();
    setup({ status: 'paused' });
    expect(wrapper!.find('[role="progressbar"]').exists()).toBe(false);
  });
});

describe('cover status', () => {
  it('shows a spinner while fetching', () => {
    setup({ coverStatus: 'fetching' });
    expect(wrapper!.find('.animate-spin').exists()).toBe(true);
  });

  it('offers a retry button after an error', async () => {
    setup({ coverStatus: 'error', coverError: 'timeout' });
    const retry = wrapper!.get('[data-testid="download-retry-cover"]');

    expect(retry.attributes('title')).toContain('timeout');
    await retry.trigger('click');
    expect(wrapper!.emitted('retryCover')).toHaveLength(1);
  });

  it('uses the plain label without a cover error', () => {
    setup({ coverStatus: 'error' });
    expect(wrapper!.get('[data-testid="download-retry-cover"]').attributes('title')).toBe(
      'downloads.coverRetry'
    );
  });

  it('offers login for auth-required errors', async () => {
    setup({ status: 'error', errorCode: 'auth-required' });
    const login = wrapper!
      .findAll('button')
      .find((button) => button.text().includes('downloads.login'))!;

    await login.trigger('click');
    expect(state.invoke).toHaveBeenCalledWith('yt:login');
  });
});

describe('actions', () => {
  it('forwards row events', async () => {
    setup();

    await wrapper!.get('[data-testid="action-play"]').trigger('click');
    await wrapper!.get('[data-testid="action-edit"]').trigger('click');
    await wrapper!.get('[data-testid="action-library"]').trigger('click');

    expect(wrapper!.emitted('play')).toHaveLength(1);
    expect(wrapper!.emitted('editMeta')).toHaveLength(1);
    expect(wrapper!.emitted('openLibrary')).toHaveLength(1);
  });

  it('cancels only after confirmation', async () => {
    setup();
    await wrapper!.get('[data-testid="action-cancel"]').trigger('click');

    expect(state.showConfirm).toHaveBeenCalledWith('downloads.cancelConfirm');
    expect(state.cancelDownload).toHaveBeenCalledWith('task-1');
  });

  it('keeps the task when cancellation is refused', async () => {
    state.showConfirm.mockResolvedValue(false);
    setup();

    await wrapper!.get('[data-testid="action-cancel"]').trigger('click');

    expect(state.cancelDownload).not.toHaveBeenCalled();
  });
});

describe('context menu', () => {
  function context() {
    const event = new MouseEvent('contextmenu');
    row().element.dispatchEvent(event);
    return state.openMenu.mock.calls[0][1];
  }

  it('opens with row callbacks', () => {
    setup({ outputPath: 'C:/out/file.mp4' });
    const event = new MouseEvent('contextmenu');
    row().element.dispatchEvent(event);

    expect(state.openMenu).toHaveBeenCalledWith(event, expect.any(Object));
  });

  it('wires play, edit and library callbacks', () => {
    setup();
    const ctx = context();

    ctx.onPlay();
    ctx.onEditMeta();
    ctx.onOpenLibrary();

    expect(wrapper!.emitted('play')).toHaveLength(1);
    expect(wrapper!.emitted('editMeta')).toHaveLength(1);
    expect(wrapper!.emitted('openLibrary')).toHaveLength(1);
  });

  it('opens folders and copies text through the bridge', () => {
    setup();
    const ctx = context();

    ctx.onOpenFolder('C:/out/file.mp4');
    ctx.onCopyText('C:/out/file.mp4');
    ctx.onOpenFolder();
    ctx.onCopyText();

    expect(state.invoke).toHaveBeenCalledWith('shell:showItemInFolder', 'C:/out/file.mp4');
    expect(state.invoke).toHaveBeenCalledWith('fs:copyPath', 'C:/out/file.mp4');
    expect(state.invoke).toHaveBeenCalledTimes(2);
  });

  it('confirms before cancelling', async () => {
    setup();
    const ctx = context();

    ctx.onCancel();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(state.cancelDownload).toHaveBeenCalledWith('task-1');
  });
});

describe('confirmation dialog', () => {
  it('binds the prompt state and forwards events', async () => {
    state.prompt.promptVisible.value = true;
    state.prompt.promptMessage.value = 'Sure?';
    setup();

    const dialog = wrapper!.getComponent(PromptStub);
    expect(dialog.props()).toMatchObject({ visible: true, message: 'Sure?' });

    await wrapper!.get('[data-testid="prompt-confirm"]').trigger('click');
    await wrapper!.get('[data-testid="prompt-cancel"]').trigger('click');
    await wrapper!.get('[data-testid="prompt-input"]').trigger('click');

    expect(state.prompt.promptConfirm).toHaveBeenCalledTimes(1);
    expect(state.prompt.promptCancel).toHaveBeenCalledTimes(1);
    expect(state.prompt.promptValue.value).toBe('typed');
  });
});
