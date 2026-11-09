import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  options: null as any,
  guard: null as any,
  push: vi.fn(),
  switchTo: vi.fn()
}));

vi.mock('vue-router', () => ({
  createRouter: (options: any) => {
    state.options = options;
    return {
      beforeEach: (guard: any) => {
        state.guard = guard;
      },
      push: state.push
    };
  },
  createWebHashHistory: () => ({ mode: 'hash' })
}));
vi.mock('@renderer/modules/ModuleManager', () => ({
  moduleManager: { switchTo: state.switchTo }
}));

vi.mock('@renderer/views/HomeView.vue', () => ({
  default: { name: 'HomeView', render: () => null }
}));
vi.mock('@renderer/views/LibraryView.vue', () => ({
  default: { name: 'LibraryView', render: () => null }
}));
vi.mock('@renderer/views/ExplorerView.vue', () => ({
  default: { name: 'ExplorerView', render: () => null }
}));
vi.mock('@renderer/views/ExplorerWindowView.vue', () => ({
  default: { name: 'ExplorerWindowView', render: () => null }
}));
vi.mock('@renderer/views/ImageViewerWindowView.vue', () => ({
  default: { name: 'ImageViewerWindowView', render: () => null }
}));
vi.mock('@renderer/views/OnlineView.vue', () => ({
  default: { name: 'OnlineView', render: () => null }
}));
vi.mock('@renderer/views/WebcastView.vue', () => ({
  default: { name: 'WebcastView', render: () => null }
}));
vi.mock('@renderer/views/DownloadsView.vue', () => ({
  default: { name: 'DownloadsView', render: () => null }
}));
vi.mock('@renderer/views/SourcesView.vue', () => ({
  default: { name: 'SourcesView', render: () => null }
}));
vi.mock('@renderer/views/ToolsView.vue', () => ({
  default: { name: 'ToolsView', render: () => null }
}));
vi.mock('@renderer/views/tools/ConverterToolView.vue', () => ({
  default: { name: 'ConverterToolView', render: () => null }
}));
vi.mock('@renderer/views/tools/VideoClipperToolView.vue', () => ({
  default: { name: 'VideoClipperToolView', render: () => null }
}));
vi.mock('@renderer/views/tools/VideoConcatToolView.vue', () => ({
  default: { name: 'VideoConcatToolView', render: () => null }
}));
vi.mock('@renderer/views/tools/TagEditorToolView.vue', () => ({
  default: { name: 'TagEditorToolView', render: () => null }
}));
vi.mock('@renderer/views/tools/ImageStudioToolView.vue', () => ({
  default: { name: 'ImageStudioToolView', render: () => null }
}));
vi.mock('@renderer/views/tools/BatchImagesToolView.vue', () => ({
  default: { name: 'BatchImagesToolView', render: () => null }
}));
vi.mock('@renderer/views/tools/HistoryExportToolView.vue', () => ({
  default: { name: 'HistoryExportToolView', render: () => null }
}));
vi.mock('@renderer/views/SettingsView.vue', () => ({
  default: { name: 'SettingsView', render: () => null }
}));
vi.mock('@renderer/views/PlayerView.vue', () => ({
  default: { name: 'PlayerView', render: () => null }
}));
vi.mock('@renderer/views/AudioView.vue', () => ({
  default: { name: 'AudioView', render: () => null }
}));

async function load() {
  vi.resetModules();
  await import('../index');
  return state;
}

function route(name: string) {
  return { name } as never;
}

function deferred() {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  state.options = null;
  state.guard = null;
  state.push.mockReset();
  state.switchTo.mockReset();
  state.switchTo.mockResolvedValue(undefined);
});

describe('route table', () => {
  it('uses hash history', async () => {
    await load();
    expect(state.options.history).toEqual({ mode: 'hash' });
  });

  it('registers every main destination with metadata', async () => {
    await load();
    const routes = state.options.routes as any[];
    const byName = new Map(routes.filter((r) => r.name).map((r) => [r.name, r]));

    for (const name of [
      'home',
      'library',
      'explorer',
      'explorer-window',
      'image-viewer',
      'online',
      'webcast',
      'downloads',
      'sources',
      'tools',
      'tool-converter',
      'tool-video-clipper',
      'tool-video-concat',
      'tool-tag-editor',
      'tool-image-studio',
      'tool-batch-images',
      'tool-history-export',
      'settings',
      'player',
      'audio'
    ]) {
      expect(byName.has(name)).toBe(true);
    }

    expect(byName.get('library')!.meta).toEqual({ title: 'Library', icon: 'library' });
    expect(byName.get('audio')!.meta).toEqual({ title: 'Audio', icon: 'music' });
    expect(byName.get('image-viewer')!.meta).toBeUndefined();
  });

  it('keeps the legacy youtube redirect', async () => {
    await load();
    const redirect = (state.options.routes as any[]).find((r) => r.path === '/youtube');
    expect(redirect).toMatchObject({ redirect: '/online' });
  });

  it('lazy-loads every view', async () => {
    await load();
    for (const routeDef of state.options.routes as any[]) {
      if (routeDef.redirect) continue;
      expect(typeof routeDef.component).toBe('function');
      const module = await routeDef.component();
      expect(module.default).toBeTruthy();
    }
  });
});

describe('navigation guard', () => {
  it('allows unmapped routes without switching modules', async () => {
    await load();

    await expect(state.guard(route('image-viewer'))).resolves.toBe(true);
    expect(state.switchTo).not.toHaveBeenCalled();
  });

  it('maps route names to modules', async () => {
    await load();

    await expect(state.guard(route('library'))).resolves.toBe(true);
    expect(state.switchTo).toHaveBeenCalledWith('library');

    await state.guard(route('webcast'));
    expect(state.switchTo).toHaveBeenLastCalledWith('online');

    await state.guard(route('audio'));
    expect(state.switchTo).toHaveBeenLastCalledWith('player');
  });

  it('defers navigation requested during a switch', async () => {
    await load();
    const pending = deferred();
    state.switchTo.mockReturnValueOnce(pending.promise);

    const first = state.guard(route('library'));
    expect(state.switchTo).toHaveBeenCalledTimes(1);

    await expect(state.guard(route('webcast'))).resolves.toBe(false);
    pending.resolve();
    await expect(first).resolves.toBe(true);

    expect(state.push).toHaveBeenCalledWith({ name: 'webcast' });
  });

  it('does not redirect when the pending route matches', async () => {
    await load();
    const pending = deferred();
    state.switchTo.mockReturnValueOnce(pending.promise);

    const first = state.guard(route('library'));
    await state.guard(route('library'));
    pending.resolve();
    await first;

    expect(state.push).not.toHaveBeenCalled();
  });

  it('clears pending state after a normal switch', async () => {
    await load();

    await state.guard(route('home'));
    await state.guard(route('settings'));

    expect(state.push).not.toHaveBeenCalled();
    expect(state.switchTo).toHaveBeenLastCalledWith('settings');
  });

  it('recovers after a failed module switch', async () => {
    await load();
    state.switchTo.mockRejectedValueOnce(new Error('missing chunk'));

    await expect(state.guard(route('tools'))).rejects.toThrow('missing chunk');

    await expect(state.guard(route('tools'))).resolves.toBe(true);
    expect(state.switchTo).toHaveBeenCalledTimes(2);
  });
});
