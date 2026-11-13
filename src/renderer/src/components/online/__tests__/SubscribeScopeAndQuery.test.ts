import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>();
  return { ...actual, useI18n: () => ({ t: (key: string) => key }) };
});

const LabelStub = defineComponent({
  name: 'FieldLabel',
  props: { text: { type: String } },
  template: '<div data-testid="label">{{ text }}</div>'
});

import SubscribeScopeSelector from '../SubscribeScopeSelector.vue';
import SourcesQueryBuilder from '../../sources/SourcesQueryBuilder.vue';

describe('SubscribeScopeSelector', () => {
  function mountScope(downloadAll = false, isEdit = false) {
    return mount(SubscribeScopeSelector, {
      props: { isEdit, modelValue: downloadAll },
      global: { mocks: { $t: (key: string) => key } }
    });
  }

  it('hides in edit mode', () => {
    expect(mountScope(false, true).find('button').exists()).toBe(false);
  });

  it('renders both scope options', () => {
    const wrapper = mountScope();
    const buttons = wrapper.findAll('button');

    expect(buttons).toHaveLength(2);
    expect(wrapper.text()).toContain('youtube.subscribeScope');
    expect(buttons[0].text()).toContain('youtube.scopeNew');
    expect(buttons[1].text()).toContain('youtube.scopeAll');
  });

  it('marks the active scope', () => {
    const onlyNew = mountScope(false).findAll('button');
    expect(onlyNew[0].classes()).toContain('border-primary');
    expect(onlyNew[1].classes()).toContain('border-hairline');

    const all = mountScope(true).findAll('button');
    expect(all[1].classes()).toContain('border-primary');
  });

  it('emits the chosen scope', async () => {
    const wrapper = mountScope(false);

    await wrapper.findAll('button')[1].trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]]);

    await wrapper.findAll('button')[0].trigger('click');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false]);
  });
});

describe('SourcesQueryBuilder', () => {
  function mountBuilder(keys = ['q', 'page'], defaults = { q: 'all', page: '1' }, values = {}) {
    return mount(SourcesQueryBuilder, {
      props: { keys, defaults, modelValue: values },
      global: { mocks: { $t: (key: string) => key }, stubs: { FieldLabel: LabelStub } }
    });
  }

  it('hides without keys', () => {
    expect(mountBuilder([]).find('[data-testid="sources-query-builder"]').exists()).toBe(false);
  });

  it('renders one input per key with values and placeholders', () => {
    const wrapper = mountBuilder(['q', 'page'], { q: 'all', page: '1' }, { q: 'custom' });
    const inputs = wrapper.findAll('input');

    expect(wrapper.text()).toContain('sources.queryBuilderParams');
    expect(inputs).toHaveLength(2);
    expect((inputs[0].element as HTMLInputElement).value).toBe('custom');
    expect(inputs[0].attributes('placeholder')).toBe('all');
    expect((inputs[1].element as HTMLInputElement).value).toBe('');
    expect(inputs[1].attributes('placeholder')).toBe('1');
    expect(inputs[0].attributes('aria-label')).toBe('q');
  });

  it('adds and removes parameter values', async () => {
    const wrapper = mountBuilder(
      ['q', 'page'],
      { q: 'all', page: '1' },
      { q: 'keep', page: 'drop' }
    );
    const inputs = wrapper.findAll('input');

    await inputs[0].setValue('new');
    expect(wrapper.emitted('update:modelValue')).toEqual([[{ q: 'new', page: 'drop' }]]);

    (inputs[1].element as HTMLInputElement).value = '';
    await inputs[1].trigger('input');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([{ q: 'new' }]);
  });
});
