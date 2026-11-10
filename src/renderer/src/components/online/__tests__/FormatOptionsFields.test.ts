import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { AUDIO_FORMATS, VIDEO_CONTAINERS, VIDEO_QUALITIES } from '@shared/constants';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}));

const FormFieldStub = defineComponent({
  name: 'FormFieldStub',
  props: { label: String, error: String },
  template: `<label :data-label="label">
    <slot :id="'id-' + label" :describedby="'desc' + label" />
    <span v-if="error" data-testid="error">{{ error }}</span>
  </label>`
});
const SelectStub = defineComponent({
  name: 'SelectStub',
  props: { modelValue: String, id: String },
  emits: ['update:modelValue'],
  template: `<select :value="modelValue" @change="$emit('update:modelValue', $event.target.value)"><slot /></select>`
});
const InputStub = defineComponent({
  name: 'InputStub',
  props: { modelValue: String, id: String, placeholder: String },
  emits: ['update:modelValue'],
  template: `<input :value="modelValue" :placeholder="placeholder" @input="$emit('update:modelValue', $event.target.value)" />`
});
const TimeInputStub = defineComponent({
  name: 'TimeInputStub',
  props: {
    modelValue: Number,
    id: String,
    ariaLabel: String,
    ariaDescribedby: String,
    invalid: Boolean
  },
  emits: ['update:modelValue'],
  template: '<button data-testid="time" :data-label="ariaLabel" :data-invalid="String(invalid)" />'
});

import FormatOptionsFields from '../FormatOptionsFields.vue';

let wrapper: VueWrapper | null = null;

function setupModels(props: Record<string, unknown> = {}) {
  const kind = ref<'audio' | 'video'>((props.kind as 'audio' | 'video') ?? 'audio');
  const format = ref('mp3');
  const audioQuality = ref('high');
  const quality = ref('1080p');
  const videoContainer = ref<'mp4' | 'mkv' | 'webm'>('mp4');
  const audioLanguage = ref('');
  const trimStart = ref<number | null>(null);
  const trimEnd = ref<number | null>(null);
  const sponsorBlock = ref<'off' | 'mark' | 'remove'>('off');
  const Harness = defineComponent({
    setup() {
      return () =>
        h(FormatOptionsFields as any, {
          isSc: props.isSc ?? false,
          audioQualities: ['best', 'high', 'low'],
          showVideoContainer: props.showVideoContainer ?? false,
          kind: kind.value,
          format: format.value,
          audioQuality: audioQuality.value,
          quality: quality.value,
          videoContainer: videoContainer.value,
          audioLanguage: audioLanguage.value,
          trimStart: trimStart.value,
          trimEnd: trimEnd.value,
          sponsorBlock: sponsorBlock.value,
          'onUpdate:kind': (value: 'audio' | 'video') => {
            kind.value = value;
          },
          'onUpdate:format': (value: string) => {
            format.value = value;
          },
          'onUpdate:audioQuality': (value: string) => {
            audioQuality.value = value;
          },
          'onUpdate:quality': (value: string) => {
            quality.value = value;
          },
          'onUpdate:videoContainer': (value: 'mp4' | 'mkv' | 'webm') => {
            videoContainer.value = value;
          },
          'onUpdate:audioLanguage': (value: string) => {
            audioLanguage.value = value;
          },
          'onUpdate:trimStart': (value: number | null) => {
            trimStart.value = value;
          },
          'onUpdate:trimEnd': (value: number | null) => {
            trimEnd.value = value;
          },
          'onUpdate:sponsorBlock': (value: 'off' | 'mark' | 'remove') => {
            sponsorBlock.value = value;
          }
        });
    }
  });
  wrapper = mount(Harness, {
    global: {
      stubs: {
        FormField: FormFieldStub,
        Select: SelectStub,
        Input: InputStub,
        TimeInput: TimeInputStub
      }
    }
  });
  return {
    kind,
    format,
    audioQuality,
    quality,
    videoContainer,
    audioLanguage,
    trimStart,
    trimEnd,
    sponsorBlock
  };
}

function selects() {
  return wrapper!.findAll('select');
}

function selectByOption(text: string) {
  return selects().find((select) => select.text().includes(text))!;
}

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.restoreAllMocks();
});

describe('SoundCloud mode', () => {
  it('renders nothing for SoundCloud', () => {
    setupModels({ isSc: true });
    expect(wrapper!.find('section').exists()).toBe(false);
  });
});

