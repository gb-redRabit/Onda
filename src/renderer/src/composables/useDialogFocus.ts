import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue';

/**
 * Semantyka dialogu i zarządzanie fokusem dla komponentów modalnych.
 *
 * Dialogi były zwykłymi divami: brak roli, więc technologia wspomagająca nie wiedziała,
 * że dialog został otwarty, a fokus pozostawał na tym, co było za nakładką —
 * tabowanie przechodziło po stronie pod dialogiem zamiast po kontrolkach w nim,
 * a zamknięcie pozostawiało fokus w losowym miejscu. Tylko jeden z jedenastu dialogów
 * miał w ogóle role="dialog", dlatego to jest tutaj, zamiast być kopiowane
 * do każdego z nich.
 *
 * Zamontuj zwracany ref na elemencie panelu dialogu (tym, który jest rodzeństwem
 * tła zamykającego po kliknięciu, nie na samym tle).
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
  /** Element, który otwiera dialog; fokus tu wraca po zamknięciu. */
  returnFocusTo?: Ref<HTMLElement | null | undefined>;
  /** Zamknij na Escape. Domyślnie false, więc wywołujący pozostaje za to odpowiedzialny. */
  closeOnEscape?: boolean;
  /** Wywoływane, gdy Escape zostanie wciśnięty i closeOnEscape jest ustawione. */
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
   * offsetParent to typowy test widoczności, ale jest null, gdy układ nie został
   * obliczony (jsdom, ukryta karta), co odrzuciłoby każdą kontrolkę i zmusiło pułapkę
   * do cofnięcia się do panelu. Stan ukrycia czytamy z atrybutów i computed style,
   * które nie wymagają układu.
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
    // Preferuj pierwszą kontrolkę; cofnij się do panelu, żeby Escape i Tab nadal
    // docierały do dialogu.
    (items[0] ?? panel.value)?.focus();
  }

  function restoreFocus(): void {
    const target = returnFocusTo?.value ?? previouslyFocused;
    target?.focus?.();
  }

  function onKeydownOutside(e: KeyboardEvent): void {
    // Nakładka jest teleportowana do <body>, więc dialog nie znajduje się w drzewie
    // tego komponentu; nasłuchujemy na document, żeby złapać Escape i Tab, gdy fokus
    // znajdzie się już wewnątrz samego dialogu.
    if (!panel.value) return;
    if (e.key === 'Escape' && closeOnEscape) {
      onEscape?.();
      return;
    }
    if (e.key !== 'Tab') return;
    // Czytaj, gdzie faktycznie jest fokus, zamiast e.target: nakładka jest
    // teleportowana do <body>, a Tab wysłany na document nie ma użytecznego
    // celu, mimo że fokus jest wewnątrz dialogu.
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

  // Dialogi są montowane albo z v-if na nakładce (ref panelu staje się null
  // i wraca), albo z v-if na samym komponencie, więc obserwacja ref łapie
  // zarówno otwarcie, jak i zamknięcie. immediate obejmuje dialog, którego panel
  // jest już wyrenderowany, zanim uruchomi się setup.
  watch(panel, (el) => (el ? start() : stop()), { immediate: true });

  return { panel, focusableElements, moveFocusIn };
}
