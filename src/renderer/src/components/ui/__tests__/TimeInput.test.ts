import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import TimeInput from '../TimeInput.vue';

// Time field stores seconds in the model but shows mm:ss / h:mm:ss. A bare number
// (seconds) is accepted, invalid text never overwrites the model, and blur
// restores the last valid value.

describe('TimeInput', () => {
  it('formats seconds as mm:ss and h:mm:ss', async () => {
    expect(mount(TimeInput, { props: { modelValue: null } }).find('input').element.value).toBe('');

    const zero = mount(TimeInput, { props: { modelValue: 0 } });
    expect(zero.find('input').element.value).toBe('00:00');

    const minutes = mount(TimeInput, { props: { modelValue: 65 } });
    expect(minutes.find('input').element.value).toBe('01:05');

    const hours = mount(TimeInput, { props: { modelValue: 3661 } });
    expect(hours.find('input').element.value).toBe('1:01:01');

    const negative = mount(TimeInput, { props: { modelValue: -5 } });
    expect(negative.find('input').element.value).toBe('');
  });

  it('parses clock values and bare seconds', async () => {
    const wrapper = mount(TimeInput, { props: { modelValue: null } });
    const input = wrapper.find('input');

    await input.setValue('5');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([5]);

    await input.setValue('1:02');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([62]);

    await input.setValue('1:02:03');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([3723]);

    await input.setValue('300');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([300]);

    await wrapper.setProps({ modelValue: 300 });
    await input.setValue('');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([null]);
  });

  it('does not emit when the parsed value already matches the model', async () => {
    const wrapper = mount(TimeInput, { props: { modelValue: 65 } });

    await wrapper.find('input').setValue('01:05');

    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it('normalizes the display on blur', async () => {
    const wrapper = mount(TimeInput, { props: { modelValue: null } });
    const input = wrapper.find('input');

    await input.setValue('5');
    await input.trigger('blur');

    expect(input.element.value).toBe('00:05');
  });

  it('rejects invalid text and restores the model on blur', async () => {
    const wrapper = mount(TimeInput, { props: { modelValue: 65 } });
    const input = wrapper.find('input');

    await input.setValue('nope');

    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(input.attributes('aria-invalid')).toBe('true');
    expect(input.classes()).toContain('border-error');

    await input.trigger('blur');

    expect(input.element.value).toBe('01:05');
    expect(input.attributes('aria-invalid')).toBeUndefined();
  });

  it('rewrites the text when the model changes', async () => {
    const wrapper = mount(TimeInput, { props: { modelValue: 65 } });
    const input = wrapper.find('input');

    await wrapper.setProps({ modelValue: 66 });
    expect(input.element.value).toBe('01:06');

    await input.setValue('01:07');
    await wrapper.setProps({ modelValue: 67 });
    expect(input.element.value).toBe('01:07');

    await input.setValue('nope');
    await wrapper.setProps({ modelValue: 70 });
    expect(input.element.value).toBe('01:10');
  });

  it('applies size, invalid and forwarded attributes', () => {
    const wrapper = mount(TimeInput, {
      props: { modelValue: 0, size: 'sm', invalid: true },
      attrs: { class: 'extra', 'data-testid': 'time', title: 'Duration' }
    });
    const input = wrapper.find('input');

    expect(input.classes()).toContain('h-8');
    expect(input.classes()).toContain('extra');
    expect(input.attributes('data-testid')).toBe('time');
    expect(input.attributes('title')).toBe('Duration');
    expect(input.attributes('placeholder')).toBe('mm:ss');
    expect(input.attributes('inputmode')).toBe('numeric');
    expect(input.attributes('aria-invalid')).toBe('true');
  });
});
