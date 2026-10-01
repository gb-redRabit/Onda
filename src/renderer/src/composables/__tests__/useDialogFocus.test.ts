import { describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref, type Ref, type VNode } from 'vue';
import { useDialogFocus, type DialogFocusOptions } from '../useDialogFocus';

// Testy statyczne sprawdzają, że dialogi deklarują właściwe role; te sprawdzają, co
// wspólna pułapka faktycznie robi, bo "ma role=dialog" nic nie mówi o tym,
// czy fokus jest uwięziony i przywracany.

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

    // Tab w przód z ostatniej kontrolki zawija do pierwszej, nie do strony.
    last.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(first);

    // Tab w tył z pierwszej kontrolki zawija do ostatniej.
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
    // Fokus nie może uciec do <body> — tak użytkownik klawiatury kończy
    // wchodząc w interakcję ze stroną za nakładką.
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
