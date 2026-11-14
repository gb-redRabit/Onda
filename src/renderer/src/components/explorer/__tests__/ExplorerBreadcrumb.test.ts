import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick, reactive } from 'vue';

const state = vi.hoisted(() => ({
  explorer: null as any,
  settings: null as any,
  segments: [] as Array<{ path: string; part: string; idx: number }>,
  buildSegments: vi.fn(),
  t: vi.fn((key: string) => key),
  showConfirm: vi.fn(),
  invoke: vi.fn(),
  send: vi.fn()
}));

vi.mock('@renderer/stores/explorer', () => ({ useExplorerStore: () => state.explorer }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('../segments', () => ({ buildSegments: state.buildSegments }));

import ExplorerBreadcrumb from '../ExplorerBreadcrumb.vue';

let wrapper: VueWrapper | null = null;

function setup(provideConfirm = true) {
  wrapper = mount(ExplorerBreadcrumb, {
    global: {
      mocks: { $t: (key: string) => key },
      provide: provideConfirm ? { showConfirm: state.showConfirm } : {}
    }
  });
  return wrapper;
}

function buttonByName(name: string) {
  return wrapper!.findAll('button').find((button) => button.attributes('aria-label') === name)!;
}

function crumb(idx: number) {
  return wrapper!.get(`[data-testid="explorer-crumb-${idx}"]`);
}

function drag(type: string, options: { dataTransfer?: unknown; ctrlKey?: boolean } = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: 'dataTransfer' in options ? options.dataTransfer : null
  });
  Object.defineProperty(event, 'ctrlKey', { value: options.ctrlKey ?? false });
  Object.defineProperty(event, 'metaKey', { value: false });
  return event;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  state.explorer = reactive({
    currentPath: 'C:\\Music',
    canGoBack: true,
    canGoForward: false,
    canGoUp: true,
    goBack: vi.fn(),
    goForward: vi.fn(),
    goUp: vi.fn(),
    navigateTo: vi.fn(),
    loadFiles: vi.fn()
  });
  state.settings = { explorer: reactive({ confirmBeforeMove: false }) };
  state.segments = [
    { path: 'C:', part: 'C:', idx: 0 },
    { path: 'C:\\Music', part: 'Music', idx: 1 }
  ];
  state.buildSegments.mockReset();
  state.buildSegments.mockImplementation(() => state.segments);
  state.t.mockClear();
  state.showConfirm.mockReset();
  state.showConfirm.mockResolvedValue(true);
  state.invoke.mockReset();
  state.invoke.mockResolvedValue(undefined);
  state.send.mockReset();
  (window as unknown as { api?: unknown }).api = {
    invoke: state.invoke,
    send: state.send
  };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  delete (window as unknown as { api?: unknown }).api;
  vi.restoreAllMocks();
});

describe('navigation buttons', () => {
  it('reflects history availability and forwards clicks', async () => {
    setup();

    expect(buttonByName('explorer.back').attributes('disabled')).toBeUndefined();
    expect(buttonByName('explorer.forward').attributes('disabled')).toBeDefined();
    expect(buttonByName('explorer.up').attributes('disabled')).toBeUndefined();

    await buttonByName('explorer.back').trigger('click');
    await buttonByName('explorer.up').trigger('click');

    expect(state.explorer.goBack).toHaveBeenCalledTimes(1);
    expect(state.explorer.goUp).toHaveBeenCalledTimes(1);
  });

  it('forwards the forward button when history allows it', async () => {
    state.explorer.canGoForward = true;
    setup();

    await buttonByName('explorer.forward').trigger('click');

    expect(state.explorer.goForward).toHaveBeenCalledTimes(1);
  });
});

describe('crumbs', () => {
  it('shows the computer root for an empty path', () => {
    state.explorer.currentPath = '';
    setup();

    expect(wrapper!.text()).toContain('explorer.thisComputer');
    expect(wrapper!.findAll('[data-testid^="explorer-crumb-"]')).toHaveLength(0);
  });

  it('renders segments and navigates on click', async () => {
    setup();

    expect(state.buildSegments).toHaveBeenCalledWith('C:\\Music');
    expect(crumb(0).text()).toBe('C:');
    expect(crumb(1).text()).toBe('Music');
    expect(wrapper!.text()).toContain('\\');

    await crumb(1).trigger('click');
    expect(state.explorer.navigateTo).toHaveBeenCalledWith('C:\\Music');

    await buttonByName('explorer.home').trigger('click');
    expect(state.explorer.navigateTo).toHaveBeenCalledWith('');
  });
});

