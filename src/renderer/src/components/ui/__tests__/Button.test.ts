import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import Button from '../Button.vue';

function mountButton(props: Record<string, unknown> = {}, attrs: Record<string, unknown> = {}) {
  return mount(Button, { props, attrs });
}

describe('Button', () => {
  it('defaults to a real button with the solid md look', () => {
    const wrapper = mountButton();
    expect(wrapper.element.tagName).toBe('BUTTON');
    expect(wrapper.attributes('type')).toBe('button');
    expect(wrapper.classes()).toContain('bg-primary');
    expect(wrapper.classes()).toContain('h-8');
  });

  it('maps variants and sizes', () => {
    const wrapper = mountButton({ variant: 'ghost', size: 'sm' });
    expect(wrapper.classes()).toContain('text-base-content/70');
    expect(wrapper.classes()).toContain('h-7');
  });

  it('lets an external class win over the variant padding', () => {
    const wrapper = mountButton({}, { class: 'px-9' });
    expect(wrapper.classes()).toContain('px-9');
    expect(wrapper.classes()).not.toContain('px-3');
  });

  it('is disabled and busy while loading', () => {
    const wrapper = mountButton({ loading: true, label: 'Save' });
    expect(wrapper.attributes('disabled')).toBeDefined();
    expect(wrapper.attributes('aria-busy')).toBe('true');
  });

  it('forwards native clicks without declaring an emit', async () => {
    const onClick = vi.fn();
    const wrapper = mountButton({ label: 'Play' }, { onClick });
    await wrapper.trigger('click');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('exposes the label as the accessible name', () => {
    const wrapper = mountButton({ size: 'icon', label: 'Close' });
    expect(wrapper.attributes('aria-label')).toBe('Close');
  });
});
