import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue';

/**
 * Dialog semantics and focus management for the modal components.
 *
 * The dialogs were plain divs: no role, so assistive technology did not know a
 * dialog had opened, and focus stayed on whatever was behind the overlay —
 * tabbing walked the page underneath the dialog instead of the controls in it,
 * and closing it left focus nowhere sensible. Only one of the eleven dialogs had
 * role="dialog" at all, which is why this lives here rather than being copied
 * into each of them.
 *
 * Mount the returned ref on the dialog panel element (the one that is a sibling
 * of the click-to-dismiss backdrop, not the backdrop itself).
 */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

export interface DialogFocusOptions {
  /** Element that opens the dialog; focus returns here on close. */
  returnFocusTo?: Ref<HTMLElement | null | undefined>;
  /** Close on Escape. Defaults to false so the caller stays in charge of it. */
  closeOnEscape?: boolean;
  /** Called when Escape is pressed and closeOnEscape is set. */
  onEscape?: () => void;
}

export function useDialogFocus(panel: Ref<HTMLElement | null>, options: DialogFocusOptions = {}) {
  const { returnFocusTo, closeOnEscape = false, onEscape } = options;
  let previouslyFocused: HTMLElement | null = null;
  let listening = false;

  function focusableElements(): HTMLElement[] {
    if (!panel.value) return [];
    return Array.from(panel.value.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isVisible);
  }

  /**
   * offsetParent is the usual visibility test, but it is null whenever layout
   * has not been computed (jsdom, a hidden tab), which would drop every control
   * and make the trap fall back to the panel. Hidden state is read from the
   * attributes and computed style instead, which need no layout.
   */
  function isVisible(el: HTMLElement): boolean {
    if (el.hidden || el.closest('[hidden]')) return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  async function moveFocusIn(): Promise<void> {
    await nextTick();
    const items = focusableElements();
    // Prefer the first control; fall back to the panel so Escape and Tab still
    // reach the dialog.
    (items[0] ?? panel.value)?.focus();
  }

  function restoreFocus(): void {
    const target = returnFocusTo?.value ?? previouslyFocused;
    target?.focus?.();
  }

  function onKeydownOutside(e: KeyboardEvent): void {
    // The overlay is teleported to <body>, so the dialog is not inside this
    // component's tree; listen on document to catch Escape and Tab once focus
    // has moved into the dialog itself.
    if (!panel.value) return;
    if (e.key === 'Escape' && closeOnEscape) {
      onEscape?.();
      return;
    }
    if (e.key !== 'Tab') return;
    // Read where focus actually is rather than e.target: the overlay is
    // teleported to <body>, and a Tab dispatched on the document has no useful
    // target even though focus is inside the dialog.
    const active = document.activeElement;
    if (!active || !panel.value.contains(active)) return;
    const items = focusableElements();
    if (items.length === 0) {
      e.preventDefault();
      panel.value.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function start(): void {
    if (listening) return;
    previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    listening = true;
    document.addEventListener('keydown', onKeydownOutside, true);
    void moveFocusIn();
  }

  function stop(): void {
    if (!listening) return;
    listening = false;
    document.removeEventListener('keydown', onKeydownOutside, true);
    restoreFocus();
  }

  onBeforeUnmount(stop);

  // The dialogs are mounted either with v-if on the overlay (the panel ref goes
  // null and back) or with v-if on the component itself, so watching the ref
  // catches both open and close. immediate covers a dialog whose panel is
  // already rendered by the time setup runs.
  watch(panel, (el) => (el ? start() : stop()), { immediate: true });

  return { panel, focusableElements, moveFocusIn };
}
