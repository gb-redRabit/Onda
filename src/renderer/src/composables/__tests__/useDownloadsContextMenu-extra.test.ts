import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  t: vi.fn((key: string) => key),
  open: vi.fn(),
  openAt: vi.fn(),
  online: null as any
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: h.t }) }));
vi.mock('../useContextMenu', () => ({
  useContextMenu: () => ({ open: h.open, openAt: h.openAt })
}));
vi.mock('@renderer/stores/online', () => ({ useOnlineStore: () => h.online }));

import { useDownloadsContextMenu } from '../useDownloadsContextMenu';

type Action = {
  label: string;
  when?: (ctx: unknown) => boolean;
  action?: (ctx: unknown) => void;
};

function context(status: string, over: Record<string, unknown> = {}) {
  return {
    task: {
      id: 't1',
      status,
      title: 'Task',
      outputPath: '/out/a.mp3',
      fileHash: 'hash',
      inLibrary: true,
      ...over
    },
    onPlay: vi.fn(),
    onOpenFolder: vi.fn(),
    onCopyText: vi.fn(),
    onEditMeta: vi.fn(),
    onOpenLibrary: vi.fn(),
    onCancel: vi.fn()
  } as never;
}

function actionsFor(ctx: unknown): Action[] {
  useDownloadsContextMenu().openMenu(new MouseEvent('contextmenu'), ctx as never);
  return h.open.mock.calls.at(-1)![1] as Action[];
}

beforeEach(() => {
  h.open.mockClear();
  h.openAt.mockClear();
  h.online = {
    resumeDownload: vi.fn(),
    cancelDownload: vi.fn(),
    retryDownload: vi.fn(),
    moveToFront: vi.fn(),
    move: vi.fn()
  };
});

