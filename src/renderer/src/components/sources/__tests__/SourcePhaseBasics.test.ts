import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent } from 'vue';

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));

import SourcePhaseBasics from '../SourcePhaseBasics.vue';

const FieldLabelStub = defineComponent({
  name: 'FieldLabel',
  props: ['text'],
  template: '<span class="field-label">{{ text }}</span>'
});
const ToggleStub = defineComponent({
  name: 'SettingsToggle',
  props: ['modelValue', 'label'],
  emits: ['update:modelValue'],
  template: '<button data-testid="toggle" @click="$emit(\'update:modelValue\', !modelValue)" />'
});
const DownloadStub = defineComponent({
  name: 'SourceDownloadSection',
  props: ['outputDir', 'folder', 'defaultDir'],
  emits: ['update:outputDir', 'update:folder'],
  template: '<div data-testid="download-section" />'
});

let wrapper: VueWrapper | null = null;

function props(overrides: Record<string, unknown> = {}) {
  return {
    name: 'My Source',
    baseUrl: 'https://api.example.com',
    allowPrivateNetwork: false,
    authType: 'none',
    apiKeyId: '',
    headerName: '',
    queryParam: '',
    downloadOutputDir: '',
    downloadFolder: false,
    defaultDownloadDir: 'D:/Downloads',
    apiKeyOptions: [
      { id: 'key-1', label: 'Primary key' },
      { id: 'key-2', label: 'Backup key' }
    ],
    ...overrides
  };
}

function mountPhase(overrides: Record<string, unknown> = {}) {
  wrapper = mount(SourcePhaseBasics, {
    props: props(overrides) as never,
    global: {
      stubs: {
        FieldLabel: FieldLabelStub,
        SettingsToggle: ToggleStub,
        SourceDownloadSection: DownloadStub
      }
    }
  });
  return wrapper;
}

function byLabel(label: string) {
  return wrapper!.get(`[aria-label="${label}"]`);
}

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('basic fields', () => {
  it('renders labels and placeholders', () => {
    mountPhase();

    expect(wrapper!.text()).toContain('sources.name');
    expect(wrapper!.text()).toContain('sources.baseUrl');
    expect(wrapper!.text()).toContain('sources.trustPrivateNetwork');
    expect(wrapper!.text()).toContain('sources.trustPrivateNetworkDescription');
    expect(byLabel('sources.name').attributes('placeholder')).toBe('sources.namePlaceholder');
    expect(byLabel('sources.baseUrl').attributes('placeholder')).toBe('https://api.example.com');
  });

  it('updates name and base url models', async () => {
    mountPhase();

    await byLabel('sources.name').setValue('Renamed');
    await byLabel('sources.baseUrl').setValue('https://new.example.com');

    expect(wrapper!.emitted('update:name')).toEqual([['Renamed']]);
    expect(wrapper!.emitted('update:baseUrl')).toEqual([['https://new.example.com']]);
  });

  it('toggles private-network trust', async () => {
    mountPhase();

    await wrapper!.get('[data-testid="toggle"]').trigger('click');

    expect(wrapper!.emitted('update:allowPrivateNetwork')).toEqual([[true]]);
  });
});

describe('authentication', () => {
  it('hides the key selector and header fields for no auth', () => {
    mountPhase({ authType: 'none' });

    expect(wrapper!.findAll('select')).toHaveLength(1);
    expect(wrapper!.find('[aria-label="sources.headerName"]').exists()).toBe(false);
    expect(wrapper!.find('[aria-label="sources.queryParam"]').exists()).toBe(false);
  });

  it('shows the key selector and key options for bearer auth', () => {
    mountPhase({ authType: 'bearer' });

    expect(wrapper!.findAll('select')).toHaveLength(2);
    const keySelect = byLabel('sources.chooseKey');
    expect(keySelect.findAll('option').map((option) => option.text())).toEqual([
      'sources.chooseKey',
      'Primary key',
      'Backup key'
    ]);
    expect(wrapper!.find('[aria-label="sources.headerName"]').exists()).toBe(false);
  });

  it('shows header and query parameter fields for api-key auth', () => {
    mountPhase({ authType: 'apikey' });

    expect(wrapper!.find('[aria-label="sources.headerName"]').exists()).toBe(true);
    expect(wrapper!.find('[aria-label="sources.queryParam"]').exists()).toBe(true);
  });

  it('updates key, header and query models', async () => {
    mountPhase({ authType: 'apikey' });

    await byLabel('sources.chooseKey').setValue('key-2');
    await byLabel('sources.headerName').setValue('X-Api-Key');
    await byLabel('sources.queryParam').setValue('api_key');

    expect(wrapper!.emitted('update:apiKeyId')).toEqual([['key-2']]);
    expect(wrapper!.emitted('update:headerName')).toEqual([['X-Api-Key']]);
    expect(wrapper!.emitted('update:queryParam')).toEqual([['api_key']]);
  });

  it('updates the auth type', async () => {
    mountPhase({ authType: 'apikey' });

    await byLabel('sources.auth').setValue('bearer');

    expect(wrapper!.emitted('update:authType')).toEqual([['bearer']]);
  });
});

describe('download preferences', () => {
  it('passes the default directory and current values through', () => {
    mountPhase({ downloadOutputDir: 'E:/Media', downloadFolder: true });

    const section = wrapper!.findComponent(DownloadStub);
    expect(section.props()).toMatchObject({
      outputDir: 'E:/Media',
      folder: true,
      defaultDir: 'D:/Downloads'
    });
  });
});

describe('download section binding', () => {
  it('forwards output directory and folder updates from the section', async () => {
    mountPhase();
    const section = wrapper!.findComponent(DownloadStub);

    section.vm.$emit('update:outputDir', 'F:/Out');
    section.vm.$emit('update:folder', true);

    expect(wrapper!.emitted('update:downloadOutputDir')).toEqual([['F:/Out']]);
    expect(wrapper!.emitted('update:downloadFolder')).toEqual([[true]]);
  });
});
