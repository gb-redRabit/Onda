import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>();
  return { ...actual, useI18n: () => ({ t: (key: string) => key }) };
});

const DetailStub = defineComponent({
  name: 'CoverDetailFields',
  props: {
    coverType: { type: String },
    frameTime: { type: Number },
    clipStart: { type: Number },
    clipEnd: { type: Number },
    clipFormat: { type: String },
    customPath: { type: String },
    stepIntegers: { type: Boolean },
    clipColumns: { type: Number }
  },
  emits: [
    'update:frameTime',
    'update:clipStart',
    'update:clipEnd',
    'update:clipFormat',
    'update:customPath'
  ],
  template: '<div data-testid="details" />'
});

import CoverOptionsFields from '../CoverOptionsFields.vue';

function mountFields(over: Record<string, unknown> = {}) {
  return mount(CoverOptionsFields, {
    props: {
      isSc: false,
      kind: 'audio',
      coverType: 'thumbnail',
      customPath: '',
      frameTime: 10,
      clipStart: 0,
      clipEnd: 5,
      clipFormat: 'webm',
      ...over
    },
    global: { stubs: { CoverDetailFields: DetailStub } }
  });
}

describe('CoverOptionsFields', () => {
  it('renders nothing for SoundCloud', () => {
    const wrapper = mountFields({ isSc: true });

    expect(wrapper.find('section').exists()).toBe(false);
    expect(wrapper.findAll('button')).toHaveLength(0);
  });

  it('offers thumbnail and none for video', () => {
    const wrapper = mountFields({ kind: 'video' });
    const buttons = wrapper.findAll('button');

    expect(buttons).toHaveLength(2);
    expect(buttons[0].text()).toBe('youtube.coverThumbnail');
    expect(buttons[1].text()).toBe('youtube.coverNone');
    expect(wrapper.find('[data-testid="details"]').exists()).toBe(false);
  });

  it('highlights the current video choice', () => {
    const thumbnail = mountFields({ kind: 'video', coverType: 'thumbnail' });
    expect(thumbnail.findAll('button')[0].classes()).toContain('bg-primary');

    const none = mountFields({ kind: 'video', coverType: 'none' });
    expect(none.findAll('button')[1].classes()).toContain('bg-primary');
    expect(none.findAll('button')[0].classes()).toContain('text-base-content/70');
  });

  it('emits the clicked video choice', async () => {
    const wrapper = mountFields({ kind: 'video' });

    await wrapper.findAll('button')[1].trigger('click');
    expect(wrapper.emitted('update:coverType')).toEqual([['none']]);

    await wrapper.findAll('button')[0].trigger('click');
    expect(wrapper.emitted('update:coverType')?.at(-1)).toEqual(['thumbnail']);
  });

  it('offers five cover modes for audio', () => {
    const wrapper = mountFields();
    const buttons = wrapper.findAll('button');

    expect(buttons.map((b) => b.text())).toEqual([
      'settings.cover.thumbnail',
      'settings.cover.none',
      'settings.cover.frame',
      'settings.cover.clip',
      'settings.cover.custom'
    ]);
  });

  it('marks the active audio cover mode and emits changes', async () => {
    const wrapper = mountFields({ coverType: 'frame' });

    expect(wrapper.findAll('button')[2].classes()).toContain('bg-primary');

    await wrapper.findAll('button')[4].trigger('click');
    expect(wrapper.emitted('update:coverType')).toEqual([['custom']]);
  });

  it('passes detail values and forwards updates', () => {
    const wrapper = mountFields({ coverType: 'clip', customPath: '/c.png' });
    const details = wrapper.getComponent(DetailStub);

    expect(details.props()).toMatchObject({
      coverType: 'clip',
      frameTime: 10,
      clipStart: 0,
      clipEnd: 5,
      clipFormat: 'webm',
      customPath: '/c.png',
      stepIntegers: false,
      clipColumns: 3
    });

    details.vm.$emit('update:frameTime', 20);
    details.vm.$emit('update:clipStart', 1);
    details.vm.$emit('update:clipEnd', 6);
    details.vm.$emit('update:clipFormat', 'mp4');
    details.vm.$emit('update:customPath', '/d.png');

    expect(wrapper.emitted('update:frameTime')).toEqual([[20]]);
    expect(wrapper.emitted('update:clipStart')).toEqual([[1]]);
    expect(wrapper.emitted('update:clipEnd')).toEqual([[6]]);
    expect(wrapper.emitted('update:clipFormat')).toEqual([['mp4']]);
    expect(wrapper.emitted('update:customPath')).toEqual([['/d.png']]);
  });
});
