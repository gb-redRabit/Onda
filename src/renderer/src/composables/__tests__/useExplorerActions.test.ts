import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileItem } from '@renderer/types/explorer';

// Akcje Eksploratora: mostek i budowa MediaFile są podstawione.
const state = vi.hoisted(() => ({
  invoke: vi.fn(),
  send: vi.fn(),
  grantMediaAccess: vi.fn(async () => true),
  buildMediaFile: vi.fn((input: Record<string, unknown>) => ({
    ...input,
    type: input.extension === '.mp4' ? 'video' : input.extension === '.jpg' ? 'image' : 'audio'
  })),
  t: vi.fn((key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key
  )
}));

vi.mock('@renderer/utils/explorerMedia', () => ({ buildMediaFile: state.buildMediaFile }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));

const { useExplorerActions } = await import('../useExplorerActions');

function item(name: string, overrides: Partial<FileItem> = {}): FileItem {
  const extension = `.${name.split('.').pop()}`;
  return {
    name,
    path: `/dir/${name}`,
    extension,
    size: 10,
    mimeType: 'audio/mpeg',
    isDirectory: false,
    ...overrides
  } as FileItem;
}

const files = [
  item('a.mp3'),
  item('b.jpg'),
  item('c.mp4'),
  item('folder', { extension: undefined, isDirectory: true })
];

function setup(overrides: Record<string, unknown> = {}) {
  const selectedFiles = new Set<string>();
  const explorer = {
    selectedFiles,
    currentPath: '/dir',
    navigateTo: vi.fn(),
    loadFiles: vi.fn(),
    clearSelection: vi.fn(() => selectedFiles.clear())
  };
  const fileClipboard = {
    items: [] as Array<{ path: string }>,
    action: null as 'copy' | 'cut' | null,
    setClipboard: vi.fn(),
    clear: vi.fn()
  };
  const player = { setTrack: vi.fn(), addToQueue: vi.fn() };
  const router = { push: vi.fn() };
  const ui = { notify: vi.fn() };
  const ctx = {
    explorer,
    fileClipboard,
    player,
    ui,
    t: state.t,
    router,
    filteredFiles: { value: files },
    showPrompt: vi.fn(async (): Promise<string | null> => null),
    showConfirm: vi.fn(async (): Promise<boolean> => false),
    openImageViewer: vi.fn(),
    openProperties: vi.fn(),
    openInWindow: vi.fn(),
    ...overrides
  };
  const actions = useExplorerActions(ctx as never);
  return { actions, ...ctx };
}

function key(keyName: string, overrides: Record<string, unknown> = {}): KeyboardEvent {
  const preventDefault = vi.fn();
  return {
    key: keyName,
    target: { tagName: 'DIV' },
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    preventDefault,
    ...overrides
  } as unknown as KeyboardEvent;
}

beforeEach(() => {
  state.invoke.mockReset();
  state.invoke.mockResolvedValue(undefined);
  state.grantMediaAccess.mockClear();
  state.send.mockReset();
  state.buildMediaFile.mockClear();
  state.t.mockClear();
  (window as { api?: unknown }).api = {
    invoke: state.invoke,
    send: state.send,
    grantMediaAccess: state.grantMediaAccess
  };
});

describe('playItem', () => {
  it('navigates into directories', async () => {
    const { actions, explorer, player } = setup();
    await actions.playItem(item('folder', { isDirectory: true, extension: undefined }));
    expect(explorer.navigateTo).toHaveBeenCalledWith('/dir/folder');
    expect(player.setTrack).not.toHaveBeenCalled();
  });

  it('opens image items in the viewer', async () => {
    const { actions, openImageViewer } = setup();
    await actions.playItem(item('b.jpg'));
    expect(openImageViewer).toHaveBeenCalledWith(1);
  });

  it('plays audio without navigation', async () => {
    const { actions, player, router } = setup();
    await actions.playItem(item('a.mp3'));

    expect(player.setTrack).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/dir/a.mp3', type: 'audio' })
    );
    expect(router.push).not.toHaveBeenCalled();
  });

  it('grants media access and opens the player for video', async () => {
    const { actions, player, router } = setup();
    await actions.playItem(item('c.mp4'));

    expect(state.grantMediaAccess).toHaveBeenCalledWith('/dir/c.mp4');
    expect(router.push).toHaveBeenCalledWith('/player');
    expect(player.setTrack).toHaveBeenCalledWith(expect.objectContaining({ type: 'video' }));
  });

  it('ignores unsupported items', async () => {
    const { actions, player } = setup();
    await actions.playItem(item('file.txt'));
    expect(player.setTrack).not.toHaveBeenCalled();
  });
});

