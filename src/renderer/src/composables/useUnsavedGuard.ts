import { onBeforeUnmount } from 'vue';

/**
 * "Click outside twice to close" guard for dialogs with editable fields.
 *
 * Three dialogs each carried their own copy of this: a click counter, a reset
 * timer, a dirty check and the two notifications. They had drifted — the tag
 * editor used a 2.5 s window where the others used 2 s, and it only notified on
 * the first click while the other two notified on both, including the click
 * that closed the dialog. The differences are now named options rather than
 * three subtly different hand-rolled versions.
 */
export interface UnsavedGuardOptions {
  /** Recomputed on every click, so it must read current state, not a snapshot. */
  isDirty: () => boolean;
  /** Called on the click that actually closes. */
  onClose: () => void;
  /** Warning shown while the form has unsaved edits. */
  onDirtyHint: () => void;
  /** Info shown while the form is clean. */
  onCleanHint: () => void;
  /** Clicks within this window of each other count as a pair. */
  windowMs?: number;
  /**
   * Longer window after a dirty click: the user just saw a warning, so give
   * them more time to decide and click again.
   */
  dirtyWindowMs?: number;
  /**
   * When true, the closing click also fires a hint. The tag editor only hints
   * on the click that does *not* close, because the dialog is already gone by
   * the time the user reads the second message.
   */
  notifyOnClosingClick?: boolean;
}

export function useUnsavedGuard(options: UnsavedGuardOptions) {
  const {
    isDirty,
    onClose,
    onDirtyHint,
    onCleanHint,
    windowMs = 2000,
    dirtyWindowMs = windowMs,
    notifyOnClosingClick = true
  } = options;

  let clicks = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function reset(): void {
    clicks = 0;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function onOverlayClick(): void {
    const dirty = isDirty();
    clicks++;

    if (clicks >= 2) {
      // The counter resets before closing so a reopen starts from a clean slate.
      reset();
      if (notifyOnClosingClick) (dirty ? onDirtyHint : onCleanHint)();
      onClose();
      return;
    }

    (dirty ? onDirtyHint : onCleanHint)();
    if (timer) clearTimeout(timer);
    timer = setTimeout(reset, dirty ? dirtyWindowMs : windowMs);
  }

  onBeforeUnmount(reset);

  return { onOverlayClick, reset };
}
