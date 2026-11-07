import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';
import ProviderPanel from '../ProviderPanel.vue';

const state = vi.hoisted(() => ({
  store: null as any,
  subs: null as any,
  invoke: vi.fn(),
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/stores/providers', () => ({ useProvidersStore: () => state.store }));
vi.mock('@renderer/stores/providerSubs', () => ({ useProviderSubsStore: () => state.subs }));
vi.mock('@renderer/utils/formatters', () => ({
  formatFileSize: (bytes: number) => `${bytes}B`
}));
vi.mock('@renderer/utils/providerLabels', () => ({
  providerLabel: (_id: string, label: string) => label
}));

const EmptyStateStub = {
  props: ['title', 'description'],
  template: '<div>{{ title }}<slot /></div>'
};
const ProviderIconStub = { props: ['providerId', 'label', 'size'], template: '<span />' };
const OnlineButtonStub = { template: '<button><slot /></button>' };
const OnlineBadgeStub = { template: '<span><slot /></span>' };
const OnlineConfirmStub = {
  props: ['title', 'message', 'confirmText', 'cancelText'],
  emits: ['confirm', 'cancel'],
  template: '<div>{{ title }}|{{ message }}</div>'
};
const ModalShellStub = {
  props: ['visible'],
  emits: ['close', 'escape'],
  template: '<div><slot /></div>'
};

let wrapper: VueWrapper | null = null;

function detected(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mega',
    label: 'MEGA',
    ref: { shareId: 'share-1' },
    capabilities: { auth: 'cookie', anonymous: false, expiringLink: false },
    ...overrides
  };
}

function file(id: string, name: string, size = 100) {
  return { id, name, kind: 'file', size };
}

function folder(id: string, name: string) {
  return { id, name, kind: 'folder' };
}

function mountPanel() {
  wrapper = mount(ProviderPanel, {
    attachTo: document.body,
    global: {
      mocks: { $t: (key: string) => key },
      directives: { activate: {} },
      stubs: {
        EmptyState: EmptyStateStub,
        ProviderIcon: ProviderIconStub,
        OnlineButton: OnlineButtonStub,
        OnlineBadge: OnlineBadgeStub,
        OnlineConfirmDialog: OnlineConfirmStub,
        ModalShell: ModalShellStub
      }
    }
  });
  return wrapper;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
  await wrapper!.vm.$nextTick();
}

beforeEach(() => {
  state.store = reactive({
    detected: detected(),
    folders: [folder('f2', 'Zeta'), folder('f1', 'Alpha')],
    files: [file('b', 'small', 10), file('a', 'big', 1000)],
    items: [] as unknown[],
    crumbs: [{ id: 'root' }],
    url: 'https://mega.nz/file/abc',
    loading: false,
    error: '',
    openFolder: vi.fn(),
    loadFolder: vi.fn(async () => undefined),
    play: vi.fn(),
    download: vi.fn(),
    downloadFolder: vi.fn(async () => ({ found: 3, queued: 3, truncated: false })),
    downloadFolderById: vi.fn(async () => ({ found: 2, queued: 1, truncated: true })),
    isDownloaded: vi.fn(() => false)
  });
  state.store.items = [...state.store.folders, ...state.store.files];
  state.subs = {
    add: vi.fn(async () => true),
    isSubscribed: vi.fn(() => false)
  };
  state.invoke.mockReset();
  state.invoke.mockResolvedValue({ hasCookie: false });
  state.t.mockClear();
  (window as { api?: unknown }).api = { invoke: state.invoke };
  document.body.innerHTML = '';
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  delete (window as { api?: unknown }).api;
});

describe('empty and detected states', () => {
  it('shows supported providers without a detected link', () => {
    state.store.detected = null;
    mountPanel();
    expect(wrapper!.text()).toContain('providers.hintTitle');
    expect(wrapper!.text()).toContain('pikpak');
    expect(wrapper!.text()).toContain('direct');
  });

  it('shows detected provider, badges and subscription state', () => {
    state.store.detected = detected({
      capabilities: { auth: 'cookie', anonymous: true, expiringLink: true }
    });
    state.subs.isSubscribed.mockReturnValue(true);
    mountPanel();

    expect(wrapper!.text()).toContain('providers.anonymous');
    expect(wrapper!.text()).toContain('providers.expiring');
    expect(wrapper!.text()).toContain('providers.cookieMissing');
    expect(wrapper!.find('[data-testid="providers-subscribed"]').exists()).toBe(true);
    expect(wrapper!.find('[data-testid="providers-subscribe"]').exists()).toBe(false);
  });

  it('displays errors', () => {
    state.store.error = 'provider failed';
    mountPanel();
    expect(wrapper!.get('[data-testid="providers-error"]').text()).toContain('provider failed');
  });
});

describe('credentials', () => {
  it('loads credential state for the detected provider', async () => {
    state.store.detected = null;
    state.invoke.mockResolvedValueOnce({ hasCookie: true });
    mountPanel();
    state.store.detected = detected();
    await flush();
    expect(state.invoke).toHaveBeenCalledWith('providers:cred:get', 'mega');
    expect(wrapper!.text()).toContain('providers.cookieSet');
  });

  it('saves a cookie and reloads the current folder', async () => {
    state.store.crumbs = [{ id: 'root' }, { id: 'sub' }];
    mountPanel();
    await flush();
    await wrapper!.get('[data-testid="providers-cookie"]').trigger('click');
    await wrapper!.vm.$nextTick();

    const input = wrapper!.get('[data-testid="providers-cookie-input"]');
    (input.element as HTMLInputElement).value = '  cookie  ';
    await input.trigger('input');
    state.invoke.mockResolvedValueOnce(true);
    await wrapper!
      .findAll('button')
      .find((b) => b.text().includes('providers.save'))!
      .trigger('click');
    await flush();

    expect(state.invoke).toHaveBeenCalledWith('providers:cred:set', {
      providerId: 'mega',
      cookie: 'cookie'
    });
    expect(state.store.loadFolder).toHaveBeenCalledWith('sub');
  });

  it('reports a failed cookie save', async () => {
    mountPanel();
    await flush();
    await wrapper!.get('[data-testid="providers-cookie"]').trigger('click');
    await wrapper!.vm.$nextTick();
    state.invoke.mockResolvedValueOnce(false);
    await wrapper!
      .findAll('button')
      .find((b) => b.text().includes('providers.save'))!
      .trigger('click');
    await flush();
    expect(wrapper!.text()).toContain('providers.cookieSaveFailed');
  });

  it('logs in through the cookie dialog and reports errors', async () => {
    mountPanel();
    await flush();
    await wrapper!.get('[data-testid="providers-cookie"]').trigger('click');
    await wrapper!.vm.$nextTick();
    state.invoke.mockResolvedValueOnce({ success: false, error: 'login denied' });
    await wrapper!
      .findAll('button')
      .find((b) => b.text().includes('providers.login'))!
      .trigger('click');
    await flush();
    expect(wrapper!.text()).toContain('login denied');

    state.invoke.mockResolvedValueOnce({ success: true });
    await wrapper!
      .findAll('button')
      .find((b) => b.text().includes('providers.login'))!
      .trigger('click');
    await flush();
    expect(state.store.loadFolder).toHaveBeenCalledWith('root');
  });
});

describe('items', () => {
  it('sorts folders first, then files by size', () => {
    mountPanel();
    const names = wrapper!.findAll(
      '[data-testid="providers-folder"], [data-testid="providers-file"]'
    );
    expect(names[0].text()).toContain('Alpha');
    expect(names[1].text()).toContain('Zeta');
    expect(names[2].text()).toContain('big');
    expect(names[3].text()).toContain('small');
  });

  it('opens folders and requests folder downloads', async () => {
    mountPanel();
    const folderEl = wrapper!.find('[data-testid="providers-folder"]');
    await folderEl.trigger('click');
    expect(state.store.openFolder).toHaveBeenCalledWith(expect.objectContaining({ id: 'f1' }));

    await wrapper!.get('[data-testid="providers-download-folder"]').trigger('click');
    await wrapper!.vm.$nextTick();
    const dialog = wrapper!.findComponent(OnlineConfirmStub);
    expect(dialog.exists()).toBe(true);
    dialog.vm.$emit('confirm');
    await flush();
    expect(state.store.downloadFolderById).toHaveBeenCalledWith('f1');
    expect(wrapper!.text()).toContain('providers.bulkTruncated');
  });

  it('plays and downloads files, hiding download for downloaded items', async () => {
    mountPanel();
    await wrapper!.get('[data-testid="providers-play"]').trigger('click');
    expect(state.store.play).toHaveBeenCalled();

    state.store.isDownloaded.mockReturnValue(true);
    state.store.files = [...state.store.files];
    await wrapper!.vm.$nextTick();
    expect(wrapper!.findAll('[data-testid="providers-downloaded"]').length).toBeGreaterThan(0);
    expect(wrapper!.findAll('[data-testid="providers-download"]')).toHaveLength(0);
  });

  it('paginates large folders and resets on item changes', async () => {
    state.store.folders = [];
    state.store.files = Array.from({ length: 201 }, (_, i) => file(`f${i}`, `file ${i}`));
    state.store.items = [...state.store.files];
    mountPanel();
    expect(wrapper!.findAll('[data-testid="providers-file"]')).toHaveLength(200);

    await wrapper!.get('[data-testid="providers-show-more"]').trigger('click');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.findAll('[data-testid="providers-file"]')).toHaveLength(201);

    state.store.items = [...state.store.items];
    await wrapper!.vm.$nextTick();
    expect(wrapper!.findAll('[data-testid="providers-file"]')).toHaveLength(200);
  });
});

describe('bulk actions', () => {
  it('subscribes after confirmation', async () => {
    mountPanel();
    await wrapper!.get('[data-testid="providers-subscribe"]').trigger('click');
    await wrapper!.vm.$nextTick();
    wrapper!.findComponent(OnlineConfirmStub).vm.$emit('confirm');
    await flush();
    expect(state.subs.add).toHaveBeenCalledWith('https://mega.nz/file/abc', 'MEGA');
  });

  it('downloads the whole folder with a summary message', async () => {
    mountPanel();
    await wrapper!.get('[data-testid="providers-download-all"]').trigger('click');
    await wrapper!.vm.$nextTick();
    wrapper!.findComponent(OnlineConfirmStub).vm.$emit('confirm');
    await flush();
    expect(state.store.downloadFolder).toHaveBeenCalled();
    expect(wrapper!.get('[data-testid="providers-bulk-message"]').text()).toContain(
      'providers.bulkQueued'
    );
  });

  it('refreshes the current folder with cache bypass', async () => {
    state.store.crumbs = [{ id: 'root' }, { id: 'sub' }];
    mountPanel();
    await wrapper!.get('[data-testid="providers-refresh"]').trigger('click');
    expect(state.store.loadFolder).toHaveBeenCalledWith('sub', true);
  });
});
