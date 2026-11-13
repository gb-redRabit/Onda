import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>();
  return {
    ...actual,
    useI18n: () => ({
      t: (key: string, params?: { path: string }) => (params ? `${key}:${params.path}` : key)
    })
  };
});

const LabelStub = defineComponent({
  name: 'FieldLabel',
  props: { text: { type: String } },
  template: '<div data-testid="label">{{ text }}</div>'
});
const ToggleStub = defineComponent({
  name: 'SettingsToggle',
  props: { modelValue: { type: Boolean }, label: { type: String } },
  emits: ['update:modelValue'],
  template: '<button data-testid="toggle" :data-checked="String(modelValue)" />'
});

import SourceDownloadSection from '../SourceDownloadSection.vue';
import SourcesFilterBar from '../SourcesFilterBar.vue';

function mountDownload(over: Record<string, unknown> = {}) {
  return mount(SourceDownloadSection, {
    props: { defaultDir: 'D:/Downloads', outputDir: 'D:/Out', folder: false, ...over },
    global: { stubs: { FieldLabel: LabelStub, SettingsToggle: ToggleStub } }
  });
}

beforeEach(() => {
  (window as unknown as { api?: unknown }).api = {
    invoke: vi.fn().mockResolvedValue(['D:/Picked'])
  };
});

describe('SourceDownloadSection', () => {
  it('renders the output dir and hint', () => {
    const wrapper = mountDownload();
    const input = wrapper.get('input');

    expect((input.element as HTMLInputElement).value).toBe('D:/Out');
    expect(input.attributes('placeholder')).toBe('D:/Downloads');
    expect(wrapper.text()).toContain('sources.downloadSection');
    expect(wrapper.text()).toContain('sources.downloadDefaultHint:D:/Downloads');
  });

  it('updates the output dir manually', async () => {
    const wrapper = mountDownload();

    await wrapper.get('input').setValue('D:/Manual');

    expect(wrapper.emitted('update:outputDir')).toEqual([['D:/Manual']]);
  });

  it('picks a folder from the dialog', async () => {
    const wrapper = mountDownload();

    await wrapper.findAll('button')[0].trigger('click');

    expect(
      (window.api as unknown as { invoke: ReturnType<typeof vi.fn> }).invoke
    ).toHaveBeenCalledWith('dialog:openFolder');
    expect(wrapper.emitted('update:outputDir')).toEqual([['D:/Picked']]);
  });

  it('keeps the dir when the dialog returns nothing', async () => {
    (
      window as unknown as { api: { invoke: ReturnType<typeof vi.fn> } }
    ).api.invoke.mockResolvedValue([]);
    const wrapper = mountDownload();

    await wrapper.findAll('button')[0].trigger('click');

    expect(wrapper.emitted('update:outputDir')).toBeUndefined();
  });

  it('toggles the folder preference', () => {
    const wrapper = mountDownload();

    wrapper.getComponent(ToggleStub).vm.$emit('update:modelValue', true);

    expect(wrapper.emitted('update:folder')).toEqual([[true]]);
    expect(wrapper.text()).toContain('sources.downloadFolderHint');
  });
});

function mountFilters(filterText = '', sortMode = 'none') {
  return mount(SourcesFilterBar, {
    props: { filterText, sortMode: sortMode as never }
  });
}

describe('SourcesFilterBar', () => {
  it('renders the search input and sort options', () => {
    const wrapper = mountFilters('query', 'titleAsc');
    const select = wrapper.get('select');

    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('query');
    expect((select.element as HTMLSelectElement).value).toBe('titleAsc');
    expect(select.findAll('option').map((o) => o.attributes('value'))).toEqual([
      'none',
      'titleAsc',
      'titleDesc',
      'type'
    ]);
  });

  it('updates the filter text', async () => {
    const wrapper = mountFilters();

    await wrapper.get('input').setValue('abc');

    expect(wrapper.emitted('update:filterText')).toEqual([['abc']]);
  });

  it('shows a clear action only with text and clears it', async () => {
    expect(mountFilters().find('button').exists()).toBe(false);

    const wrapper = mountFilters('abc');
    await wrapper.get('button').trigger('click');

    expect(wrapper.emitted('update:filterText')).toEqual([['']]);
  });

  it('updates the sort mode', async () => {
    const wrapper = mountFilters();

    await wrapper.get('select').setValue('type');

    expect(wrapper.emitted('update:sortMode')).toEqual([['type']]);
  });
});
