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

  it('warns in development about an icon button without a label', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mountButton({ size: 'icon' });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('requires a label'));
    warn.mockRestore();
  });

  it('skips the warning outside development', () => {
    vi.stubEnv('DEV', false);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      mountButton({ size: 'icon' });

      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  it('sizes the loading spinner for large buttons', () => {
    const large = mountButton({ loading: true, size: 'lg', label: 'Load' });
    const normal = mountButton({ loading: true, label: 'Load' });

    expect(large.findComponent({ name: 'Spinner' }).props('size')).toBe(18);
    expect(normal.findComponent({ name: 'Spinner' }).props('size')).toBe(15);
  });

  it('keeps slots visible but transparent while loading', () => {
    const wrapper = mount(Button, {
      props: { loading: true, label: 'Save' },
      slots: { default: 'Save', leading: '<i data-leading />', trailing: '<i data-trailing />' }
    });

    expect(wrapper.find('[data-leading]').exists()).toBe(true);
    expect(wrapper.find('[data-trailing]').exists()).toBe(true);
    expect(wrapper.find('span.opacity-0').exists()).toBe(true);
  });
});