describe('download menu action behavior', () => {
  it('plays completed downloads', () => {
    const ctx = context('completed');
    const play = actionsFor(ctx).find((a) => a.label === 'ctx.downloads.play')!;

    expect(play.when!(ctx)).toBe(true);
    play.action!(ctx);
    expect((ctx as { onPlay: ReturnType<typeof vi.fn> }).onPlay).toHaveBeenCalledWith(
      (ctx as { task: unknown }).task
    );
  });

  it('requires an output path to complete', () => {
    const ctx = context('completed', { outputPath: '' });
    const play = actionsFor(ctx).find((a) => a.label === 'ctx.downloads.play')!;

    expect(play.when!(ctx)).toBe(false);
  });

  it('resumes paused downloads', () => {
    const ctx = context('paused');
    const resume = actionsFor(ctx).find((a) => a.label === 'ctx.downloads.resume')!;

    expect(resume.when!(ctx)).toBe(true);
    resume.action!(ctx);
    expect(h.online.resumeDownload).toHaveBeenCalledWith('t1');
  });

  it('cancels active downloads directly or via confirmation', () => {
    const ctx = context('downloading');
    const cancel = actionsFor(ctx).find((a) => a.label === 'ctx.downloads.cancel')!;

    expect(cancel.when!(ctx)).toBe(true);
    cancel.action!(ctx);
    expect((ctx as { onCancel: ReturnType<typeof vi.fn> }).onCancel).toHaveBeenCalledTimes(1);

    const direct = context('pending');
    delete (direct as { onCancel?: unknown }).onCancel;
    actionsFor(direct).find((a) => a.label === 'ctx.downloads.cancel')!.action!(direct);
    expect(h.online.cancelDownload).toHaveBeenCalledWith('t1');
  });

  it('retries failed and cancelled downloads', () => {
    for (const status of ['error', 'cancelled']) {
      const ctx = context(status);
      const retry = actionsFor(ctx).find((a) => a.label === 'ctx.downloads.retry')!;

      expect(retry.when!(ctx)).toBe(true);
      retry.action!(ctx);
      expect(h.online.retryDownload).toHaveBeenCalledWith((ctx as { task: unknown }).task);
    }
  });

  it('reorders pending downloads', () => {
    const ctx = context('pending');
    const actions = actionsFor(ctx);

    for (const label of ['moveToFront', 'moveUp', 'moveDown']) {
      const action = actions.find((a) => a.label === `ctx.downloads.${label}`)!;
      expect(action.when!(ctx)).toBe(true);
      action.action!(ctx);
    }

    expect(h.online.moveToFront).toHaveBeenCalledWith('t1');
    expect(h.online.move).toHaveBeenCalledWith('t1', -1);
    expect(h.online.move).toHaveBeenCalledWith('t1', 1);
  });

  it('edits metadata and reveals completed files', () => {
    const ctx = context('completed');
    const actions = actionsFor(ctx);

    actions.find((a) => a.label === 'ctx.downloads.editMetadata')!.action!(ctx);
    expect((ctx as { onEditMeta: ReturnType<typeof vi.fn> }).onEditMeta).toHaveBeenCalledTimes(1);

    actions.find((a) => a.label === 'ctx.downloads.showInFolder')!.action!(ctx);
    expect((ctx as { onOpenFolder: ReturnType<typeof vi.fn> }).onOpenFolder).toHaveBeenCalledWith(
      '/out/a.mp3'
    );
  });

  it('opens the library and copies text', () => {
    const ctx = context('completed');
    const actions = actionsFor(ctx);

    actions.find((a) => a.label === 'ctx.downloads.openLibrary')!.action!(ctx);
    actions.find((a) => a.label === 'ctx.downloads.copyPath')!.action!(ctx);
    actions.find((a) => a.label === 'ctx.downloads.copyHash')!.action!(ctx);
    actions.find((a) => a.label === 'ctx.downloads.copyTitle')!.action!(ctx);

    expect((ctx as { onOpenLibrary: ReturnType<typeof vi.fn> }).onOpenLibrary).toHaveBeenCalled();
    const copy = (ctx as { onCopyText: ReturnType<typeof vi.fn> }).onCopyText;
    expect(copy).toHaveBeenCalledWith('/out/a.mp3');
    expect(copy).toHaveBeenCalledWith('hash');
    expect(copy).toHaveBeenCalledWith('Task');
  });

  it('hides optional actions without callbacks or data', () => {
    const ctx = context('completed', { inLibrary: false, outputPath: '', fileHash: '' });
    delete (ctx as { onOpenFolder?: unknown }).onOpenFolder;
    delete (ctx as { onEditMeta?: unknown }).onEditMeta;
    delete (ctx as { onOpenLibrary?: unknown }).onOpenLibrary;
    delete (ctx as { onCopyText?: unknown }).onCopyText;

    const actions = actionsFor(ctx);
    for (const label of [
      'editMetadata',
      'showInFolder',
      'openLibrary',
      'copyPath',
      'copyHash',
      'copyTitle'
    ]) {
      expect(actions.find((a) => a.label === `ctx.downloads.${label}`)!.when!(ctx)).toBe(false);
    }

    const libraryWithoutCallback = context('completed');
    delete (libraryWithoutCallback as { onOpenLibrary?: unknown }).onOpenLibrary;
    const libraryAction = actionsFor(libraryWithoutCallback).find(
      (a) => a.label === 'ctx.downloads.openLibrary'
    )!;
    expect(libraryAction.when!(libraryWithoutCallback)).toBe(false);
  });

  it('copies empty values when paths are missing', () => {
    const ctx = context('completed', { outputPath: undefined, fileHash: undefined });
    const actions = actionsFor(ctx);
    const copy = (ctx as { onCopyText: ReturnType<typeof vi.fn> }).onCopyText;

    actions.find((a) => a.label === 'ctx.downloads.copyPath')!.action!(ctx);
    actions.find((a) => a.label === 'ctx.downloads.copyHash')!.action!(ctx);

    expect(copy).toHaveBeenCalledWith('');
  });

  it('opens at a target element', () => {
    const ctx = context('pending');
    const target = document.createElement('button');

    useDownloadsContextMenu().openMenuAt(target, ctx);

    expect(h.openAt).toHaveBeenCalledWith(target, expect.any(Array), ctx);
  });
});
