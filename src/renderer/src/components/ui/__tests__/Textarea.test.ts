import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import Textarea from '../Textarea.vue';

// Multiline input mirroring ui/Input styling and v-model behaviour.

describe('Textarea', () => {
  it('renders a three-row medium textarea by default', () => {
    const area = mount(Textarea, { props: { modelValue: 'abc' } }).find('textarea');

    expect(area.attributes('rows')).toBe('3');
    expect(area.classes()).toContain('px-3');
    expect(area.classes()).toContain('text-sm');
    expect(area.attributes('aria-invalid')).toBeUndefined();
    expect((area.element as HTMLTextAreaElement).value).toBe('abc');
  });

  it('supports compact rows and invalid styling', () => {
    const area = mount(Textarea, {
      props: { modelValue: '', rows: 6, size: 'sm', invalid: true }
    }).find('textarea');

    expect(area.attributes('rows')).toBe('6');
    expect(area.classes()).toContain('px-2.5');
    expect(area.classes()).toContain('border-error');
    expect(area.attributes('aria-invalid')).toBe('true');
  });

  it('uses the neutral border for valid fields', () => {
    expect(
      mount(Textarea, { props: { modelValue: '' } })
        .find('textarea')
        .classes()
    ).toContain('border-base-content/15');
  });

  it('emits v-model updates and forwards attrs/classes', async () => {
    const wrapper = mount(Textarea, {
      props: { modelValue: '' },
      attrs: { class: 'h-40', placeholder: 'Notes', 'data-testid': 'notes' }
    });
    const area = wrapper.find('textarea');

    await area.setValue('text');

    expect(wrapper.emitted('update:modelValue')).toEqual([['text']]);
    expect(area.classes()).toContain('h-40');
    expect(area.attributes('placeholder')).toBe('Notes');
    expect(area.attributes('data-testid')).toBe('notes');
  });
});
