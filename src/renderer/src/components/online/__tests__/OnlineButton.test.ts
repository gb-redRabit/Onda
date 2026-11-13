import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import OnlineButton from '../OnlineButton.vue';

const variants = {
  primary: 'bg-primary',
  secondary: 'bg-base-100',
  ghost: 'text-base-content/70',
  danger: 'text-base-content/70'
} as const;

describe('OnlineButton', () => {
  it('uses the secondary medium defaults', () => {
    const button = mount(OnlineButton).get('button');

    expect(button.attributes('type')).toBe('button');
    expect(button.classes()).toContain('bg-base-100');
    expect(button.classes()).toContain('text-sm');
    expect(button.classes()).toContain('inline-flex');
  });

  it.each(Object.entries(variants))('applies the %s variant', (variant, cls) => {
    const button = mount(OnlineButton, { props: { variant: variant as never } }).get('button');

    expect(button.classes()).toContain(cls);
  });

  it('applies the small size', () => {
    const button = mount(OnlineButton, { props: { size: 'sm' } }).get('button');

    expect(button.classes()).toContain('text-xs');
    expect(button.classes()).not.toContain('text-sm');
  });

  it('forwards disabled, title and submit type', () => {
    const button = mount(OnlineButton, {
      props: { disabled: true, title: 'Tooltip', type: 'submit' }
    }).get('button');

    expect(button.attributes('disabled')).toBe('');
    expect(button.attributes('title')).toBe('Tooltip');
    expect(button.attributes('type')).toBe('submit');
  });

  it('renders slot content and emits clicks', async () => {
    const wrapper = mount(OnlineButton, { slots: { default: 'Save' } });

    await wrapper.get('button').trigger('click');

    expect(wrapper.text()).toBe('Save');
    const events = wrapper.emitted('click')!;
    expect(events[0][0]).toBeInstanceOf(MouseEvent);
  });
});
