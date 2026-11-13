import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';

const ModalStub = defineComponent({
  name: 'ModalShell',
  props: { labelledBy: { type: String }, backdrop: { type: String }, panelClass: { type: String } },
  emits: ['close', 'escape'],
  template: '<div data-testid="modal"><slot /></div>'
});

import OnlineConfirmDialog from '../OnlineConfirmDialog.vue';

function mountDialog(props: Record<string, unknown> = {}) {
  return mount(OnlineConfirmDialog, {
    props: { title: 'Are you sure?', ...props },
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { ModalShell: ModalStub }
    }
  });
}

describe('OnlineConfirmDialog', () => {
  it('renders the title and default actions', () => {
    const wrapper = mountDialog();
    const text = wrapper.text();

    expect(text).toContain('Are you sure?');
    expect(text).toContain('common.cancel');
    expect(text).toContain('common.ok');
    expect(wrapper.getComponent(ModalStub).props()).toMatchObject({
      labelledBy: 'online-confirm-dialog-title',
      backdrop: 'dim-blur'
    });
  });

  it('renders an optional message and custom texts', () => {
    const wrapper = mountDialog({
      message: 'This cannot be undone',
      confirmText: 'Delete',
      cancelText: 'Keep'
    });

    expect(wrapper.text()).toContain('This cannot be undone');
    expect(wrapper.text()).toContain('Delete');
    expect(wrapper.text()).toContain('Keep');
  });

  it('omits the message when absent', () => {
    expect(mountDialog().find('p').exists()).toBe(false);
  });

  it('styles the icon by variant', () => {
    expect(mountDialog().get('.rounded-full').classes()).toContain('bg-warning/10');
    expect(mountDialog({ variant: 'danger' }).get('.rounded-full').classes()).toContain(
      'bg-error/10'
    );
  });

  it('styles the confirm button by variant', () => {
    const buttons = mountDialog({ variant: 'danger' }).findAll('button');

    expect(buttons.at(-1)!.classes()).toContain('bg-error');
    expect(mountDialog().findAll('button').at(-1)!.classes()).toContain('bg-primary');
  });

  it('cancels from close, header and cancel button', async () => {
    const wrapper = mountDialog();

    await wrapper.get('[aria-label="common.close"]').trigger('click');
    await wrapper.findAll('button')[0].trigger('click');
    const modal = wrapper.getComponent(ModalStub);
    modal.vm.$emit('close');
    modal.vm.$emit('escape');

    expect(wrapper.emitted('cancel')!.length).toBeGreaterThanOrEqual(4);
    expect(wrapper.emitted('confirm')).toBeUndefined();
  });

  it('confirms', async () => {
    const wrapper = mountDialog();

    await wrapper.findAll('button').at(-1)!.trigger('click');

    expect(wrapper.emitted('confirm')).toEqual([[]]);
  });
});
