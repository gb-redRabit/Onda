import { describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref, type Ref, type VNode } from 'vue';
import { useDialogFocus, type DialogFocusOptions } from '../useDialogFocus';

// Static checks cover that the dialogs declare the right roles; these cover what
// the shared trap actually does, because "has role=dialog" says nothing about
// whether focus is trapped and restored.

async function mountDialog(
  render: (panel: Ref<HTMLElement | null>) => VNode[],
  options: DialogFocusOptions = {}
): Promise<{ panel: HTMLElement; unmount: () => void }> {
  const panel = ref<HTMLElement | null>(null);
  const app = createApp(
    defineComponent({
      setup() {
        useDialogFocus(panel, options);
        return () => h('div', render(panel));
      }
    })
  );
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await nextTick();
  return { panel: panel.value!, unmount: () => app.unmount() };
}

describe('useDialogFocus', () => {
  it('moves focus into the dialog and cycles Tab inside it', async () => {
    const { panel, unmount } = await mountDialog((p) => [
      h('div', { ref: p }, [
        h('button', { id: 'first' }, 'first'),
        h('button', { id: 'middle' }, 'middle'),
        h('button', { id: 'last' }, 'last')
      ])
    ]);
    expect(panel).toBeTruthy();

    const first = document.getElementById('first')!;
    const last = document.getElementById('last')!;
    expect(document.activeElement).toBe(first);

    // Forward Tab from the last control wraps to the first, not to the page.
    last.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(first);

    // Backward Tab from the first wraps to the last.
    first.focus();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true })
    );
    expect(document.activeElement).toBe(last);

    unmount();
  });

  it('restores focus to the opener when the dialog closes', async () => {
    const opener = document.createElement('button');
    opener.textContent = 'open';
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const { unmount } = await mountDialog((p) => [h('div', { ref: p }, [h('button', 'inside')])]);
    expect(document.activeElement).not.toBe(opener);

    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('keeps focus on the panel when it has no focusable control', async () => {
    const { panel, unmount } = await mountDialog((p) => [
      h('div', { ref: p, tabindex: -1 }, 'nothing to focus')
    ]);

    expect(document.activeElement).toBe(panel);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    // Focus must not escape to <body> — that is how a keyboard user ends up
    // interacting with the page behind the overlay.
    expect(document.activeElement).toBe(panel);

    unmount();
  });

  it('calls onEscape only when closeOnEscape is set', async () => {
    const onEscape = vi.fn();
    const a = await mountDialog((p) => [h('div', { ref: p }, [h('button', 'a')])], { onEscape });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onEscape).not.toHaveBeenCalled();
    a.unmount();

    const onEscape2 = vi.fn();
    const b = await mountDialog((p) => [h('div', { ref: p }, [h('button', 'b')])], {
      closeOnEscape: true,
      onEscape: onEscape2
    });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onEscape2).toHaveBeenCalledTimes(1);
    b.unmount();
  });
});
