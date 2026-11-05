import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import ModalShell from '../ModalShell.vue';

function pressEscape(): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('ModalShell escape handling', () => {
  it('closes by default when the parent does not listen for escape', async () => {
    const onClose = vi.fn();
    const wrapper = mount(ModalShell, {
      props: { visible: true, labelledBy: 'modal-title' },
      attrs: { onClose },
      slots: { default: '<h2 id="modal-title">Title</h2>' },
      attachTo: document.body
    });

    await nextTick();
    pressEscape();
    expect(onClose).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('lets a parent veto escape and does not close', async () => {
    const onClose = vi.fn();
    const onEscape = vi.fn();
    const wrapper = mount(ModalShell, {
      props: { visible: true, labelledBy: 'modal-title' },
      attrs: { onClose, onEscape },
      slots: { default: '<h2 id="modal-title">Title</h2>' },
      attachTo: document.body
    });

    await nextTick();
    pressEscape();
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
