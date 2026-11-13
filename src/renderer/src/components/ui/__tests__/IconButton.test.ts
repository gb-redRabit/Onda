import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

import IconButton from '../IconButton.vue';

const Icon = defineComponent({
  name: 'FakeIcon',
  props: { size: { type: Number } },
  setup: (props) => () => h('svg', { 'data-size': props.size })
});

describe('IconButton', () => {
  it('uses the label as accessible name and tooltip', () => {
    const wrapper = mount(IconButton, { props: { icon: Icon, label: 'Play' } });
    const button = wrapper.get('button');

    expect(button.attributes('aria-label')).toBe('Play');
    expect(button.attributes('title')).toBe('Play');
    expect(button.attributes('type')).toBe('button');
  });

  it('prefers an explicit title and renders the icon at the default size', () => {
    const wrapper = mount(IconButton, {
      props: { icon: Icon, label: 'Play', title: 'Play now' }
    });

    expect(wrapper.get('button').attributes('title')).toBe('Play now');
    expect(wrapper.get('svg').attributes('data-size')).toBe('14');
  });

  it('passes a custom icon size', () => {
    const wrapper = mount(IconButton, { props: { icon: Icon, label: 'x', size: 22 } });

    expect(wrapper.get('svg').attributes('data-size')).toBe('22');
  });

  it('defaults aria-pressed to false and reflects explicit state', () => {
    const off = mount(IconButton, { props: { label: 'x' } });
    expect(off.get('button').attributes('aria-pressed')).toBe('false');

    const explicitOff = mount(IconButton, { props: { label: 'x', pressed: false } });
    expect(explicitOff.get('button').attributes('aria-pressed')).toBe('false');

    const on = mount(IconButton, { props: { label: 'x', pressed: true } });
    expect(on.get('button').attributes('aria-pressed')).toBe('true');
    expect(on.get('button').classes()).toContain('bg-primary/15');
    expect(on.get('button').classes()).toContain('text-primary-text');
  });

  it('styles the danger and primary variants', () => {
    const danger = mount(IconButton, { props: { label: 'x', variant: 'danger' } });
    expect(danger.get('button').classes()).toContain('text-error');

    const primary = mount(IconButton, { props: { label: 'x', variant: 'primary' } });
    expect(primary.get('button').classes()).toContain('text-primary-text');
  });

  it('applies hover styling when unpressed and default', () => {
    const wrapper = mount(IconButton, { props: { label: 'x' } });

    expect(wrapper.get('button').classes()).toContain('text-base-content/55');
  });

  it('lets the slot override the icon', () => {
    const wrapper = mount(IconButton, {
      props: { icon: Icon, label: 'x' },
      slots: { default: '<span data-testid="custom">i</span>' }
    });

    expect(wrapper.find('[data-testid="custom"]').exists()).toBe(true);
    expect(wrapper.find('svg').exists()).toBe(false);
  });

  it('emits the click event', async () => {
    const wrapper = mount(IconButton, { props: { label: 'x' } });

    await wrapper.get('button').trigger('click');

    const events = wrapper.emitted('click')!;
    expect(events).toHaveLength(1);
    expect(events[0][0]).toBeInstanceOf(MouseEvent);
  });
});
