import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';

const h = vi.hoisted(() => ({
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: h.t }) }));

const LabelStub = defineComponent({
  name: 'FieldLabel',
  props: {
    text: { type: String },
    upper: { type: Boolean },
    tight: { type: Boolean }
  },
  template: '<div data-testid="label">{{ text }}</div>'
});

import EndpointTableRowFields from '../EndpointTableRowFields.vue';

function emptyModel() {
  return {
    tableTitle: '',
    tableThumbnail: '',
    tablePlayerUrl: '',
    tableRowKey: ''
  };
}

function mountFields(model: Record<string, unknown> = emptyModel(), rowOptions = ['name', 'id']) {
  return mount(EndpointTableRowFields, {
    props: {
      rowOptions,
      idBase: 'endpoint',
      modelValue: model as never
    },
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { FieldLabel: LabelStub }
    }
  });
}

beforeEach(() => {
  h.t.mockClear();
});

describe('EndpointTableRowFields', () => {
  it('renders four labelled inputs with datalists', () => {
    const mounted = mountFields();
    const labels = mounted.findAll('[data-testid="label"]').map((l) => l.text());

    expect(labels).toEqual([
      'sources.tableRowTitle',
      'sources.tableRowThumb',
      'sources.tableRowPlayer',
      'sources.tableRowKey'
    ]);
    expect(mounted.findAll('input')).toHaveLength(4);
    expect(mounted.findAll('datalist')).toHaveLength(4);
    expect(
      mounted
        .findAll('datalist')[0]
        .findAll('option')
        .map((o) => o.attributes('value'))
    ).toEqual(['{name}', '{id}']);
    expect(
      mounted
        .findAll('datalist')[1]
        .findAll('option')
        .map((o) => o.attributes('value'))
    ).toEqual(['name', 'id']);
  });

  it('uses stable ids for list bindings', () => {
    const mounted = mountFields();
    const inputs = mounted.findAll('input');
    const datalists = mounted.findAll('datalist');

    expect(inputs[0].attributes('list')).toBe('dl-endpoint-ttitle');
    expect(datalists[0].attributes('id')).toBe('dl-endpoint-ttitle');
    expect(inputs[3].attributes('list')).toBe('dl-endpoint-trowkey');
  });

  it('shows the row key example', () => {
    expect(mountFields().findAll('input')[3].attributes('placeholder')).toBe(
      'anime_episode_number'
    );
  });

  it('writes every field back to the model object', async () => {
    const model = emptyModel();
    const mounted = mountFields(model);
    const inputs = mounted.findAll('input');

    await inputs[0].setValue('Episode {n}');
    await inputs[1].setValue('bg');
    await inputs[2].setValue('player');
    await inputs[3].setValue('key');

    expect(model).toMatchObject({
      tableTitle: 'Episode {n}',
      tableThumbnail: 'bg',
      tablePlayerUrl: 'player',
      tableRowKey: 'key'
    });
  });
});
