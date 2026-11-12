import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));

import EndpointAdvancedSection from '../EndpointAdvancedSection.vue';

const LabelStub = defineComponent({
  name: 'FieldLabel',
  props: ['text', 'tight'],
  template: '<span class="label">{{ text }}</span>'
});

function draft(overrides: Record<string, unknown> = {}) {
  return {
    method: 'GET',
    paramsText: '',
    arrayPath: 'data',
    pageParam: 'page',
    pageStart: 1,
    nextFromField: '',
    totalField: '',
    rangeCountField: '',
    rangeCountValue: 1,
    rangeStartAt: 0,
    rangeTitleTemplate: '',
    fId: 'mal_id',
    fType: 'video',
    fDuration: 'duration',
    fSourceUrl: 'url',
    ...overrides
  };
}

let wrapper: VueWrapper | null = null;
let model: ReturnType<typeof draft>;

function mountSection(overrides: Record<string, unknown> = {}) {
  const Host = defineComponent({
    components: { EndpointAdvancedSection },
    setup() {
      const value = ref(draft(overrides));
      model = value.value;
      return { value };
    },
    template: '<EndpointAdvancedSection v-model="value" />'
  });
  wrapper = mount(Host, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { FieldLabel: LabelStub }
    }
  });
  return wrapper;
}

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

beforeEach(() => {
  model = draft();
});

describe('rendering', () => {
  it('collapses the advanced fields behind a summary', () => {
    mountSection();

    expect(wrapper!.get('summary').text()).toBe('sources.advanced');
    expect(wrapper!.findAll('input')).toHaveLength(14);
    expect(wrapper!.find('select').exists()).toBe(true);
  });

  it('renders the expected placeholders', () => {
    mountSection();

    const byLabel = (label: string) => wrapper!.get(`[aria-label="${label}"]`);
    expect(byLabel('sources.params').attributes('placeholder')).toBe('rating=safe');
    expect(byLabel('sources.arrayPath').attributes('placeholder')).toBe('data');
    expect(byLabel('sources.pageParam').attributes('placeholder')).toBe('page');
    expect(byLabel('sources.startPage').attributes('placeholder')).toBe('1');
    expect(byLabel('sources.nextFromField').attributes('placeholder')).toBe(
      'pagination.next_token'
    );
    expect(byLabel('sources.totalField').attributes('placeholder')).toBe('pagination.has_next');
    expect(byLabel('sources.rangeCountField').attributes('placeholder')).toBe('episodes');
    expect(byLabel('sources.rangeCountValue').attributes('placeholder')).toBe('12');
    expect(byLabel('sources.rangeStartAt').attributes('placeholder')).toBe('1');
    expect(byLabel('sources.fId').attributes('placeholder')).toBe('mal_id');
    expect(byLabel('sources.fType').attributes('placeholder')).toBe('video');
    expect(byLabel('sources.fDuration').attributes('placeholder')).toBe('duration');
    expect(byLabel('sources.fSourceUrl').attributes('placeholder')).toBe('url');
    expect(byLabel('sources.rangeTitleTemplate').attributes('placeholder')).toContain('{n}');
  });
});

describe('editing', () => {
  it('updates every text field', async () => {
    mountSection();
    const set = async (label: string, value: string) => {
      await wrapper!.get(`[aria-label="${label}"]`).setValue(value);
    };

    await wrapper!.get('select').setValue('POST');
    await set('sources.params', 'a=b');
    await set('sources.arrayPath', 'items');
    await set('sources.pageParam', 'p');
    await set('sources.nextFromField', 'next');
    await set('sources.totalField', 'total');
    await set('sources.rangeCountField', 'count');
    await set('sources.rangeTitleTemplate', 'Ep {n}');
    await set('sources.fId', 'id');
    await set('sources.fType', 'type');
    await set('sources.fDuration', 'dur');
    await set('sources.fSourceUrl', 'src');

    expect(model).toMatchObject({
      method: 'POST',
      paramsText: 'a=b',
      arrayPath: 'items',
      pageParam: 'p',
      nextFromField: 'next',
      totalField: 'total',
      rangeCountField: 'count',
      rangeTitleTemplate: 'Ep {n}',
      fId: 'id',
      fType: 'type',
      fDuration: 'dur',
      fSourceUrl: 'src'
    });
  });

  it('updates numeric fields as numbers', async () => {
    mountSection();

    await wrapper!.get('[aria-label="sources.startPage"]').setValue('4');
    await wrapper!.get('[aria-label="sources.rangeCountValue"]').setValue('12');
    await wrapper!.get('[aria-label="sources.rangeStartAt"]').setValue('3');

    expect(model).toMatchObject({
      pageStart: 4,
      rangeCountValue: 12,
      rangeStartAt: 3
    });
  });
});
