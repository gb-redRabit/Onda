import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';

import Input from '../Input.vue';

// Wspólne pole tekstowe: klasy zależne od rozmiaru/walidacji, attr `class` z zewnątrz
// przechodzi przez `cn`, a natywne focus/select/blur są wystawione dla skrótów.

function mountInput(props: Record<string, unknown> = {}, attrs: Record<string, unknown> = {}) {
  return mount(Input, { props: { modelValue: '', ...props }, attrs });
}

describe('Input', () => {
  it('renders a text input with the medium size by default', () => {
    const wrapper = mountInput();
    const input = wrapper.find('input');

    expect(input.attributes('type')).toBe('text');
    expect(input.classes()).toContain('h-9');
    expect(input.classes()).toContain('text-sm');
    expect(input.attributes('aria-invalid')).toBeUndefined();
  });

  it('supports the small size and custom types', () => {
    const input = mountInput({ size: 'sm', type: 'search' }).find('input');

    expect(input.classes()).toContain('h-8');
    expect(input.classes()).toContain('text-xs');
    expect(input.attributes('type')).toBe('search');
  });

  it('marks invalid fields for assistive tech', () => {
    const input = mountInput({ invalid: true }).find('input');

    expect(input.attributes('aria-invalid')).toBe('true');
    expect(input.classes()).toContain('border-error');
  });

  it('keeps the neutral border for valid fields', () => {
    const input = mountInput().find('input');

    expect(input.classes()).toContain('border-base-content/15');
  });

  it('merges caller classes and forwards remaining attrs', () => {
    const input = mountInput({}, { class: 'w-64', placeholder: 'Search', 'data-testid': 'q' }).find(
      'input'
    );

    expect(input.classes()).toContain('w-64');
    expect(input.attributes('placeholder')).toBe('Search');
    expect(input.attributes('data-testid')).toBe('q');
  });

  it('emits v-model updates from the native input', async () => {
    const wrapper = mountInput({ modelValue: 'old' });
    const input = wrapper.find('input');

    await input.setValue('new');

    expect(wrapper.emitted('update:modelValue')).toEqual([['new']]);
  });

  it('exposes focus, select and blur on the native element', () => {
    const wrapper = mountInput();
    const input = wrapper.find('input');
    const el = input.element as HTMLInputElement;
    const focus = vi.spyOn(el, 'focus').mockImplementation(() => {});
    const select = vi.spyOn(el, 'select').mockImplementation(() => {});
    const blur = vi.spyOn(el, 'blur').mockImplementation(() => {});

    (wrapper.vm as unknown as { focus: () => void }).focus();
    (wrapper.vm as unknown as { select: () => void }).select();
    (wrapper.vm as unknown as { blur: () => void }).blur();

    expect(focus).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledTimes(1);
    expect(blur).toHaveBeenCalledTimes(1);
  });

  it('accepts numeric models', async () => {
    const wrapper = mountInput({ modelValue: 5, type: 'number' });

    await wrapper.find('input').setValue('7');

    expect(wrapper.emitted('update:modelValue')).toEqual([[7]]);
  });
});
