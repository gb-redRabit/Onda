import { afterEach, describe, expect, it } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent } from 'vue';

import DownloadFormatSection from '../DownloadFormatSection.vue';
import { AUDIO_QUALITIES } from '@renderer/utils/downloadConfigMeta';

const FieldsStub = defineComponent({
  name: 'FormatOptionsFields',
  props: [
    'kind',
    'format',
    'audioQuality',
    'quality',
    'videoContainer',
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
    'update:audioQuality',
    'update:quality',
    'update:videoContainer',
    'update:audioLanguage',
    'update:trimStart',
    'update:trimEnd',
    'update:sponsorBlock'
  ],
  template: '<div data-testid="fields" />'
});

let wrapper: VueWrapper | null = null;

function mountSection(isSc = false) {
  wrapper = mount(DownloadFormatSection, {
    props: {
      isSc,
      kind: 'audio',
      format: 'mp3',
      audioQuality: 'high',
      quality: '1080p',
      videoContainer: 'mp4',
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

describe('field wiring', () => {
  it('passes every model, the SoundCloud flag and audio qualities', () => {
    mountSection(true);

    const fields = wrapper!.findComponent(FieldsStub);
    expect(fields.props()).toMatchObject({
      kind: 'audio',
      format: 'mp3',
      audioQuality: 'high',
      quality: '1080p',
      videoContainer: 'mp4',
      audioLanguage: 'en',
      trimStart: null,
      trimEnd: null,
      sponsorBlock: 'off',
      isSc: true,
      audioQualities: AUDIO_QUALITIES
    });
  });

  it('forwards model updates with the original names', () => {
    mountSection();
    const fields = wrapper!.findComponent(FieldsStub);

    fields.vm.$emit('update:kind', 'video');
    fields.vm.$emit('update:format', 'mp4');
    fields.vm.$emit('update:audioQuality', 'low');
    fields.vm.$emit('update:quality', '720p');
    fields.vm.$emit('update:videoContainer', 'mkv');
    fields.vm.$emit('update:audioLanguage', 'pl');
    fields.vm.$emit('update:trimStart', 4);
    fields.vm.$emit('update:trimEnd', 12);
    fields.vm.$emit('update:sponsorBlock', 'remove');

    expect(wrapper!.emitted('update:kind')).toEqual([['video']]);
    expect(wrapper!.emitted('update:format')).toEqual([['mp4']]);
    expect(wrapper!.emitted('update:audioQuality')).toEqual([['low']]);
    expect(wrapper!.emitted('update:quality')).toEqual([['720p']]);
    expect(wrapper!.emitted('update:videoContainer')).toEqual([['mkv']]);
    expect(wrapper!.emitted('update:audioLanguage')).toEqual([['pl']]);
    expect(wrapper!.emitted('update:trimStart')).toEqual([[4]]);
    expect(wrapper!.emitted('update:trimEnd')).toEqual([[12]]);
    expect(wrapper!.emitted('update:sponsorBlock')).toEqual([['remove']]);
  });
});
