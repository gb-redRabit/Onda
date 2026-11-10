import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, reactive } from 'vue';

const h = vi.hoisted(() => ({
  model: null as any,
  testTable: vi.fn()
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));

const SettingsToggleStub = defineComponent({
  name: 'SettingsToggle',
  props: { modelValue: Boolean, label: String },
  emits: ['update:modelValue'],
  template: '<button data-testid="toggle" @click="$emit(\'update:modelValue\', !modelValue)" />'
});
const FieldLabelStub = defineComponent({
  name: 'FieldLabel',
  props: ['text', 'tight'],
  template: '<span data-testid="field-label">{{ text }}</span>'
});
const PassKeyRowStub = defineComponent({
  name: 'PassKeyRow',
  props: ['modelValue', 'options', 'idBase'],
  emits: ['update:modelValue', 'remove'],
  template: '<button data-testid="pass-key" @click="$emit(\'remove\')" />'
});
const RowFieldsStub = defineComponent({
  name: 'EndpointTableRowFields',
  props: ['modelValue', 'rowOptions', 'idBase'],
  emits: ['update:modelValue'],
  template: '<div data-testid="row-fields" />'
});

import EndpointTableConfig from '../EndpointTableConfig.vue';

let wrapper: VueWrapper | null = null;

function draft(overrides: Record<string, unknown> = {}) {
  return reactive({
    id: 'e1',
    type: 'page' as string,
    tableEnabled: true,
    tableView: 'table',
    tableMode: 'endpoint',
    tablePath: '',
    tableArrayField: '',
    tableChildId: '',
    tablePassKeys: [] as Array<Record<string, unknown>>,
    ...overrides
  });
}

function setup(props: Record<string, unknown> = {}) {
  wrapper = mount(EndpointTableConfig, {
    props: {
      modelValue: h.model,
      'onUpdate:modelValue': (value: unknown) => Object.assign(h.model, value),
      fieldOptions: ['items', 'data'],
      rowOptions: ['title', 'url'],
      availableKeys: ['path', 'id'],
      levelOptions: [
        { id: 'details', label: 'Details' },
        { id: 'player', label: 'Player' }
      ],
      tableTesting: false,
      'onTest-table': h.testTable,
      ...props
    } as never,
    global: {
      mocks: { $t: (key: string) => key, t: (key: string) => key },
      stubs: {
        SettingsToggle: SettingsToggleStub,
        FieldLabel: FieldLabelStub,
        PassKeyRow: PassKeyRowStub,
        EndpointTableRowFields: RowFieldsStub
      }
    }
  });
  return wrapper;
}

beforeEach(() => {
  h.testTable.mockReset();
  h.model = draft();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('page gating', () => {
  it('renders nothing for non-page endpoints', () => {
    h.model = draft({ type: 'list' });
    setup();
    expect(wrapper!.find('[data-testid="toggle"]').exists()).toBe(false);
  });

  it('toggles the table and runs a table test', async () => {
    setup();

    await wrapper!.get('[data-testid="toggle"]').trigger('click');
    expect(h.model.tableEnabled).toBe(false);

    const test = wrapper!
      .findAll('button')
      .find((button) => button.text().includes('sources.testTable'))!;
    await test.trigger('click');
    expect(h.testTable).toHaveBeenCalledTimes(1);
  });

  it('emits test-table from the button and disables it while testing', async () => {
    const handler = h.testTable;
    wrapper = mount(EndpointTableConfig, {
      props: {
        modelValue: h.model,
        fieldOptions: [],
        rowOptions: [],
        availableKeys: [],
        levelOptions: [],
        tableTesting: true,
        'onTest-table': handler
      } as never,
      global: {
        mocks: { $t: (key: string) => key },
        stubs: {
          SettingsToggle: SettingsToggleStub,
          FieldLabel: FieldLabelStub,
          PassKeyRow: PassKeyRowStub,
          EndpointTableRowFields: RowFieldsStub
        }
      }
    });

    const test = wrapper
      .findAll('button')
      .find((button) => button.text().includes('sources.testTable'))!;
    expect(test.attributes('disabled')).toBeDefined();
    expect(test.find('.animate-spin').exists()).toBe(true);
  });

  it('hides the configuration when the table is disabled', async () => {
    h.model = draft({ tableEnabled: false });
    setup();

    expect(wrapper!.find('[aria-label="sources.viewTable"]').exists()).toBe(false);
    expect(wrapper!.find('[data-testid="row-fields"]').exists()).toBe(false);
  });
});

describe('table views', () => {
  it('renders every view and updates the selection', async () => {
    setup();
    const views = wrapper!.findAll('[role="group"] button');

    expect(views).toHaveLength(5);
    expect(views[0].attributes('aria-pressed')).toBe('true');
    expect(views[0].classes()).toContain('bg-primary');

    await views[2].trigger('click');
    expect(h.model.tableView).toBe('compact');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.findAll('[role="group"] button')[2].classes()).toContain('bg-primary');
  });
});

describe('table source', () => {
  it('switches between endpoint and field sources', async () => {
    setup();
    const select = wrapper!.get('select[aria-label="sources.tableSource"]');

    expect(wrapper!.find('input[aria-label="sources.tableEndpointPath"]').exists()).toBe(true);

    (select.element as HTMLSelectElement).value = 'field';
    await select.trigger('change');
    expect(h.model.tableMode).toBe('field');
    expect(wrapper!.find('input[aria-label="sources.tableArrayField"]').exists()).toBe(true);

    (select.element as HTMLSelectElement).value = 'endpoint';
    await select.trigger('change');
    expect(h.model.tableMode).toBe('endpoint');
  });

  it('binds the endpoint path and prefers self keys in the datalist', async () => {
    h.model = draft({ selfKeys: ['own'] });
    setup({ selfKeys: ['own'] });

    const input = wrapper!.get('input[aria-label="sources.tableEndpointPath"]');
    await input.setValue('/items');
    expect(h.model.tablePath).toBe('/items');

    const options = wrapper!.findAll('datalist option');
    expect(options.map((option) => option.attributes('value'))).toEqual(['/.../{own}']);
  });

  it('falls back to available keys', () => {
    setup();
    const options = wrapper!.findAll('datalist option');
    expect(options.map((option) => option.attributes('value'))).toEqual([
      '/.../{path}',
      '/.../{id}'
    ]);
  });

  it('binds the array field and its datalist', async () => {
    h.model = draft({ tableMode: 'field' });
    setup();

    const input = wrapper!.get('input[aria-label="sources.tableArrayField"]');
    await input.setValue('data');
    expect(h.model.tableArrayField).toBe('data');
    expect(wrapper!.findAll('datalist option').map((option) => option.attributes('value'))).toEqual(
      ['items', 'data']
    );
  });
});

describe('row fields, pass keys and child level', () => {
  it('passes row options and id base to the row fields', async () => {
    h.model = draft({ tablePassKeys: [] });
    setup();
    const row = wrapper!.findComponent(RowFieldsStub);

    expect(row.props()).toMatchObject({ rowOptions: ['title', 'url'], idBase: 'e1' });

    row.vm.$emit('update:modelValue', { ...h.model, tablePath: '/updated' });
    await wrapper!.vm.$nextTick();
    expect(h.model.tablePath).toBe('/updated');
  });

  it('adds and removes pass keys', async () => {
    setup();
    const add = wrapper!
      .findAll('button')
      .find((button) => button.text().includes('sources.addPassKey'))!;

    await add.trigger('click');
    expect(h.model.tablePassKeys).toEqual([{ from: '', as: '', type: 'string' }]);
    await wrapper!.vm.$nextTick();
    expect(wrapper!.findAll('[data-testid="pass-key"]')).toHaveLength(1);

    await wrapper!.get('[data-testid="pass-key"]').trigger('click');
    expect(h.model.tablePassKeys).toEqual([]);
  });

  it('passes row options and id bases to pass key rows', async () => {
    h.model = draft({ tablePassKeys: [{ from: 'a', as: 'b', type: 'number' }] });
    setup();
    const row = wrapper!.findComponent(PassKeyRowStub);

    expect(row.props()).toMatchObject({
      options: ['title', 'url'],
      idBase: 'dl-e1-tpk0'
    });

    row.vm.$emit('update:modelValue', { from: 'x', as: 'y', type: 'string' });
    await wrapper!.vm.$nextTick();
    expect(h.model.tablePassKeys[0]).toEqual({ from: 'x', as: 'y', type: 'string' });
  });

  it('binds the child level select', async () => {
    setup();
    const select = wrapper!.get('select[aria-label="sources.openRow"]');
    expect(wrapper!.text()).toContain('sources.noChild');
    expect(wrapper!.text()).toContain('Details');

    (select.element as HTMLSelectElement).value = 'details';
    await select.trigger('change');
    expect(h.model.tableChildId).toBe('details');
  });
});
