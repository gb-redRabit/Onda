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

import EndpointFieldsSection from '../EndpointFieldsSection.vue';

function draft(over: Record<string, unknown> = {}) {
  return {
    id: 'ep-1',
    path: '/series',
    fTitle: 'title',
    fThumbnail: 'thumb',
    fSubtitle: 'sub',
    fMediaUrl: 'media',
    fPlayerUrl: 'player',
    ...over
  };
}

function mountFields(over: Record<string, unknown> = {}, mode = draft()) {
  return mount(EndpointFieldsSection, {
    props: {
      availableKeys: ['id', 'page'],
      fieldOptions: ['title', 'url'],
      modelValue: mode as never,
      ...over
    },
    global: { stubs: { FieldLabel: LabelStub } }
  });
}

describe('EndpointFieldsSection', () => {
  it('binds all endpoint inputs', () => {
    const wrapper = mountFields();
    const inputs = wrapper.findAll('input');

    expect(inputs).toHaveLength(6);
    expect(inputs.map((i) => (i.element as HTMLInputElement).value)).toEqual([
      '/series',
      'title',
      'thumb',
      'sub',
      'media',
      'player'
    ]);
  });

  it('builds datalist ids from the endpoint id', () => {
    const wrapper = mountFields();
    const inputs = wrapper.findAll('input');
    const datalists = wrapper.findAll('datalist');

    expect(inputs.map((i) => i.attributes('list'))).toEqual([
      'dl-ep-1-path',
      'dl-ep-1-title',
      'dl-ep-1-thumb',
      'dl-ep-1-sub',
      'dl-ep-1-media',
      'dl-ep-1-player'
    ]);
    expect(datalists.map((d) => d.attributes('id'))).toEqual(
      inputs.map((i) => i.attributes('list'))
    );
  });

  it('offers available path keys', () => {
    const wrapper = mountFields();
    const options = wrapper.findAll('datalist')[0].findAll('option');

    expect(options.map((o) => o.attributes('value'))).toEqual(['{id}', '{page}']);
    expect(wrapper.text()).toContain('sources.availableKeys');
    expect(wrapper.text()).toContain('{id} {page}');
  });

  it('hides the keys hint when none are available', () => {
    const wrapper = mountFields({ availableKeys: [] });

    expect(wrapper.text()).not.toContain('sources.availableKeys');
  });

  it('lists field options in each mapping datalist', () => {
    const wrapper = mountFields();

    for (const list of wrapper.findAll('datalist').slice(1)) {
      expect(list.findAll('option').map((o) => o.attributes('value'))).toEqual(['title', 'url']);
    }
  });

  it('writes edits back into the draft object', async () => {
    const model = draft();
    const wrapper = mountFields({}, model);
    const inputs = wrapper.findAll('input');

    await inputs[0].setValue('/new');
    await inputs[1].setValue('newTitle');
    await inputs[2].setValue('newThumb');
    await inputs[3].setValue('newSub');
    await inputs[4].setValue('newMedia');
    await inputs[5].setValue('newPlayer');

    expect(model).toMatchObject({
      path: '/new',
      fTitle: 'newTitle',
      fThumbnail: 'newThumb',
      fSubtitle: 'newSub',
      fMediaUrl: 'newMedia',
      fPlayerUrl: 'newPlayer'
    });
  });

  it('renders the section labels', () => {
    const labels = mountFields()
      .findAll('[data-testid="label"]')
      .map((l) => l.text());

    expect(labels).toEqual(['sources.display', 'sources.downloadField', 'sources.fPlayerUrl']);
  });
});
