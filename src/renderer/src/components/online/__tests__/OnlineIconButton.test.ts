import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import OnlineIconButton from '../OnlineIconButton.vue';

function mountButton(active: boolean) {
  return mount(OnlineIconButton, {
    props: { active, title: 'Toggle preview' },
    slots: { default: '<svg />' }
  });
}

describe('OnlineIconButton', () => {
  it('recomputes the active classes when the prop changes', async () => {
    const wrapper = mountButton(false);
    expect(wrapper.classes()).not.toContain('bg-base-content/10');

    await wrapper.setProps({ active: true });
    expect(wrapper.classes()).toContain('bg-base-content/10');
    expect(wrapper.classes()).toContain('text-base-content');

    await wrapper.setProps({ active: false });
    expect(wrapper.classes()).not.toContain('bg-base-content/10');
  });

  it('uses the title as the accessible name', () => {
    const wrapper = mountButton(false);
    expect(wrapper.attributes('aria-label')).toBe('Toggle preview');
  });

  it('emits click events from the native button', async () => {
    const wrapper = mountButton(false);

    await wrapper.trigger('click');

    expect(wrapper.emitted('click')).toHaveLength(1);
    expect(wrapper.emitted('click')?.[0]?.[0]).toBeInstanceOf(MouseEvent);
  });
});