describe('YouTube mode', () => {
  it('shows audio fields by default', () => {
    setupModels();

    expect(wrapper!.find('section').exists()).toBe(true);
    const kindButtons = wrapper!.findAll('button');
    expect(kindButtons[0].classes()).toContain('bg-primary');
    expect(selectByOption('settings.audioNative').findAll('option')).toHaveLength(
      AUDIO_FORMATS.length
    );
    expect(wrapper!.find('input').attributes('placeholder')).toBe(
      'youtube.audioLanguagePlaceholder'
    );
    expect(wrapper!.text()).toContain('youtube.prefKind');
    expect(wrapper!.text()).toContain('youtube.sponsorBlock');
  });

  it('switches to video fields', async () => {
    const models = setupModels();
    const videoButton = wrapper!
      .findAll('button')
      .find((button) => button.text() === 'youtube.prefVideo')!;

    await videoButton.trigger('click');
    await wrapper!.vm.$nextTick();

    expect(models.kind.value).toBe('video');
    expect(selectByOption('1080p').findAll('option')).toHaveLength(VIDEO_QUALITIES.length);
    expect(wrapper!.find('input').exists()).toBe(false);
  });

  it('shows the container only when requested', async () => {
    setupModels();
    await wrapper!
      .findAll('button')
      .find((button) => button.text() === 'youtube.prefVideo')!
      .trigger('click');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.text()).not.toContain('settings.defaultVideoContainer');

    wrapper!.unmount();
    setupModels({ kind: 'video', showVideoContainer: true });
    const container = selectByOption('mp4');
    expect(container.findAll('option')).toHaveLength(VIDEO_CONTAINERS.length);
  });
});

describe('model updates', () => {
  it('updates format, quality and language', async () => {
    const models = setupModels();

    const format = selectByOption('settings.audioNative');
    (format.element as HTMLSelectElement).value = 'flac';
    await format.trigger('change');
    expect(models.format.value).toBe('flac');

    const audioQuality = selectByOption('settings.audioQuality.best');
    (audioQuality.element as HTMLSelectElement).value = 'low';
    await audioQuality.trigger('change');
    expect(models.audioQuality.value).toBe('low');

    const language = wrapper!.get('input');
    (language.element as HTMLInputElement).value = 'pl';
    await language.trigger('input');
    expect(models.audioLanguage.value).toBe('pl');
  });

  it('updates video quality and container', async () => {
    const models = setupModels({ kind: 'video', showVideoContainer: true });

    const quality = selectByOption('1080p');
    (quality.element as HTMLSelectElement).value = '720p';
    await quality.trigger('change');
    expect(models.quality.value).toBe('720p');

    const container = selectByOption('mp4');
    (container.element as HTMLSelectElement).value = 'mkv';
    await container.trigger('change');
    expect(models.videoContainer.value).toBe('mkv');
  });

  it('updates sponsor block', async () => {
    const models = setupModels();
    const sponsor = selectByOption('youtube.sponsorBlockOff');
    (sponsor.element as HTMLSelectElement).value = 'remove';
    await sponsor.trigger('change');
    expect(models.sponsorBlock.value).toBe('remove');
  });

  it('updates trim bounds', async () => {
    const models = setupModels();
    const [start, end] = wrapper!.findAllComponents(TimeInputStub);

    start.vm.$emit('update:modelValue', 10);
    end.vm.$emit('update:modelValue', 20);

    expect(models.trimStart.value).toBe(10);
    expect(models.trimEnd.value).toBe(20);
  });
});

describe('trim validation', () => {
  it('reports an invalid range', async () => {
    const models = setupModels();
    const [start, end] = wrapper!.findAllComponents(TimeInputStub);

    start.vm.$emit('update:modelValue', 10);
    end.vm.$emit('update:modelValue', 5);
    await wrapper!.vm.$nextTick();

    expect(wrapper!.text()).toContain('youtube.trimRangeError');
    expect(wrapper!.find('[data-testid="error"]').exists()).toBe(true);
    expect(end.props()).toMatchObject({ invalid: true, ariaDescribedby: 'descyoutube.trimEnd' });
    expect(models.trimEnd.value).toBe(5);
  });

  it('shows no error for a valid or empty range', async () => {
    const models = setupModels();
    const [start, end] = wrapper!.findAllComponents(TimeInputStub);

    expect(wrapper!.find('[data-testid="error"]').exists()).toBe(false);

    start.vm.$emit('update:modelValue', 1);
    end.vm.$emit('update:modelValue', 2);
    await wrapper!.vm.$nextTick();
    expect(wrapper!.find('[data-testid="error"]').exists()).toBe(false);

    start.vm.$emit('update:modelValue', null);
    await wrapper!.vm.$nextTick();
    expect(wrapper!.find('[data-testid="error"]').exists()).toBe(false);
    expect(models.trimStart.value).toBeNull();
  });
});
