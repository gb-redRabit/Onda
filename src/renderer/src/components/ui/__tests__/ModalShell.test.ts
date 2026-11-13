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

  it('can disable Escape handling for dialogs that own it', async () => {
    const onClose = vi.fn();
    const wrapper = mount(ModalShell, {
      props: { visible: true, closeOnEscape: false },
      attrs: { onClose },
      slots: { default: '<p>Body</p>' },
      attachTo: document.body
    });

    await nextTick();
    pressEscape();
    expect(onClose).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});

describe('ModalShell rendering', () => {
  function mountShell(props: Record<string, unknown>, attrs: Record<string, unknown> = {}) {
    return mount(ModalShell, {
      props,
      attrs,
      slots: { default: '<p>Body</p>' },
      attachTo: document.body
    });
  }

  it('renders nothing while hidden', () => {
    mountShell({ visible: false });

    expect(document.body.textContent).not.toContain('Body');
  });

  it('renders the default dim backdrop and closes on a backdrop click', async () => {
    const onClose = vi.fn();
    mountShell({ visible: true }, { onClose });

    const backdrop = document.body.querySelector('.fixed.inset-0') as HTMLElement;
    expect(backdrop.className).toContain('bg-neutral/50');

    backdrop.click();
    await nextTick();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('supports blurred backdrop, neutral panel, testid and extra attrs', () => {
    mountShell(
      {
        visible: true,
        backdrop: 'dim-blur',
        panelTone: 'neutral',
        panelClass: 'p-4',
        labelledBy: 'title',
        backdropTestid: 'shell-backdrop',
        dismissOnBackdrop: false
      },
      { 'data-testid': 'shell-panel' }
    );

    const backdrop = document.body.querySelector('[data-testid="shell-backdrop"]') as HTMLElement;
    expect(backdrop.className).toContain('backdrop-blur-sm');

    const panel = document.body.querySelector('[role="dialog"]') as HTMLElement;
    expect(panel.className).toContain('bg-neutral');
    expect(panel.className).toContain('p-4');
    expect(panel.getAttribute('aria-labelledby')).toBe('title');
    expect(panel.getAttribute('data-testid')).toBe('shell-panel');

    backdrop.click();
    expect(backdrop.className).toContain('bg-neutral/60');
    expect(document.body.contains(panel)).toBe(true);
  });

  it('does not close when backdrop dismissal is disabled', async () => {
    const onClose = vi.fn();
    mountShell({ visible: true, dismissOnBackdrop: false }, { onClose });

    (document.body.querySelector('.fixed.inset-0') as HTMLElement).click();
    await nextTick();

    expect(onClose).not.toHaveBeenCalled();
  });

  it('omits aria-labelledby when no label is provided', () => {
    mountShell({ visible: true });

    expect(document.body.querySelector('[role="dialog"]')?.hasAttribute('aria-labelledby')).toBe(
      false
    );
  });
});
