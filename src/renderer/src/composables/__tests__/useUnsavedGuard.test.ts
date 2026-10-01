import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createApp, defineComponent, h, ref } from 'vue';
import { useUnsavedGuard, type UnsavedGuardOptions } from '../useUnsavedGuard';

// Three dialogs had their own copy of the double-click-to-close guard and they
// had drifted: different reset windows, and one of them notified on the click
// that closed the dialog while the others notified on both clicks. These tests
// pin the shared behaviour and the options that record those differences.

/**
 * The composable registers onBeforeUnmount, so it has to be called from inside
 * a component. createApp into jsdom stands in for a mount helper — the repo has
 * no @vue/test-utils and this is not worth a dependency.
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
    // The second click closes, and it must be judged against the current value.
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
    // 2100 ms is past the clean window but inside the dirty one.
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

    // A reopen must not treat the first click as the second half of a pair.
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
    // The reset that runs on unmount must not throw or fire a late close.
    expect(g.onClose).not.toHaveBeenCalled();
  });
});
