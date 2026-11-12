import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';

const h = vi.hoisted(() => ({
  t: vi.fn((key: string) => key),
  yt: {
    pauseDownload: vi.fn(),
    resumeDownload: vi.fn(),
    retryDownload: vi.fn()
  },
  openMenuAt: vi.fn(),
  invoke: vi.fn()
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: h.t }) }));
vi.mock('@renderer/stores/online', () => ({ useOnlineStore: () => h.yt }));
vi.mock('@renderer/composables/useDownloadsContextMenu', () => ({
  useDownloadsContextMenu: () => ({ openMenuAt: h.openMenuAt })
}));

import DownloadRowActions from '../DownloadRowActions.vue';
import type { DownloadTask } from '@renderer/types/online';

const ButtonStub = {
  name: 'Button',
  props: ['label', 'title', 'variant', 'size'],
  emits: ['click'],
  template: '<button v-bind="$attrs" @click="$emit(\'click\', $event)"><slot /></button>'
};

let wrapper: VueWrapper | null = null;

function task(overrides: Record<string, unknown> = {}): DownloadTask {
  return {
    id: 'task-1',
    status: 'completed',
    outputPath: 'D:/Downloads/file.mp3',
    ...overrides
  } as never;
}

function mountActions(track: DownloadTask) {
  wrapper = mount(DownloadRowActions, {
    props: { task: track },
    global: { stubs: { Button: ButtonStub } }
  });
  return wrapper;
}

beforeEach(() => {
  h.t.mockClear();
  for (const fn of Object.values(h.yt)) fn.mockClear();
  h.openMenuAt.mockClear();
  h.invoke.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { ...window.api, invoke: h.invoke }
  });
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('completed downloads', () => {
  it('offers play and open-folder actions', async () => {
    mountActions(task());

    await wrapper!.get('[data-testid="download-action-play"]').trigger('click');
    await wrapper!.get('[data-testid="download-action-open-folder"]').trigger('click');

    expect(wrapper!.emitted('play')).toHaveLength(1);
    expect(h.invoke).toHaveBeenCalledWith('shell:showItemInFolder', 'D:/Downloads/file.mp3');
  });

  it('hides play actions without an output path', () => {
    mountActions(task({ outputPath: '' }));

    expect(wrapper!.find('[data-testid="download-action-play"]').exists()).toBe(false);
    expect(wrapper!.find('[data-testid="download-action-open-folder"]').exists()).toBe(false);
  });
});

describe('active downloads', () => {
  it('pauses a downloading task and cancels it', async () => {
    mountActions(task({ status: 'downloading' }));

    await wrapper!.get('[data-testid="download-action-pause"]').trigger('click');
    await wrapper!.get('[data-testid="download-action-cancel"]').trigger('click');

    expect(h.yt.pauseDownload).toHaveBeenCalledWith('task-1');
    expect(wrapper!.emitted('cancel')).toHaveLength(1);
  });

  it('resumes a paused task', async () => {
    mountActions(task({ status: 'paused' }));

    await wrapper!.get('[data-testid="download-action-resume"]').trigger('click');

    expect(h.yt.resumeDownload).toHaveBeenCalledWith('task-1');
  });

  it('offers cancellation for pending tasks only', () => {
    mountActions(task({ status: 'pending' }));

    expect(wrapper!.find('[data-testid="download-action-cancel"]').exists()).toBe(true);
    expect(wrapper!.find('[data-testid="download-action-pause"]').exists()).toBe(false);
    expect(wrapper!.find('[data-testid="download-action-resume"]').exists()).toBe(false);
  });
});

describe('failed downloads', () => {
  it('retries errors and cancellations without offering cancel', async () => {
    mountActions(task({ status: 'error' }));
    await wrapper!.get('[data-testid="download-action-retry"]').trigger('click');
    expect(h.yt.retryDownload).toHaveBeenCalledWith(expect.objectContaining({ id: 'task-1' }));
    expect(wrapper!.find('[data-testid="download-action-cancel"]').exists()).toBe(false);

    wrapper!.unmount();
    mountActions(task({ status: 'cancelled' }));
    expect(wrapper!.find('[data-testid="download-action-retry"]').exists()).toBe(true);
  });
});

describe('overflow menu', () => {
  it('opens the context menu with every callback wired', () => {
    mountActions(task());
    const menu = wrapper!.get('[data-testid="download-action-menu"]');
    menu.element.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(h.openMenuAt).toHaveBeenCalledWith(menu.element, expect.any(Object));
    const ctx = h.openMenuAt.mock.calls[0][1] as {
      task: DownloadTask;
      onPlay: () => void;
      onOpenFolder: (path?: string) => void;
      onCopyText: (text?: string) => void;
      onEditMeta: () => void;
      onOpenLibrary: () => void;
      onCancel: () => void;
    };

    expect(ctx.task).toMatchObject({ id: 'task-1' });
    ctx.onPlay();
    ctx.onEditMeta();
    ctx.onOpenLibrary();
    ctx.onCancel();
    ctx.onOpenFolder('D:/x.mp3');
    ctx.onCopyText('D:/y.mp3');
    ctx.onOpenFolder();
    ctx.onCopyText();

    expect(wrapper!.emitted('play')).toHaveLength(1);
    expect(wrapper!.emitted('editMeta')).toHaveLength(1);
    expect(wrapper!.emitted('openLibrary')).toHaveLength(1);
    expect(wrapper!.emitted('cancel')).toHaveLength(1);
    expect(h.invoke).toHaveBeenCalledWith('shell:showItemInFolder', 'D:/x.mp3');
    expect(h.invoke).toHaveBeenCalledWith('fs:copyPath', 'D:/y.mp3');
    expect(h.invoke).toHaveBeenCalledTimes(2);
  });
});
