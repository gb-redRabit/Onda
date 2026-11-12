import { afterEach, describe, expect, it } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent } from 'vue';

import SubscribeFormatSection from '../SubscribeFormatSection.vue';

const FieldsStub = defineComponent({
  name: 'FormatOptionsFields',
  props: [
    'kind',
    'format',
    'quality',
    'audioQuality',
    'audioLanguage',
    'trimStart',
    'trimEnd',
    'sponsorBlock',
    'isSc',
    'audioQualities',
    'showVideoContainer'
  ],
  emits: [
    'update:kind',
    'update:format',
    'update:quality',
    'update:audioQuality',
    'update:audioLanguage',
    'update:trimStart',
    'update:trimEnd',
    'update:sponsorBlock'
  ],
  template: '<div data-testid="fields" />'
});

let wrapper: VueWrapper | null = null;

function mountSection(isSc = false) {
  wrapper = mount(SubscribeFormatSection, {
    props: {
      isSc,
      kind: 'audio',
      format: 'mp3',
      quality: '1080p',
      audioQuality: 'high',
      audioLanguage: 'en',
      trimStart: null,
      trimEnd: null,
      sponsorBlock: 'off'
    },
    global: { stubs: { FormatOptionsFields: FieldsStub } }
  });
  return wrapper;
}

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('SubscribeFormatSection', () => {
  it('passes props, SoundCloud flag and audio qualities', () => {
    mountSection(true);

    const fields = wrapper!.findComponent(FieldsStub);
    expect(fields.props()).toMatchObject({
      kind: 'audio',
      format: 'mp3',
      quality: '1080p',
      audioQuality: 'high',
      audioLanguage: 'en',
      trimStart: null,
      trimEnd: null,
      sponsorBlock: 'off',
      isSc: true,
      audioQualities: ['best', 'high', 'medium', 'low']
    });
  });

  it('forwards every model update', () => {
    mountSection();
    const fields = wrapper!.findComponent(FieldsStub);

    fields.vm.$emit('update:kind', 'video');
    fields.vm.$emit('update:format', 'mp4');
    fields.vm.$emit('update:quality', '720p');
    fields.vm.$emit('update:audioQuality', 'low');
    fields.vm.$emit('update:audioLanguage', 'pl');
    fields.vm.$emit('update:trimStart', 3);
    fields.vm.$emit('update:trimEnd', 9);
    fields.vm.$emit('update:sponsorBlock', 'mark');

    expect(wrapper!.emitted('update:kind')).toEqual([['video']]);
    expect(wrapper!.emitted('update:format')).toEqual([['mp4']]);
    expect(wrapper!.emitted('update:quality')).toEqual([['720p']]);
    expect(wrapper!.emitted('update:audioQuality')).toEqual([['low']]);
    expect(wrapper!.emitted('update:audioLanguage')).toEqual([['pl']]);
    expect(wrapper!.emitted('update:trimStart')).toEqual([[3]]);
    expect(wrapper!.emitted('update:trimEnd')).toEqual([[9]]);
    expect(wrapper!.emitted('update:sponsorBlock')).toEqual([['mark']]);
  });
});
