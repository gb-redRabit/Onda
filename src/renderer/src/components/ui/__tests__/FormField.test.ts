import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import FormField from '../FormField.vue';

// Label + control slot with generated/parent-supplied ids and description wiring.

describe('FormField', () => {
  it('wires a generated id and passes it to the slot', () => {
    let slotProps: Record<string, unknown> = {};
    const wrapper = mount(FormField, {
      props: { label: 'Name' },
      slots: {
        default: (props: Record<string, unknown>) => {
          slotProps = props;
          return null;
        }
      }
    });

    const label = wrapper.find('label');
    const id = label.attributes('for');
    expect(id).toBeTruthy();
    expect(slotProps.id).toBe(id);
    expect(slotProps.describedby).toBeUndefined();
  });

  it('uses the provided control id', () => {
    const wrapper = mount(FormField, {
      props: { label: 'Name', for: 'custom-id' }
    });

    expect(wrapper.find('label').attributes('for')).toBe('custom-id');
  });

  it('describes the control with the hint when there is no error', () => {
    let describedby: unknown;
    const wrapper = mount(FormField, {
      props: { label: 'Name', for: 'f', hint: 'Short hint' },
      slots: {
        default: (props: { describedby?: string }) => {
          describedby = props.describedby;
          return null;
        }
      }
    });

    const hint = wrapper.find('#f-hint');
    expect(hint.text()).toBe('Short hint');
    expect(describedby).toBe('f-hint');
  });

  it('prefers the error over the hint and renders only the error', () => {
    let describedby: unknown;
    const wrapper = mount(FormField, {
      props: { label: 'Name', for: 'f', hint: 'Short hint', error: 'Required' },
      slots: {
        default: (props: { describedby?: string }) => {
          describedby = props.describedby;
          return null;
        }
      }
    });

    expect(wrapper.text()).toContain('Required');
    expect(wrapper.text()).not.toContain('Short hint');
    expect(wrapper.find('#f-error').text()).toBe('Required');
    expect(describedby).toBe('f-error');
  });
});
