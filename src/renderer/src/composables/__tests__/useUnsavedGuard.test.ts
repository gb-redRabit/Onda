import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createApp, defineComponent, h, ref } from 'vue';
import { useUnsavedGuard, type UnsavedGuardOptions } from '../useUnsavedGuard';

// Trzy dialogi miały własną kopię zabezpieczenia podwójnego kliknięcia i
// rozjechały się: różne okna resetu, a jeden z nich powiadamiał przy kliknięciu
// zamykającym dialog, gdy pozostałe powiadamiały przy obu kliknięciach. Te testy
// przypinają współdzielone zachowanie i opcje, które zapisują te różnice.

/**
 * Composable rejestruje onBeforeUnmount, więc musi być wywoływany z wnętrza
 * komponentu. createApp do jsdom zastępuje helper montujący — repo nie ma
 * @vue/test-utils i to nie jest warte zależności.
 */
function mountGuard(overrides: Partial<UnsavedGuardOptions> = {}) {
  const dirty = ref(false);
  const onClose = vi.fn();
  const onDirtyHint = vi.fn();
  const onCleanHint = vi.fn();
  let guard: ReturnType<typeof useUnsavedGuard>;

  const Comp = defineComponent({
    setup() {
      guard = useUnsavedGuard({
        isDirty: () => dirty.value,
        onClose,
        onDirtyHint,
        onCleanHint,
        ...overrides
      });
      return () => h('div');
    }
  });

  const el = document.createElement('div');
  document.body.appendChild(el);
  const app = createApp(Comp);
  app.mount(el);

  return {
    dirty,
    onClose,
    onDirtyHint,
    onCleanHint,
    click: () => guard.onOverlayClick(),
    reset: () => guard.reset(),
    unmount: () => {
      app.unmount();
      el.remove();
    }
  };
}

describe('useUnsavedGuard', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('closes on the second click inside the window', () => {
    const g = mountGuard();
    g.click();
    expect(g.onClose).not.toHaveBeenCalled();
    g.click();
    expect(g.onClose).toHaveBeenCalledTimes(1);
    g.unmount();
  });

  it('does not close when the second click comes after the window lapses', () => {
    const g = mountGuard();
    g.click();
    vi.advanceTimersByTime(2001);
    g.click();
    expect(g.onClose).not.toHaveBeenCalled();
    g.click();
    expect(g.onClose).toHaveBeenCalledTimes(1);
    g.unmount();
  });

  it('warns while dirty and hints while clean', () => {
    const g = mountGuard();
    g.dirty.value = true;
    g.click();
    expect(g.onDirtyHint).toHaveBeenCalledTimes(1);
    expect(g.onCleanHint).not.toHaveBeenCalled();
    g.unmount();
  });

  it('reads isDirty on every click, not once at setup', () => {
    const g = mountGuard();
    g.dirty.value = false;
    g.click();
    g.dirty.value = true;
    g.click();
    // Drugie kliknięcie zamyka i musi być ocenione względem bieżącej wartości.
    expect(g.onClose).toHaveBeenCalledTimes(1);
    expect(g.onDirtyHint).toHaveBeenCalledTimes(1);
    g.unmount();
  });

  it('gives a dirty click a longer window than a clean one', () => {
    const g = mountGuard({ windowMs: 2000, dirtyWindowMs: 2500 });
    g.dirty.value = true;
    g.click();
    vi.advanceTimersByTime(2100);
    g.click();
    // 2100 ms mija czyste okno, ale mieści się w brudnym.
    expect(g.onClose).toHaveBeenCalledTimes(1);
    g.unmount();
  });

  it('notifies on the closing click by default', () => {
    const g = mountGuard();
    g.click();
    g.click();
    expect(g.onCleanHint).toHaveBeenCalledTimes(2);
    g.unmount();
  });

  it('skips the closing notification when notifyOnClosingClick is false', () => {
    const g = mountGuard({ notifyOnClosingClick: false });
    g.click();
    g.click();
    expect(g.onCleanHint).toHaveBeenCalledTimes(1);
    g.unmount();
  });

  it('starts from a clean slate after closing', () => {
    const g = mountGuard({ notifyOnClosingClick: false });
    g.click();
    g.click();
    expect(g.onClose).toHaveBeenCalledTimes(1);

    // Ponowne otwarcie nie może potraktować pierwszego kliknięcia jako drugiej połowy pary.
    g.onCleanHint.mockClear();
    g.click();
    expect(g.onClose).toHaveBeenCalledTimes(1);
    g.click();
    expect(g.onClose).toHaveBeenCalledTimes(2);
    g.unmount();
  });

  it('clears its timer on unmount', () => {
    const g = mountGuard();
    g.click();
    g.unmount();
    vi.advanceTimersByTime(5000);
    // Reset uruchamiany przy odmontowaniu nie może rzucić ani wywołać późnego zamknięcia.
    expect(g.onClose).not.toHaveBeenCalled();
  });
});
