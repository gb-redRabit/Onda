import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { reactive, ref } from 'vue';
import SourceEditorDialog from '../SourceEditorDialog.vue';

const state = vi.hoisted(() => ({
  ui: null as any,
  sources: null as any,
  settings: null as any,
  guard: null as any,
  test: null as any,
  invoke: vi.fn(),
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => state.ui }));
vi.mock('@renderer/stores/sources', () => ({ useSourcesStore: () => state.sources }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('@renderer/composables/useUnsavedGuard', () => ({
  useUnsavedGuard: (options: unknown) => {
    state.guard = options;
    return { onOverlayClick: vi.fn(() => state.guard?.onClose?.()) };
  }
}));
vi.mock('../../sources/useSourceEditorTest', () => ({
  useSourceEditorTest: () => state.test
}));

const ModalShellStub = {
  props: ['labelledBy', 'panelClass'],
  emits: ['close', 'escape'],
  template: '<div><slot /></div>'
};
const PhaseRailStub = {
  props: ['phases', 'active'],
  emits: ['select', 'add', 'remove'],
  template: '<div data-testid="rail" />'
};
const BasicsStub = {
  props: [
    'name',
    'baseUrl',
    'allowPrivateNetwork',
    'authType',
    'apiKeyId',
    'headerName',
    'queryParam',
    'downloadOutputDir',
    'downloadFolder',
    'defaultDownloadDir',
    'apiKeyOptions'
  ],
  emits: [
    'update:name',
    'update:baseUrl',
    'update:allowPrivateNetwork',
    'update:authType',
    'update:apiKeyId',
    'update:headerName',
    'update:queryParam',
    'update:downloadOutputDir',
    'update:downloadFolder'
  ],
  template: '<div data-testid="basics" />'
};
const TestPaneStub = {
  props: ['saveHint', 'testMsg', 'testPassed', 'prettyRaw', 'headerRows', 'errorMsg'],
  emits: ['test'],
  template: '<div data-testid="test-pane">{{ errorMsg }}</div>'
};
const EndpointStub = {
  props: [
    'modelValue',
    'baseUrl',
    'availableKeys',
    'selfKeys',
    'fieldOptions',
    'rowOptions',
    'levelOptions',
    'testing',
    'tableTesting'
  ],
  emits: ['update:modelValue', 'test', 'test-table'],
  template: '<div data-testid="endpoint-pane" />'
};

let wrapper: VueWrapper | null = null;

function endpoint(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ep1',
    name: '',
    method: 'GET',
    path: '/list',
    mapping: { fields: {} },
    passKeys: [{ from: 'slug', as: 'slug', type: 'string' }],
    ...overrides
  };
}

function source(overrides: Record<string, unknown> = {}) {
  return {
    id: 'src1',
    name: 'My source',
    baseUrl: 'https://api.example.com',
    allowPrivateNetwork: true,
    auth: { type: 'apikey', apiKeyId: 'k1', headerName: 'X-Key', queryParam: 'key' },
    endpoints: [
      endpoint(),
      endpoint({
        id: 'ep2',
        name: 'Details',
        path: '/item/{slug}',
        passKeys: [{ from: 'id', as: 'itemId', type: 'number' }]
      })
    ],
    download: { outputDir: 'D:\\out', folder: false },
    createdAt: 123,
    ...overrides
  } as never;
}

function mountDialog(props: Record<string, unknown> = {}) {
  wrapper = mount(SourceEditorDialog, {
    props: { source: null, ...props } as never,
    attachTo: document.body,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        ModalShell: ModalShellStub,
        SourcePhaseRail: PhaseRailStub,
        SourcePhaseBasics: BasicsStub,
        SourcePhaseTest: TestPaneStub,
        EndpointPhasePane: EndpointStub
      }
    }
  });
  return wrapper;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
  await wrapper!.vm.$nextTick();
}

