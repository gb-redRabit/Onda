import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';

const mocks = vi.hoisted(() => ({
  preview: vi.fn(() => 'https://api/items?page=1'),
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: mocks.t }) }));
vi.mock('@renderer/utils/endpointCard', () => ({ buildEndpointPreview: mocks.preview }));

import EndpointPhasePane from '../EndpointPhasePane.vue';

const FieldsStub = defineComponent({
  name: 'EndpointFieldsSection',
  props: ['modelValue', 'availableKeys', 'fieldOptions'],
  template: '<div data-testid="fields" />'
});
const PassKeysStub = defineComponent({
  name: 'EndpointPassKeys',
  props: ['passKeys', 'modelId', 'fieldOptions'],
  emits: ['update:passKeys'],
  template: '<div data-testid="pass-keys" />'
});
const TableStub = defineComponent({
  name: 'EndpointTableConfig',
  props: [
    'modelValue',
    'fieldOptions',
    'rowOptions',
    'availableKeys',
    'selfKeys',
    'levelOptions',
    'tableTesting'
  ],
  emits: ['test-table'],
  template: '<div data-testid="table" />'
});
const AdvancedStub = defineComponent({
  name: 'EndpointAdvancedSection',
  props: ['modelValue'],
  template: '<div data-testid="advanced" />'
});

let wrapper: VueWrapper | null = null;
let model: Record<string, any>;

function draft(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ep1',
    name: 'List',
    type: 'list',
    view: 'cards',
    passKeys: [],
    ...overrides
  };
}

function mountPane(props: Record<string, unknown> = {}) {
  const Host = defineComponent({
    components: { EndpointPhasePane },
    setup() {
      const value = ref<Record<string, any>>(
        draft(props.draft as Record<string, unknown> | undefined)
      );
      model = value.value;
      return { value };
    },
    template: '<EndpointPhasePane v-model="value" v-bind="attrs" />',
    props: ['attrs']
  });
  wrapper = mount(Host, {
    props: {
      attrs: {
        baseUrl: 'https://api',
        availableKeys: ['a'],
        fieldOptions: ['title'],
        rowOptions: ['id'],
        levelOptions: [{ id: 'l1', label: 'Level 1' }],
        ...props
      }
    },
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        EndpointFieldsSection: FieldsStub,
        EndpointPassKeys: PassKeysStub,
        EndpointTableConfig: TableStub,
        EndpointAdvancedSection: AdvancedStub
      }
    }
  });
  return wrapper;
}

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

beforeEach(() => {
  mocks.preview.mockReturnValue('https://api/items?page=1');
  mocks.t.mockClear();
});

describe('type and name', () => {
  it('switches between list and page and updates the name', async () => {
    mountPane();

    expect(mocks.preview).toHaveBeenCalled();
    const buttons = wrapper!.findAll('button');
    const list = buttons.find((item) => item.text() === 'sources.typeList')!;
    const page = buttons.find((item) => item.text() === 'sources.typePage')!;
    expect(list.attributes('aria-pressed')).toBe('true');

    await page.trigger('click');
    expect(model.type).toBe('page');

    const listAgain = wrapper!
      .findAll('button')
      .find((item) => item.text() === 'sources.typeList')!;
    await listAgain.trigger('click');
    expect(model.type).toBe('list');

    await wrapper!.get('[aria-label="sources.endpointName"]').setValue('Renamed');
    expect(model.name).toBe('Renamed');
  });

  it('renders the endpoint preview when available', () => {
    mountPane();

    expect(wrapper!.text()).toContain('https://api/items?page=1');
  });

  it('hides the preview when empty', () => {
    mocks.preview.mockReturnValue('');
    mountPane();

    expect(wrapper!.find('.font-mono.truncate').exists()).toBe(false);
  });
});

