import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  t: vi.fn((key: string) => key),
  droppedPaths: [] as string[],
  handleTabDrop: vi.fn(async () => false),
  explorer: {
    currentPath: 'D:/current',
    loadFiles: vi.fn()
  },
  settings: {
    explorer: { confirmBeforeMove: true }
  },
  invoke: vi.fn(async () => undefined),
  send: vi.fn()
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: h.t }) }));
vi.mock('@renderer/stores/explorer', () => ({ useExplorerStore: () => h.explorer }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => h.settings }));
vi.mock('@renderer/utils/fileDrag', () => ({
  getDroppedFilePaths: () => h.droppedPaths
}));
vi.mock('@renderer/utils/explorerTabDrop', () => ({ handleTabDrop: h.handleTabDrop }));

import { useExplorerDrop } from '../useExplorerDrop';

function event(overrides: Record<string, unknown> = {}) {
  return {
    preventDefault: vi.fn(),
    dataTransfer: null,
    ctrlKey: false,
    metaKey: false,
    target: null,
    relatedTarget: null,
    ...overrides
  } as unknown as DragEvent;
}

function dataTransfer(raw = '') {
  return { dropEffect: '', getData: vi.fn(() => raw) };
}

function folderTarget(path: string) {
  const el = document.createElement('div');
  el.setAttribute('data-folder-path', path);
  document.body.append(el);
  return el;
}

const showConfirm = vi.fn(async () => true);

beforeEach(() => {
  document.body.innerHTML = '';
  h.t.mockClear();
  h.droppedPaths = [];
  h.handleTabDrop.mockReset();
  h.handleTabDrop.mockResolvedValue(false);
  h.explorer.currentPath = 'D:/current';
  h.explorer.loadFiles.mockReset();
  h.settings.explorer.confirmBeforeMove = true;
  h.invoke.mockReset();
  h.invoke.mockResolvedValue(undefined);
  h.send.mockReset();
  showConfirm.mockReset();
  showConfirm.mockResolvedValue(true);
  (window as unknown as { api?: unknown }).api = { invoke: h.invoke, send: h.send };
});

describe('drag over', () => {
  it('tracks the hovered folder and drop effect', () => {
    const drop = useExplorerDrop(h.explorer as never, h.settings as never, showConfirm);
    const target = folderTarget('D:/target');
    const dt = dataTransfer();

    drop.onContentDragOver(event({ target, dataTransfer: dt, ctrlKey: true }));
    expect(dt.dropEffect).toBe('copy');
    expect(drop.hoveredFolderPath.value).toBe('D:/target');

    drop.onContentDragOver(event({ target, dataTransfer: dt }));
    expect(dt.dropEffect).toBe('move');
  });

  it('clears the hover when not over a folder', () => {
    const drop = useExplorerDrop(h.explorer as never, h.settings as never, showConfirm);
    drop.hoveredFolderPath.value = 'D:/old';

    drop.onContentDragOver(event({ target: document.createElement('span') }));

    expect(drop.hoveredFolderPath.value).toBeNull();
  });

  it('keeps the hover while moving inside the drop container', () => {
    const drop = useExplorerDrop(h.explorer as never, h.settings as never, showConfirm);
    const container = document.createElement('div');
    const child = document.createElement('span');
    container.append(child);
    drop.contentRef.value = container;
    drop.hoveredFolderPath.value = 'D:/target';

    drop.onContentDragLeave(event({ relatedTarget: child }));
    expect(drop.hoveredFolderPath.value).toBe('D:/target');

    drop.onContentDragLeave(event({ relatedTarget: document.body }));
    expect(drop.hoveredFolderPath.value).toBeNull();
  });

  it('clears the hover when leaving without a related target', () => {
    const drop = useExplorerDrop(h.explorer as never, h.settings as never, showConfirm);
    drop.hoveredFolderPath.value = 'D:/target';

    drop.onContentDragLeave(event());

    expect(drop.hoveredFolderPath.value).toBeNull();
  });
});