function basics() {
  return wrapper!.findComponent(BasicsStub);
}

function rail() {
  return wrapper!.findComponent(PhaseRailStub);
}

function endpointPane() {
  return wrapper!.findComponent(EndpointStub);
}

function saveButton() {
  return wrapper!.findAll('button').at(-1)!;
}

async function setBasics(values: Record<string, unknown>): Promise<void> {
  for (const [key, value] of Object.entries(values)) {
    basics().vm.$emit(`update:${key}`, value);
  }
  await wrapper!.vm.$nextTick();
}

beforeEach(() => {
  state.ui = { notify: vi.fn() };
  state.sources = { saveSource: vi.fn(async () => ({ ok: true })) };
  state.settings = reactive({
    download: { sourcesFolder: true },
    apiKeys: {
      keys: [
        { id: 'k1', isActive: true, name: 'Primary', service: 'API' },
        { id: 'k2', isActive: true, name: '', service: 'Other' },
        { id: 'k3', isActive: true, name: '', service: '' },
        { id: 'k4', isActive: false, name: 'Disabled', service: 'API' }
      ]
    }
  });
  state.guard = null;
  state.test = {
    testMsg: ref(''),
    testPassed: ref(false),
    testingId: ref(''),
    tableTestingId: ref(''),
    sampleFields: ref<Record<string, string[]>>({}),
    rowSamples: ref<Record<string, string[]>>({}),
    headerRows: ref<Array<[string, string]>>([]),
    prettyRaw: ref(''),
    endpointStatus: ref<Record<string, boolean>>({}),
    onTest: vi.fn(),
    onTestTable: vi.fn()
  };
  state.invoke.mockReset();
  state.invoke.mockResolvedValue('D:\\default');
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

describe('create mode', () => {
  it('loads the default download dir and renders the source and test phases', async () => {
    mountDialog();
    await flush();

    expect(state.invoke).toHaveBeenCalledWith('sources:downloadDir');
    expect(basics().props('defaultDownloadDir')).toBe('D:\\default');
    expect(basics().props('downloadFolder')).toBe(true);
    expect(basics().props('apiKeyOptions')).toEqual([
      { id: 'k1', label: 'Primary' },
      { id: 'k2', label: 'Other' },
      { id: 'k3', label: 'k3' }
    ]);
    expect(wrapper!.text()).toContain('sources.addSource');

    const phases = rail().props('phases') as Array<Record<string, unknown>>;
    expect(phases.map((p) => p.key)).toEqual(['source', 'test']);
    expect(phases[0].status).toBe('invalid');
    expect(phases[1].status).toBeNull();
  });

  it('validates name, base URL and endpoints before saving', async () => {
    mountDialog();
    await flush();
    const testPhase = async () => {
      rail().vm.$emit('select', 1);
      await flush();
      return wrapper!.findComponent(TestPaneStub);
    };

    await saveButton().trigger('click');
    expect((await testPhase()).props('errorMsg')).toBe('sources.errNameRequired');
    expect(state.sources.saveSource).not.toHaveBeenCalled();

    rail().vm.$emit('select', 0);
    await flush();
    await setBasics({ name: 'Name', baseUrl: 'ftp://host' });
    await saveButton().trigger('click');
    expect((await testPhase()).props('errorMsg')).toBe('sources.errBaseUrl');

    rail().vm.$emit('select', 0);
    await flush();
    await setBasics({ baseUrl: 'https://host' });
    await saveButton().trigger('click');
    expect((await testPhase()).props('errorMsg')).toBe('sources.errEndpointRequired');
    expect(state.sources.saveSource).not.toHaveBeenCalled();
  });

  it('saves a new source with a generated id and the settings download folder', async () => {
    mountDialog();
    await flush();
    await setBasics({ name: '  New source  ', baseUrl: ' https://host/api ' });
    rail().vm.$emit('add');
    await flush();

    await saveButton().trigger('click');
    await flush();

    expect(state.sources.saveSource).toHaveBeenCalledTimes(1);
    const saved = state.sources.saveSource.mock.calls[0][0];
    expect(saved).toMatchObject({
      name: 'New source',
      baseUrl: 'https://host/api',
      allowPrivateNetwork: false,
      auth: { type: 'none' }
    });
    expect(saved.download).toBeUndefined();
    expect(saved.id).toMatch(/[a-z0-9]+/);
    expect(saved.endpoints).toHaveLength(1);
    expect(wrapper!.emitted('saved')).toHaveLength(1);
    expect(wrapper!.emitted('close')).toHaveLength(1);
  });

  it('saves auth, private network and a custom output dir', async () => {
    mountDialog();
    await flush();
    await setBasics({
      name: 'Name',
      baseUrl: 'https://host',
      authType: 'apikey',
      apiKeyId: 'k1',
      headerName: ' X-Key ',
      queryParam: ' key ',
      allowPrivateNetwork: true,
      downloadOutputDir: ' D:\\out '
    });
    rail().vm.$emit('add');
    await flush();

    await saveButton().trigger('click');
    await flush();

    const saved = state.sources.saveSource.mock.calls[0][0];
    expect(saved.auth).toEqual({
      type: 'apikey',
      apiKeyId: 'k1',
      headerName: 'X-Key',
      queryParam: 'key'
    });
    expect(saved.allowPrivateNetwork).toBe(true);
    expect(saved.download).toEqual({ outputDir: 'D:\\out', folder: true });
  });

  it('reports save failures and keeps the dialog open', async () => {
    state.sources.saveSource.mockResolvedValueOnce({ ok: false, error: 'server exploded' });
    mountDialog();
    await flush();
    await setBasics({ name: 'Name', baseUrl: 'https://host' });
    rail().vm.$emit('add');
    await flush();

    await saveButton().trigger('click');
    await flush();
    rail().vm.$emit('select', 2);
    await flush();
    expect(wrapper!.findComponent(TestPaneStub).props('errorMsg')).toBe('server exploded');
    expect(wrapper!.emitted('saved')).toBeUndefined();

    state.sources.saveSource.mockResolvedValueOnce({ ok: false });
    await saveButton().trigger('click');
    await flush();
    expect(wrapper!.findComponent(TestPaneStub).props('errorMsg')).toBe('sources.errSaveFailed');
  });
});

describe('edit mode', () => {
  it('prefills the draft and builds the phase rail from endpoints', async () => {
    mountDialog({ source: source() });
    await flush();

    expect(wrapper!.text()).toContain('sources.editSource');
    expect(basics().props('name')).toBe('My source');
    expect(basics().props('baseUrl')).toBe('https://api.example.com');
    expect(basics().props('allowPrivateNetwork')).toBe(true);
    expect(basics().props('authType')).toBe('apikey');
    expect(basics().props('apiKeyId')).toBe('k1');
    expect(basics().props('downloadOutputDir')).toBe('D:\\out');
    expect(basics().props('downloadFolder')).toBe(false);

    const phases = rail().props('phases') as Array<Record<string, unknown>>;
    expect(phases).toHaveLength(4);
    expect(phases[1]).toMatchObject({ key: 'ep1', label: '/list', status: null });
    expect(phases[2]).toMatchObject({ key: 'ep2', label: 'Details', status: null });
    expect(phases[3]).toMatchObject({ key: 'test', status: null });
  });

  it('marks endpoints by test status and invalid empty paths', async () => {
    state.test.endpointStatus.value = { ep1: true, ep2: false };
    mountDialog({
      source: source({
        endpoints: [
          endpoint({ id: 'ep1', name: '', path: '/one' }),
          endpoint({ id: 'ep2', name: '', path: '' })
        ]
      })
    });
    await flush();

    const phases = rail().props('phases') as Array<Record<string, unknown>>;
    expect(phases[1]).toMatchObject({ label: '/one', status: 'ok' });
    expect(phases[2]).toMatchObject({ label: 'sources.level 2', status: 'fail' });

    state.test.endpointStatus.value = { ep2: true };
    await wrapper!.vm.$nextTick();
    expect((rail().props('phases') as Array<Record<string, unknown>>)[2].status).toBe('ok');
  });

  it('marks the source invalid when name or base URL is empty', async () => {
    mountDialog({ source: source({ name: '' }) });
    await flush();
    expect((rail().props('phases') as Array<Record<string, unknown>>)[0].status).toBe('invalid');

    await setBasics({ name: 'Fixed' });
    expect((rail().props('phases') as Array<Record<string, unknown>>)[0].status).toBeNull();
  });

  it('preserves ids and creation time and passes the source hint through', async () => {
    mountDialog({ source: source() });
    await flush();

    await saveButton().trigger('click');
    await flush();

    const saved = state.sources.saveSource.mock.calls[0][0];
    expect(saved.id).toBe('src1');
    expect(saved.createdAt).toBe(123);
    expect(saved.download).toEqual({ outputDir: 'D:\\out', folder: false });
    expect(saved.endpoints.map((e: { id: string }) => e.id)).toEqual(['ep1', 'ep2']);

    rail().vm.$emit('select', 3);
    await flush();
    const saveHint = wrapper!.findComponent(TestPaneStub).props('saveHint');
    expect(saveHint).toBe(false);
  });
});

describe('phase navigation', () => {
  it('moves between phases with the footer buttons', async () => {
    mountDialog({ source: source() });
    await flush();

    const buttons = wrapper!.findAll('button');
    const back = buttons.find((b) => b.text() === 'common.back')!;
    const next = buttons.find((b) => b.text() === 'common.next')!;

    expect(back.attributes('disabled')).toBeDefined();
    await next.trigger('click');
    expect(rail().props('active')).toBe(1);
    expect(endpointPane().exists()).toBe(true);

    await next.trigger('click');
    await next.trigger('click');
    expect(rail().props('active')).toBe(3);
    expect(wrapper!.findComponent(TestPaneStub).exists()).toBe(true);
    expect(next.attributes('disabled')).toBeDefined();

    await back.trigger('click');
    expect(rail().props('active')).toBe(2);
  });

  it('adds a level, selects it and removes it with phase correction', async () => {
    mountDialog();
    await flush();

    rail().vm.$emit('add');
    await flush();
    expect(rail().props('active')).toBe(1);
    expect(endpointPane().exists()).toBe(true);

    rail().vm.$emit('add');
    await flush();
    expect(rail().props('active')).toBe(2);
    expect((rail().props('phases') as unknown[]).length).toBe(4);

    rail().vm.$emit('remove', 2);
    await flush();
    expect((rail().props('phases') as unknown[]).length).toBe(3);
    expect(rail().props('active')).toBe(2);

    rail().vm.$emit('select', 0);
    await flush();
    expect(rail().props('active')).toBe(0);
    expect(basics().exists()).toBe(true);
  });

  it('shows the source test hint only for a new source needing attention', async () => {
    mountDialog();
    await flush();
    expect(wrapper!.findComponent(TestPaneStub).exists()).toBe(false);

    rail().vm.$emit('select', 1);
    await flush();
    expect(wrapper!.findComponent(TestPaneStub).props('saveHint')).toBe(false);

    rail().vm.$emit('select', 0);
    await flush();
    await setBasics({ authType: 'bearer', allowPrivateNetwork: true });
    rail().vm.$emit('select', 1);
    await flush();
    expect(wrapper!.findComponent(TestPaneStub).props('saveHint')).toBe(true);
  });
});

describe('endpoint pane wiring', () => {
  it('passes chain keys, level options and samples to the active endpoint', async () => {
    state.test.sampleFields.value = { ep1: ['title', 'items'] };
    state.test.rowSamples.value = { ep1: ['row.title'] };
    mountDialog({ source: source() });
    await flush();
    rail().vm.$emit('select', 1);
    await flush();

    const pane = endpointPane();
    expect(pane.props('baseUrl')).toBe('https://api.example.com');
    expect(pane.props('availableKeys')).toEqual([]);
    expect(pane.props('selfKeys')).toEqual(['slug']);
    expect(pane.props('fieldOptions')).toEqual(['title', 'items']);
    expect(pane.props('rowOptions')).toEqual(['row.title']);
    expect(pane.props('levelOptions')).toEqual([{ id: 'ep2', label: 'Details' }]);

    rail().vm.$emit('select', 2);
    await flush();
    expect(endpointPane().props('availableKeys')).toEqual(['slug']);
    expect(endpointPane().props('selfKeys')).toEqual(['itemId']);
    expect(endpointPane().props('levelOptions')).toEqual([{ id: 'ep1', label: '/list' }]);
  });

  it('reflects test and table-test activity per endpoint', async () => {
    state.test.testingId.value = 'ep1';
    mountDialog({ source: source() });
    await flush();
    rail().vm.$emit('select', 1);
    await flush();
    expect(endpointPane().props('testing')).toBe(true);
    expect(endpointPane().props('tableTesting')).toBe(false);

    state.test.tableTestingId.value = 'ep1';
    await wrapper!.vm.$nextTick();
    expect(endpointPane().props('tableTesting')).toBe(true);
  });

  it('runs level and table tests with the current index', async () => {
    mountDialog({ source: source() });
    await flush();
    rail().vm.$emit('select', 2);
    await flush();

    endpointPane().vm.$emit('test');
    endpointPane().vm.$emit('test-table');
    await flush();
    expect(state.test.onTest).toHaveBeenCalledWith(1);
    expect(state.test.onTestTable).toHaveBeenCalledWith(1);

    rail().vm.$emit('select', 3);
    await flush();
    wrapper!.findComponent(TestPaneStub).vm.$emit('test');
    await flush();
    expect(state.test.onTest).toHaveBeenCalledWith(0);
  });
});

describe('unsaved guard and closing', () => {
  it('reports dirty state against the loaded source', async () => {
    mountDialog({ source: source() });
    await flush();

    expect(state.guard.isDirty()).toBe(false);
    await setBasics({ name: 'Changed' });
    expect(state.guard.isDirty()).toBe(true);

    await setBasics({ name: 'My source', baseUrl: 'https://other' });
    expect(state.guard.isDirty()).toBe(true);
    await setBasics({ baseUrl: 'https://api.example.com' });
    expect(state.guard.isDirty()).toBe(false);
  });

  it('wires guard hints and close callbacks', async () => {
    mountDialog();
    await flush();

    state.guard.onDirtyHint();
    expect(state.ui.notify).toHaveBeenCalledWith('warning', 'common.unsavedChangesClickAgain');
    state.guard.onCleanHint();
    expect(state.ui.notify).toHaveBeenCalledWith('info', 'common.clickAgainToClose');

    state.guard.onClose();
    expect(wrapper!.emitted('close')).toHaveLength(1);
  });

  it('closes from the header, footer, modal escape and backdrop', async () => {
    mountDialog();
    await flush();

    await wrapper!.get('button[aria-label="common.close"]').trigger('click');
    expect(wrapper!.emitted('close')).toHaveLength(1);

    await wrapper!
      .findAll('button')
      .find((b) => b.text() === 'common.cancel')!
      .trigger('click');
    expect(wrapper!.emitted('close')).toHaveLength(2);

    wrapper!.findComponent(ModalShellStub).vm.$emit('close');
    wrapper!.findComponent(ModalShellStub).vm.$emit('escape');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.emitted('close')).toHaveLength(4);
  });
});
