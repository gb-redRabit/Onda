import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>();
  return { ...actual, useI18n: () => ({ t: (key: string) => key }) };
});

const ModalStub = defineComponent({
  name: 'ModalShell',
  props: {
    visible: { type: Boolean },
    labelledBy: { type: String },
    panelClass: { type: String }
  },
  emits: ['close', 'escape'],
  template:
    '<div data-testid="modal" :data-visible="String(visible)" :data-labelled="labelledBy"><slot /></div>'
});

import DownloadMetaDialog from '../DownloadMetaDialog.vue';

function mountDialog(over: Record<string, unknown> = {}) {
  return mount(DownloadMetaDialog, {
    props: { open: true, artist: 'Artist', album: 'Album', year: '2020', ...over },
    global: { stubs: { ModalShell: ModalStub } }
  });
}

describe('DownloadMetaDialog', () => {
  it('passes visibility and labelling to the modal shell', () => {
    const modal = mountDialog().getComponent(ModalStub);

    expect(modal.props()).toMatchObject({
      visible: true,
      labelledBy: 'download-meta-dialog-title',
      panelClass: expect.stringContaining('w-80')
    });
    expect(mountDialog({ open: false }).getComponent(ModalStub).props('visible')).toBe(false);
  });

  it('renders the title and values', () => {
    const wrapper = mountDialog();
    const inputs = wrapper.findAll('input');

    expect(wrapper.text()).toContain('downloads.editMetadata');
    expect(inputs.map((i) => (i.element as HTMLInputElement).value)).toEqual([
      'Artist',
      'Album',
      '2020'
    ]);
  });

  it('emits model updates for every field', async () => {
    const wrapper = mountDialog();
    const inputs = wrapper.findAll('input');

    await inputs[0].setValue('New artist');
    await inputs[1].setValue('New album');
    await inputs[2].setValue('1999');

    expect(wrapper.emitted('update:artist')).toEqual([['New artist']]);
    expect(wrapper.emitted('update:album')).toEqual([['New album']]);
    expect(wrapper.emitted('update:year')).toEqual([['1999']]);
  });

  it('closes from the header, cancel and modal escape', async () => {
    const wrapper = mountDialog();

    await wrapper.get('[aria-label="common.close"]').trigger('click');
    await wrapper.findAll('button')[0].trigger('click');
    await wrapper.findAll('button')[1].trigger('click');
    const shell = wrapper.getComponent(ModalStub);
    shell.vm.$emit('close');
    shell.vm.$emit('escape');

    expect(wrapper.emitted('close')!.length).toBeGreaterThanOrEqual(4);
  });

  it('saves', async () => {
    const wrapper = mountDialog();
    const save = wrapper.findAll('button').at(-1)!;

    expect(save.text()).toBe('common.save');
    await save.trigger('click');

    expect(wrapper.emitted('save')).toEqual([[]]);
  });

  it('labels each field with its placeholder', () => {
    const inputs = mountDialog().findAll('input');

    expect(inputs.map((i) => i.attributes('placeholder'))).toEqual([
      'youtube.metaArtist',
      'youtube.metaAlbum',
      'youtube.metaYear'
    ]);
  });
});
