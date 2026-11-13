import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, reactive } from 'vue';

const h = vi.hoisted(() => ({
  settings: null as any,
  pickFolder: vi.fn()
}));

vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => h.settings }));
vi.mock('@renderer/utils/pickFolder', () => ({ pickFolder: h.pickFolder }));

const GroupStub = defineComponent({
  name: 'SettingsGroup',
  props: { title: { type: String }, description: { type: String } },
  template: '<section><slot /></section>'
});
const PathStub = defineComponent({
  name: 'PathInput',
  props: {
    modelValue: { type: String },
    label: { type: String },
    placeholder: { type: String },
    clearable: { type: Boolean }
  },
  emits: ['browse'],
  template:
    '<div data-testid="path" :data-clearable="String(clearable)" @click="$emit(\'browse\')" />'
});
const CheckStub = defineComponent({
  name: 'Checkbox',
  props: { modelValue: { type: Boolean }, label: { type: String } },
  emits: ['update:modelValue'],
  template: '<div data-testid="checkbox" />'
});
const ProfilesStub = defineComponent({
  name: 'SettingsDownloadProfiles',
  template: '<div data-testid="profiles" />'
});

import SettingsDownloadPaths from '../SettingsDownloadPaths.vue';

function mountPaths() {
  h.settings = reactive({
    download: {
      defaultPath: '/downloads',
      sourcesDir: '/sources',
      sourcesFolder: false,
      tempDir: ''
    },
    updateDownload: vi.fn((patch: Record<string, unknown>) =>
      Object.assign(h.settings.download, patch)
    )
  });
  return mount(SettingsDownloadPaths, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        SettingsGroup: GroupStub,
        PathInput: PathStub,
        Checkbox: CheckStub,
        SettingsDownloadProfiles: ProfilesStub
      }
    }
  });
}

beforeEach(() => {
  h.pickFolder.mockReset();
});

describe('SettingsDownloadPaths', () => {
  it('renders three paths and the profiles section', () => {
    const wrapper = mountPaths();
    const paths = wrapper.findAllComponents(PathStub);

    expect(paths).toHaveLength(3);
    expect(paths[0].props('modelValue')).toBe('/downloads');
    expect(paths[1].props('modelValue')).toBe('/sources');
    expect(paths[2].props('modelValue')).toBe('');
    expect(wrapper.findAll('[data-testid="path"]')[2].attributes('data-clearable')).toBe('true');
    expect(wrapper.find('[data-testid="profiles"]').exists()).toBe(true);
  });

  it('updates the download path', async () => {
    h.pickFolder.mockResolvedValue('/new-downloads');
    const wrapper = mountPaths();

    await wrapper.findAll('[data-testid="path"]')[0].trigger('click');

    expect(h.settings.updateDownload).toHaveBeenCalledWith({ defaultPath: '/new-downloads' });
  });

  it('updates the sources path', async () => {
    h.pickFolder.mockResolvedValue('/new-sources');
    const wrapper = mountPaths();

    await wrapper.findAll('[data-testid="path"]')[1].trigger('click');

    expect(h.settings.updateDownload).toHaveBeenCalledWith({ sourcesDir: '/new-sources' });
  });

  it('updates the temp dir', async () => {
    h.pickFolder.mockResolvedValue('/new-temp');
    const wrapper = mountPaths();

    await wrapper.findAll('[data-testid="path"]')[2].trigger('click');

    expect(h.settings.updateDownload).toHaveBeenCalledWith({ tempDir: '/new-temp' });
  });

  it('skips updates when the dialog is cancelled', async () => {
    h.pickFolder.mockResolvedValue(null);
    const wrapper = mountPaths();

    const paths = wrapper.findAll('[data-testid="path"]');
    await paths[0].trigger('click');
    await paths[1].trigger('click');
    await paths[2].trigger('click');

    expect(h.settings.updateDownload).not.toHaveBeenCalled();
  });

  it('updates the sources folder flag', () => {
    const wrapper = mountPaths();

    wrapper.getComponent(CheckStub).vm.$emit('update:modelValue', true);

    expect(h.settings.updateDownload).toHaveBeenCalledWith({ sourcesFolder: true });
  });
});
