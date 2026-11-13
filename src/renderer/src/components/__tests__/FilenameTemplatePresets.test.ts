import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import { FILENAME_TEMPLATE_PRESETS } from '@renderer/utils/constants';
import FilenameTemplatePresets from '../FilenameTemplatePresets.vue';

function mountPresets() {
  return mount(FilenameTemplatePresets, {
    global: { mocks: { $t: (key: string) => key } }
  });
}

describe('FilenameTemplatePresets', () => {
  it('lists the placeholder and every preset', () => {
    const wrapper = mountPresets();
    const options = wrapper.findAll('option');

    expect(options).toHaveLength(FILENAME_TEMPLATE_PRESETS.length + 1);
    expect(options[0].text()).toBe('settings.templatePresets');
    expect(options.slice(1).map((o) => o.attributes('value'))).toEqual(FILENAME_TEMPLATE_PRESETS);
  });

  it('emits the chosen preset and resets the select', async () => {
    const wrapper = mountPresets();
    const select = wrapper.get('select');

    await select.setValue('{artist} - {title}');

    expect(wrapper.emitted('preset')).toEqual([['{artist} - {title}']]);
    expect((select.element as HTMLSelectElement).value).toBe('');
  });

  it('does not emit for the placeholder', async () => {
    const wrapper = mountPresets();
    const select = wrapper.get('select');

    await select.setValue('');

    expect(wrapper.emitted('preset')).toBeUndefined();
  });
});