describe('drop', () => {
  it('lets tab drops win without moving files', async () => {
    h.handleTabDrop.mockResolvedValue(true);
    const drop = useExplorerDrop(h.explorer as never, h.settings as never, showConfirm);
    const e = event({ dataTransfer: dataTransfer('tab-data') });

    await drop.onContentDrop(e);

    expect(e.preventDefault).toHaveBeenCalled();
    expect(h.handleTabDrop).toHaveBeenCalledWith('tab-data');
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it('asks for confirmation and moves into the hovered folder', async () => {
    const drop = useExplorerDrop(h.explorer as never, h.settings as never, showConfirm);
    drop.hoveredFolderPath.value = 'D:/target';
    const e = event({ dataTransfer: dataTransfer('D:/a.mp3\nD:/b.mp3') });

    await drop.onContentDrop(e);

    expect(h.t).toHaveBeenCalledWith('explorer.moveConfirm', { n: 2, dir: 'D:/target' });
    expect(showConfirm).toHaveBeenCalledWith('explorer.moveConfirm');
    expect(h.invoke).toHaveBeenCalledWith('fs:move', ['D:/a.mp3', 'D:/b.mp3'], 'D:/target');
    expect(h.explorer.loadFiles).toHaveBeenCalledWith('D:/current');
    expect(h.send).toHaveBeenCalledWith('explorer:refreshAll');
    expect(drop.hoveredFolderPath.value).toBeNull();
  });

  it('copies with a modifier and falls back to the current path', async () => {
    const drop = useExplorerDrop(h.explorer as never, h.settings as never, showConfirm);
    const e = event({ dataTransfer: dataTransfer('D:/a.mp3'), ctrlKey: true });

    await drop.onContentDrop(e);

    expect(h.t).toHaveBeenCalledWith('explorer.copyConfirm', { n: 1, dir: 'D:/current' });
    expect(h.invoke).toHaveBeenCalledWith('fs:copy', ['D:/a.mp3'], 'D:/current');
  });

  it('honours metaKey as a copy modifier', async () => {
    const drop = useExplorerDrop(h.explorer as never, h.settings as never, showConfirm);
    const e = event({ dataTransfer: dataTransfer('D:/a.mp3'), metaKey: true });

    await drop.onContentDrop(e);

    expect(h.invoke).toHaveBeenCalledWith('fs:copy', ['D:/a.mp3'], 'D:/current');
  });

  it('aborts when the confirmation is declined', async () => {
    showConfirm.mockResolvedValue(false);
    const drop = useExplorerDrop(h.explorer as never, h.settings as never, showConfirm);

    await drop.onContentDrop(event({ dataTransfer: dataTransfer('D:/a.mp3') }));

    expect(h.invoke).not.toHaveBeenCalled();
    expect(h.explorer.loadFiles).not.toHaveBeenCalled();
  });

  it('skips confirmation when the setting is disabled', async () => {
    h.settings.explorer.confirmBeforeMove = false;
    const drop = useExplorerDrop(h.explorer as never, h.settings as never, showConfirm);

    await drop.onContentDrop(event({ dataTransfer: dataTransfer('D:/a.mp3') }));

    expect(showConfirm).not.toHaveBeenCalled();
    expect(h.invoke).toHaveBeenCalledWith('fs:move', ['D:/a.mp3'], 'D:/current');
  });

  it('falls back to the dropped file list when plain text is empty', async () => {
    h.droppedPaths = ['D:/from-drop.mp3'];
    const drop = useExplorerDrop(h.explorer as never, h.settings as never, showConfirm);

    await drop.onContentDrop(event({ dataTransfer: dataTransfer('') }));

    expect(h.invoke).toHaveBeenCalledWith('fs:move', ['D:/from-drop.mp3'], 'D:/current');
  });

  it('does nothing without paths', async () => {
    const drop = useExplorerDrop(h.explorer as never, h.settings as never, showConfirm);

    await drop.onContentDrop(event({ dataTransfer: dataTransfer('') }));

    expect(showConfirm).not.toHaveBeenCalled();
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it('works without a preload bridge', async () => {
    delete (window as unknown as { api?: unknown }).api;
    const drop = useExplorerDrop(h.explorer as never, h.settings as never, showConfirm);

    await expect(
      drop.onContentDrop(event({ dataTransfer: dataTransfer('D:/a.mp3') }))
    ).resolves.toBeUndefined();
    expect(h.explorer.loadFiles).toHaveBeenCalled();
  });
});
