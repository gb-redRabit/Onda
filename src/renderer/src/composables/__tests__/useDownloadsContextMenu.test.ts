import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

// Menu `⋯` i prawego przycisku korzystają z jednej listy akcji — test pilnuje
// warunków widoczności (status zadania) i tego, że anulowanie idzie przez
// potwierdzenie przekazane w kontekście.
const yt = vi.hoisted(() => ({
  cancelDownload: vi.fn(),
  resumeDownload: vi.fn(),
  retryDownload: vi.fn(),
  move: vi.fn(),
  moveToFront: vi.fn()
}));

vi.mock('@renderer/stores/online', () => ({ useOnlineStore: () => yt }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));

import { useDownloadsContextMenu } from '../useDownloadsContextMenu';
import { useUIStore } from '@renderer/stores/ui';
import type { DownloadTask } from '@renderer/types/online';

function task(overrides: Partial<DownloadTask>): DownloadTask {
  return {
    id: 't1',
    url: 'https://example.com/a',
    title: 'Song',
    kind: 'audio',
    format: 'best',
    quality: 'best',
    progress: 0,
    speed: '',
    eta: '',
    status: 'pending',
    startedAt: 0,
    coverStatus: 'none',
    ...overrides
  } as DownloadTask;
}

function anchor(): HTMLElement {
  return {
    getBoundingClientRect: () => ({ left: 100, right: 300, top: 40, bottom: 72, width: 200 })
  } as unknown as HTMLElement;
}

function ctxFor(t: DownloadTask, extra: Record<string, unknown> = {}) {
  return { task: t, onPlay: vi.fn(), onCopyText: vi.fn(), ...extra };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('useDownloadsContextMenu actions', () => {
  it('offers playback and details for a finished download', () => {
    const { openMenuAt } = useDownloadsContextMenu();
    const ui = useUIStore();
    openMenuAt(
      anchor(),
      ctxFor(task({ status: 'completed', outputPath: '/music/a.mp3', fileHash: 'abc' }), {
        onEditMeta: vi.fn(),
        onOpenFolder: vi.fn()
      })
    );
    const labels = ui.contextMenu?.items.map((i) => i.label);
    expect(labels).toContain('ctx.downloads.play');
    expect(labels).toContain('ctx.downloads.editMetadata');
    expect(labels).toContain('ctx.downloads.copyPath');
    expect(labels).toContain('ctx.downloads.copyHash');
    expect(labels).not.toContain('ctx.downloads.cancel');
    expect(labels).not.toContain('ctx.downloads.retry');
  });

  it('offers queue moves and cancel for a pending download', () => {
    const { openMenuAt } = useDownloadsContextMenu();
    const ui = useUIStore();
    openMenuAt(anchor(), ctxFor(task({ status: 'pending' })));
    const labels = ui.contextMenu?.items.map((i) => i.label);
    expect(labels).toContain('ctx.downloads.cancel');
    expect(labels).toContain('ctx.downloads.moveToFront');
    expect(labels).not.toContain('ctx.downloads.play');
  });

  it('hides the hash entry when the task has no checksum', () => {
    const { openMenuAt } = useDownloadsContextMenu();
    const ui = useUIStore();
    openMenuAt(anchor(), ctxFor(task({ status: 'completed', outputPath: '/a.mp3' })));
    expect(ui.contextMenu?.items.map((i) => i.label)).not.toContain('ctx.downloads.copyHash');
  });

  it('routes cancel through the caller confirmation when provided', () => {
    const { openMenuAt } = useDownloadsContextMenu();
    const ui = useUIStore();
    const onCancel = vi.fn();
    openMenuAt(anchor(), ctxFor(task({ status: 'downloading' }), { onCancel }));
    const cancel = ui.contextMenu?.items.find((i) => i.label === 'ctx.downloads.cancel');
    cancel?.action?.();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(yt.cancelDownload).not.toHaveBeenCalled();
  });

  it('cancels directly when no confirmation callback is given', () => {
    const { openMenuAt } = useDownloadsContextMenu();
    const ui = useUIStore();
    openMenuAt(anchor(), ctxFor(task({ status: 'downloading' })));
    ui.contextMenu?.items.find((i) => i.label === 'ctx.downloads.cancel')?.action?.();
    expect(yt.cancelDownload).toHaveBeenCalledWith('t1');
  });

  it('anchors the menu to the right edge of the trigger', () => {
    const { openMenuAt } = useDownloadsContextMenu();
    const ui = useUIStore();
    openMenuAt(anchor(), ctxFor(task({ status: 'pending' })));
    expect(ui.contextMenu?.x).toBe(300 - 230);
    expect(ui.contextMenu?.y).toBe(76);
  });
});