describe('view options', () => {
  it('renders five view buttons for list endpoints and selects one', async () => {
    mountPane();

    const group = wrapper!.get('[aria-label="sources.viewLabel"][role="group"]');
    const views = group.findAll('button');
    expect(views).toHaveLength(5);
    expect(views[0].attributes('aria-pressed')).toBe('true');

    await views[3].trigger('click');
    expect(model.view).toBe('carousel');
  });

  it('hides view options for page endpoints', () => {
    mountPane({ draft: { type: 'page' } });

    expect(wrapper!.find('[aria-label="sources.viewLabel"][role="group"]').exists()).toBe(false);
  });
});

describe('sections', () => {
  it('passes the model and options to fields, pass keys and advanced sections', () => {
    mountPane();

    expect(wrapper!.findComponent(FieldsStub).props()).toMatchObject({
      availableKeys: ['a'],
      fieldOptions: ['title']
    });
    expect(wrapper!.findComponent(PassKeysStub).props()).toMatchObject({
      modelId: 'ep1',
      fieldOptions: ['title']
    });
    expect(wrapper!.findComponent(AdvancedStub).props('modelValue')).toEqual(
      expect.objectContaining({ id: 'ep1' })
    );
  });

  it('forwards model updates from nested sections', async () => {
    mountPane();
    const pane = wrapper!.findComponent(EndpointPhasePane);
    const advanced = wrapper!.findComponent(AdvancedStub);

    advanced.vm.$emit('update:modelValue', { ...model, id: 'advanced' });
    await wrapper!.vm.$nextTick();
    expect((wrapper!.vm as unknown as { value: Record<string, any> }).value.id).toBe('advanced');

    advanced.vm.$emit('update:modelValue', { ...model, name: 'Advanced' });
    await wrapper!.vm.$nextTick();

    const passKeys = wrapper!.findComponent(PassKeysStub);
    passKeys.vm.$emit('update:passKeys', ['k1']);
    expect((wrapper!.vm as unknown as { value: Record<string, any> }).value.passKeys).toEqual([
      'k1'
    ]);

    const fields = wrapper!.findComponent(FieldsStub);
    fields.vm.$emit('update:modelValue', {
      ...(wrapper!.vm as unknown as { value: Record<string, any> }).value,
      name: 'From fields'
    });
    await wrapper!.vm.$nextTick();
    expect((wrapper!.vm as unknown as { value: Record<string, any> }).value.name).toBe(
      'From fields'
    );

    expect(pane.emitted('test')).toBeUndefined();
  });

  it('shows table config only for page endpoints and forwards test-table', async () => {
    mountPane({ draft: { type: 'list' } });
    expect(wrapper!.find('[data-testid="table"]').exists()).toBe(false);

    wrapper!.unmount();
    mountPane({ draft: { type: 'page' }, selfKeys: ['nested'], tableTesting: true });

    const table = wrapper!.findComponent(TableStub);
    expect(table.props()).toMatchObject({
      selfKeys: ['nested'],
      rowOptions: ['id'],
      levelOptions: [{ id: 'l1', label: 'Level 1' }],
      tableTesting: true
    });

    table.vm.$emit('test-table');
    expect(wrapper!.findComponent(EndpointPhasePane).emitted('test-table')).toHaveLength(1);

    table.vm.$emit('update:modelValue', {
      ...(wrapper!.vm as unknown as { value: Record<string, any> }).value,
      name: 'From table'
    });
    await wrapper!.vm.$nextTick();
    expect((wrapper!.vm as unknown as { value: Record<string, any> }).value.name).toBe(
      'From table'
    );
  });
});

describe('testing button', () => {
  it('emits test and shows a spinner while testing', async () => {
    mountPane({ testing: false });
    const button = wrapper!.get('[data-testid="endpoint-test"]');
    expect(button.attributes('disabled')).toBeUndefined();

    await button.trigger('click');
    expect(wrapper!.findComponent(EndpointPhasePane).emitted('test')).toHaveLength(1);

    wrapper!.unmount();
    mountPane({ testing: true });
    const busy = wrapper!.get('[data-testid="endpoint-test"]');
    expect(busy.attributes('disabled')).toBeDefined();
    expect(busy.html()).toContain('animate-spin');
  });
});