describe('queue and selection', () => {
  it('queues media only', () => {
    const { actions, player } = setup();
    actions.addToQueueItem(item('a.mp3'));
    actions.addToQueueItem(item('file.txt'));
    actions.addToQueueItem(item('no-ext', { extension: undefined }));

    expect(player.addToQueue).toHaveBeenCalledTimes(1);
  });

  it('copies and cuts selected paths', () => {
    const { actions, explorer, fileClipboard } = setup();
    explorer.selectedFiles.add('/dir/a.mp3');
    explorer.selectedFiles.add('/dir/b.jpg');

    actions.copySelectedPaths();
    expect(fileClipboard.setClipboard).toHaveBeenCalledWith(['/dir/a.mp3', '/dir/b.jpg'], 'copy');

    actions.cutSelectedPaths();
    expect(fileClipboard.setClipboard).toHaveBeenLastCalledWith(
      ['/dir/a.mp3', '/dir/b.jpg'],
      'cut'
    );
  });

  it('does not touch the clipboard without a selection', () => {
    const { actions, fileClipboard } = setup();
    actions.copySelectedPaths();
    actions.cutSelectedPaths();
    expect(fileClipboard.setClipboard).not.toHaveBeenCalled();
  });
});

describe('deleting', () => {
  it('does nothing without selected files', async () => {
    const { actions, showConfirm } = setup();
    await actions.deleteSelected();
    expect(showConfirm).not.toHaveBeenCalled();
  });

  it('confirms a single deletion and reloads the folder', async () => {
    const { actions, explorer, showConfirm } = setup();
    explorer.selectedFiles.add('/dir/a.mp3');
    showConfirm.mockResolvedValue(true);

    await actions.deleteSelected();

    expect(showConfirm).toHaveBeenCalledWith(expect.stringContaining('explorer.deleteConfirm'));
    expect(state.invoke).toHaveBeenCalledWith('fs:delete', '/dir/a.mp3');
    expect(explorer.loadFiles).toHaveBeenCalledWith('/dir');
  });

  it('confirms multiple deletions and stops when canceled', async () => {
    const { actions, explorer, showConfirm } = setup();
    explorer.selectedFiles.add('/dir/a.mp3');
    explorer.selectedFiles.add('/dir/b.jpg');

    await actions.deleteSelected();
    expect(showConfirm).toHaveBeenCalledWith(
      expect.stringContaining('explorer.deleteMultipleConfirm')
    );
    expect(state.invoke).not.toHaveBeenCalled();

    showConfirm.mockResolvedValue(true);
    await actions.deleteSelected();
    expect(state.invoke).toHaveBeenCalledTimes(2);
  });

  it('deletes one item after confirmation', async () => {
    const { actions, explorer, showConfirm } = setup();
    showConfirm.mockResolvedValue(true);

    await actions.deleteItem(item('a.mp3'));

    expect(state.invoke).toHaveBeenCalledWith('fs:delete', '/dir/a.mp3');
    expect(explorer.loadFiles).toHaveBeenCalled();
  });
});

describe('renaming', () => {
  it('renames the selected file', async () => {
    const { actions, explorer, showPrompt } = setup();
    explorer.selectedFiles.add('/dir/a.mp3');
    showPrompt.mockResolvedValue('renamed.mp3');

    await actions.renameSelected();

    expect(showPrompt).toHaveBeenCalledWith(expect.stringContaining('explorer.rename'), 'a.mp3');
    expect(state.invoke).toHaveBeenCalledWith('media:renameFile', '/dir/a.mp3', 'renamed.mp3');
    expect(explorer.loadFiles).toHaveBeenCalled();
  });

  it('ignores missing selection and unchanged names', async () => {
    const { actions, showPrompt } = setup();

    await actions.renameSelected();
    expect(showPrompt).not.toHaveBeenCalled();

    showPrompt.mockResolvedValue('a.mp3');
    await actions.renameItem(item('a.mp3'));
    expect(state.invoke).not.toHaveBeenCalled();
  });
});