describe('drag highlighting', () => {
  it('marks the hovered crumb and sets the drop effect', async () => {
    setup();
    const dt = { dropEffect: '' };

    crumb(1).element.dispatchEvent(drag('dragover', { dataTransfer: dt }));
    await nextTick();
    expect(crumb(1).classes()).toContain('ring-2');
    expect(dt.dropEffect).toBe('move');

    crumb(0).element.dispatchEvent(drag('dragover', { dataTransfer: dt, ctrlKey: true }));
    await nextTick();
    expect(crumb(0).classes()).toContain('ring-2');
    expect(crumb(1).classes()).not.toContain('ring-2');
    expect(dt.dropEffect).toBe('copy');
  });

  it('tracks nested drag enters and leaves', async () => {
    setup();

    crumb(1).element.dispatchEvent(drag('dragenter'));
    crumb(1).element.dispatchEvent(drag('dragenter'));
    await nextTick();
    expect(crumb(1).classes()).toContain('ring-2');

    crumb(1).element.dispatchEvent(drag('dragleave'));
    await nextTick();
    expect(crumb(1).classes()).toContain('ring-2');

    crumb(1).element.dispatchEvent(drag('dragleave'));
    await nextTick();
    expect(crumb(1).classes()).not.toContain('ring-2');

    crumb(1).element.dispatchEvent(drag('dragleave'));
    await nextTick();
    expect(crumb(1).classes()).not.toContain('ring-2');
  });

  it('highlights the computer root and tolerates a missing dataTransfer', async () => {
    setup();
    const home = buttonByName('explorer.home');
    const dt = { dropEffect: '' };

    home.element.dispatchEvent(drag('dragover', { dataTransfer: dt, ctrlKey: true }));
    home.element.dispatchEvent(drag('dragenter'));
    await nextTick();
    expect(home.classes()).toContain('ring-2');
    expect(dt.dropEffect).toBe('copy');

    const noData = drag('dragover', { dataTransfer: null });
    const prevent = vi.spyOn(noData, 'preventDefault');
    home.element.dispatchEvent(noData);
    await nextTick();
    expect(prevent).toHaveBeenCalled();
    expect(home.classes()).toContain('ring-2');
  });
});

describe('dropping files', () => {
  it('moves files by default and refreshes the explorer', async () => {
    setup();
    const dt = { getData: vi.fn(() => 'a\nb') };

    crumb(1).element.dispatchEvent(drag('drop', { dataTransfer: dt }));
    await flush();

    expect(dt.getData).toHaveBeenCalledWith('text/plain');
    expect(state.invoke).toHaveBeenCalledWith('fs:move', ['a', 'b'], 'C:\\Music');
    expect(state.explorer.loadFiles).toHaveBeenCalledWith('C:\\Music');
    expect(state.send).toHaveBeenCalledWith('explorer:refreshAll');
    expect(crumb(1).classes()).not.toContain('ring-2');
  });

  it('copies with the control modifier', async () => {
    setup();
    const dt = { getData: vi.fn(() => 'a') };

    crumb(1).element.dispatchEvent(drag('drop', { dataTransfer: dt, ctrlKey: true }));
    await flush();

    expect(state.invoke).toHaveBeenCalledWith('fs:copy', ['a'], 'C:\\Music');
  });

  it('asks before moving when configured', async () => {
    state.settings.explorer.confirmBeforeMove = true;
    setup();
    const dt = { getData: vi.fn(() => 'a\nb') };

    crumb(1).element.dispatchEvent(drag('drop', { dataTransfer: dt }));
    await flush();

    expect(state.t).toHaveBeenCalledWith('explorer.moveConfirm', { n: 2, dir: 'Music' });
    expect(state.showConfirm).toHaveBeenCalledWith('explorer.moveConfirm');
    expect(state.invoke).toHaveBeenCalledWith('fs:move', ['a', 'b'], 'C:\\Music');
  });

  it('uses the copy wording with the control modifier', async () => {
    state.settings.explorer.confirmBeforeMove = true;
    setup();
    const dt = { getData: vi.fn(() => 'a') };

    crumb(1).element.dispatchEvent(drag('drop', { dataTransfer: dt, ctrlKey: true }));
    await flush();

    expect(state.t).toHaveBeenCalledWith('explorer.copyConfirm', { n: 1, dir: 'Music' });
  });

  it('aborts when the confirmation is refused', async () => {
    state.settings.explorer.confirmBeforeMove = true;
    state.showConfirm.mockResolvedValue(false);
    setup();
    const dt = { getData: vi.fn(() => 'a') };

    crumb(1).element.dispatchEvent(drag('drop', { dataTransfer: dt }));
    await flush();

    expect(state.invoke).not.toHaveBeenCalled();
    expect(state.explorer.loadFiles).not.toHaveBeenCalled();
    expect(state.send).not.toHaveBeenCalled();
  });

  it('ignores empty payloads and drops onto the computer root', async () => {
    setup();
    crumb(1).element.dispatchEvent(drag('drop', { dataTransfer: { getData: vi.fn(() => '') } }));
    await flush();
    expect(state.invoke).not.toHaveBeenCalled();

    buttonByName('explorer.home').element.dispatchEvent(
      drag('drop', { dataTransfer: { getData: vi.fn(() => 'a') } })
    );
    await flush();
    expect(state.invoke).toHaveBeenCalledWith('fs:move', ['a'], '');
  });

  it('handles a missing dataTransfer', async () => {
    setup();
    crumb(1).element.dispatchEvent(drag('drop', { dataTransfer: null }));
    await flush();
    expect(state.invoke).not.toHaveBeenCalled();
  });

  it('falls back to window.confirm without an injection', async () => {
    state.settings.explorer.confirmBeforeMove = true;
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    setup(false);
    const dt = { getData: vi.fn(() => 'a') };

    crumb(1).element.dispatchEvent(drag('drop', { dataTransfer: dt }));
    await flush();

    expect(confirm).toHaveBeenCalledWith('explorer.moveConfirm');
    expect(state.invoke).toHaveBeenCalledWith('fs:move', ['a'], 'C:\\Music');
  });

  it('confirms a drop onto the computer root with an empty directory label', async () => {
    state.settings.explorer.confirmBeforeMove = true;
    setup();
    const dt = { getData: vi.fn(() => 'a') };

    buttonByName('explorer.home').element.dispatchEvent(drag('drop', { dataTransfer: dt }));
    await flush();

    expect(state.t).toHaveBeenCalledWith('explorer.moveConfirm', { n: 1, dir: '' });
    expect(state.invoke).toHaveBeenCalledWith('fs:move', ['a'], '');
  });
});
