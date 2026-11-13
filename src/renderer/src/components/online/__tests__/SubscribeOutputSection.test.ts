import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>();
  return { ...actual, useI18n: () => ({ t: (key: string) => key }) };
});

const FolderStub = defineComponent({
  name: 'OutputFolderSection',
  props: {
    folderMode: { type: String },
    outputDir: { type: String },
    channelTitle: { type: String },
    channelFolder: { type: String }
  },
  emits: ['update:folderMode', 'update:outputDir'],
  template: '<div data-testid="folder" />'
});
const TemplateStub = defineComponent({
  name: 'FilenameTemplateFields',
  props: { filenameTemplate: { type: String } },
  emits: ['update:filenameTemplate'],
  template: '<div data-testid="template" />'
});
const SwitchStub = defineComponent({
  name: 'UiSwitch',
  props: {
    modelValue: { type: Boolean },
    size: { type: String },
    label: { type: String },
    title: { type: String }
  },
  emits: ['update:modelValue'],
  template: '<button data-testid="switch" />'
});

import SubscribeOutputSection from '../SubscribeOutputSection.vue';

function mountSection(over: Record<string, unknown> = {}) {
  return mount(SubscribeOutputSection, {
    props: {
      channelFolder: 'Channel',
      folderMode: 'channel',
      outputDir: '/out',
      filenameTemplate: '{title}',
      addToLibrary: true,
      ...over
    },
    global: {
      stubs: {
        OutputFolderSection: FolderStub,
        FilenameTemplateFields: TemplateStub,
        Switch: SwitchStub
      }
    }
  });
}

describe('SubscribeOutputSection', () => {
  it('forwards folder and template settings', () => {
    const wrapper = mountSection();
    const folder = wrapper.getComponent(FolderStub);

    expect(folder.props()).toMatchObject({
      folderMode: 'channel',
      outputDir: '/out',
      channelTitle: 'youtube.prefOutputDirChannel',
      channelFolder: 'Channel'
    });
    expect(wrapper.getComponent(TemplateStub).props('filenameTemplate')).toBe('{title}');
  });

  it('propagates folder model updates', () => {
    const wrapper = mountSection();
    const folder = wrapper.getComponent(FolderStub);

    folder.vm.$emit('update:folderMode', 'global');
    folder.vm.$emit('update:outputDir', '/new');

    expect(wrapper.emitted('update:folderMode')).toEqual([['global']]);
    expect(wrapper.emitted('update:outputDir')).toEqual([['/new']]);
  });

  it('propagates template updates', () => {
    const wrapper = mountSection();

    wrapper.getComponent(TemplateStub).vm.$emit('update:filenameTemplate', '{artist} - {title}');

    expect(wrapper.emitted('update:filenameTemplate')).toEqual([['{artist} - {title}']]);
  });

  it('toggles adding downloads to the library', () => {
    const wrapper = mountSection();
    const toggle = wrapper.getComponent(SwitchStub);

    expect(toggle.props()).toMatchObject({
      modelValue: true,
      size: 'sm',
      label: 'youtube.addToLibraryPref',
      title: 'youtube.addToLibraryPrefDesc'
    });

    toggle.vm.$emit('update:modelValue', false);
    expect(wrapper.emitted('update:addToLibrary')).toEqual([[false]]);
  });

  it('shows the library hint', () => {
    const text = mountSection().text();

    expect(text).toContain('youtube.addToLibraryPref');
    expect(text).toContain('youtube.addToLibraryPrefDesc');
  });
});