describe('paste', () => {
  it('does nothing without clipboard items or a target folder', async () => {
    const { actions, explorer, fileClipboard } = setup();
    await actions.pasteClipboard();
    expect(state.invoke).not.toHaveBeenCalled();

    fileClipboard.items = [{ path: '/x' }];
    fileClipboard.action = 'copy';
    explorer.currentPath = '';
    await actions.pasteClipboard();
    expect(state.invoke).not.toHaveBeenCalled();
  });

  it('copies files without clearing the clipboard', async () => {
    const { actions, explorer, fileClipboard } = setup();
    fileClipboard.items = [{ path: '/x/a' }, { path: '/x/b' }];
    fileClipboard.action = 'copy';

    await actions.pasteClipboard();

    expect(state.invoke).toHaveBeenCalledWith('fs:copy', ['/x/a', '/x/b'], '/dir');
    expect(fileClipboard.clear).not.toHaveBeenCalled();
    expect(explorer.loadFiles).toHaveBeenCalledWith('/dir');
    expect(state.send).toHaveBeenCalledWith('explorer:refreshAll');
  });

  it('moves files and clears the clipboard', async () => {
    const { actions, fileClipboard } = setup();
    fileClipboard.items = [{ path: '/x/a' }];
    fileClipboard.action = 'cut';

    await actions.pasteClipboard();

    expect(state.invoke).toHaveBeenCalledWith('fs:move', ['/x/a'], '/dir');
    expect(fileClipboard.clear).toHaveBeenCalled();
  });
});

describe('keyboard shortcuts', () => {
  it('ignores inputs and textareas', () => {
    const { actions, explorer } = setup();
    actions.onKeydown(key('Escape', { target: { tagName: 'INPUT' } }));
    actions.onKeydown(key('Escape', { target: { tagName: 'TEXTAREA' } }));
    expect(explorer.clearSelection).not.toHaveBeenCalled();
  });

  it('clears selection on Escape', () => {
    const { actions, explorer } = setup();
    actions.onKeydown(key('Escape'));
    expect(explorer.clearSelection).toHaveBeenCalled();
  });

  it('deletes on Delete', async () => {
    const { actions, explorer, showConfirm } = setup();
    explorer.selectedFiles.add('/dir/a.mp3');
    showConfirm.mockResolvedValue(true);

    actions.onKeydown(key('Delete'));
    await vi.waitFor(() => expect(state.invoke).toHaveBeenCalled());
  });

  it('renames on F2', async () => {
    const { actions, explorer, showPrompt } = setup();
    explorer.selectedFiles.add('/dir/a.mp3');
    showPrompt.mockResolvedValue('b.mp3');
    const event = key('F2');

    actions.onKeydown(event);
    await vi.waitFor(() => expect(state.invoke).toHaveBeenCalled());

    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('opens properties with Alt+Enter', () => {
    const { actions, explorer, openProperties } = setup();
    explorer.selectedFiles.add('/dir/a.mp3');
    const event = key('Enter', { altKey: true });

    actions.onKeydown(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(openProperties).toHaveBeenCalledWith(files[0]);
  });

  it('enters the selection on Enter', () => {
    const { actions, explorer, player } = setup();
    explorer.selectedFiles.add('/dir/a.mp3');

    actions.onKeydown(key('Enter'));

    expect(player.setTrack).toHaveBeenCalled();
  });

  it('selects all with Ctrl+A', () => {
    const { actions, explorer } = setup();
    const event = key('a', { ctrlKey: true });

    actions.onKeydown(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(explorer.clearSelection).toHaveBeenCalled();
    expect([...explorer.selectedFiles]).toEqual(files.map((f) => f.path));
  });

  it('handles copy, cut and paste shortcuts', async () => {
    const { actions, explorer, fileClipboard } = setup();
    explorer.selectedFiles.add('/dir/a.mp3');

    actions.onKeydown(key('c', { ctrlKey: true }));
    expect(fileClipboard.setClipboard).toHaveBeenCalledWith(['/dir/a.mp3'], 'copy');

    actions.onKeydown(key('x', { metaKey: true }));
    expect(fileClipboard.setClipboard).toHaveBeenLastCalledWith(['/dir/a.mp3'], 'cut');

    fileClipboard.items = [{ path: '/dir/a.mp3' }];
    fileClipboard.action = 'copy';
    actions.onKeydown(key('v', { ctrlKey: true }));
    await vi.waitFor(() => expect(state.invoke).toHaveBeenCalled());
  });

  it('opens a new window with Ctrl+Shift+N', () => {
    const { actions, openInWindow } = setup();
    const event = key('n', { ctrlKey: true, shiftKey: true });

    actions.onKeydown(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(openInWindow).toHaveBeenCalled();
  });

  it('ignores unrelated keys', () => {
    const { actions, explorer } = setup();
    actions.onKeydown(key('z'));
    expect(explorer.clearSelection).not.toHaveBeenCalled();
  });
});
