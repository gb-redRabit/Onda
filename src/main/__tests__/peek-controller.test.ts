import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PeekController, type PeekControllerDeps } from '../peek-controller';

function makeController(overrides: Partial<PeekControllerDeps> = {}): {
  controller: PeekController;
  applyPeeked: ReturnType<typeof vi.fn>;
  onChanged: ReturnType<typeof vi.fn>;
  deps: PeekControllerDeps;
} {
  const applyPeeked = vi.fn();
  const onChanged = vi.fn();
  const deps: PeekControllerDeps = {
    canPeek: () => true,
    isWindowVisible: () => true,
    applyPeeked,
    onChanged,
    ...overrides
  };
  return { controller: new PeekController(deps), applyPeeked, onChanged, deps };
}

describe('PeekController', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('peeks after the delay and notifies once', () => {
    const { controller, applyPeeked, onChanged } = makeController();

    controller.schedule();
    expect(controller.isScheduled()).toBe(true);
    expect(controller.peeked).toBe(false);

    vi.advanceTimersByTime(899);
    expect(controller.peeked).toBe(false);
    vi.advanceTimersByTime(1);

    expect(controller.peeked).toBe(true);
    expect(controller.isScheduled()).toBe(false);
    expect(applyPeeked).toHaveBeenCalledExactlyOnceWith(true);
    expect(onChanged).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('arms only one timer at a time', () => {
    const { controller, applyPeeked } = makeController();

    controller.schedule();
    controller.schedule();
    vi.advanceTimersByTime(900);

    expect(applyPeeked).toHaveBeenCalledTimes(1);
  });

  it('does not schedule when peeking is not allowed or already peeked', () => {
    const notAllowed = makeController({ canPeek: () => false });
    notAllowed.controller.schedule();
    expect(notAllowed.controller.isScheduled()).toBe(false);

    const already = makeController();
    already.controller.unpeek();
    already.controller.peek();
    expect(already.controller.peeked).toBe(true);
    already.controller.schedule();
    expect(already.controller.isScheduled()).toBe(false);
  });

  it('ignores peek while the mouse is inside', () => {
    const { controller, applyPeeked } = makeController();

    controller.setMouseInside(true);
    controller.peek();
    expect(controller.peeked).toBe(false);
    expect(applyPeeked).not.toHaveBeenCalled();

    controller.setMouseInside(false);
    controller.peek();
    expect(controller.peeked).toBe(true);
  });

  it('mouse-inside plus unpeek prevents the pending auto-peek', () => {
    const { controller, applyPeeked } = makeController();

    controller.schedule();
    controller.setMouseInside(true);
    controller.unpeek();
    vi.advanceTimersByTime(2000);

    expect(controller.peeked).toBe(false);
    expect(applyPeeked).not.toHaveBeenCalled();
  });

  it('unpeek reports the transition back to hidden', () => {
    const { controller, applyPeeked } = makeController();

    controller.peek();
    controller.unpeek();

    expect(controller.peeked).toBe(false);
    expect(applyPeeked.mock.calls).toEqual([[true], [false]]);
  });

  it('does not touch a hidden or dead window', () => {
    const { controller, applyPeeked } = makeController({ isWindowVisible: () => false });

    controller.peek();
    controller.schedule();
    vi.advanceTimersByTime(1000);

    expect(controller.peeked).toBe(false);
    expect(applyPeeked).not.toHaveBeenCalled();
  });

  it('reset clears the state without applying bounds', () => {
    const { controller, applyPeeked } = makeController();

    controller.peek();
    expect(controller.peeked).toBe(true);
    applyPeeked.mockClear();

    controller.schedule();
    controller.reset();

    expect(controller.peeked).toBe(false);
    expect(controller.isScheduled()).toBe(false);
    expect(applyPeeked).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(applyPeeked).not.toHaveBeenCalled();
  });

  it('applies state changes only once per transition', () => {
    const { controller, applyPeeked } = makeController();

    controller.peek();
    controller.peek();
    controller.unpeek();
    controller.unpeek();

    expect(applyPeeked.mock.calls).toEqual([[true], [false]]);
  });
});
