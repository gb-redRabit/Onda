import { describe, it, expect } from 'vitest';
import {
  nudgeElement,
  KEYBOARD_NUDGE_MAX,
  KEYBOARD_NUDGE_FAST,
  KEYBOARD_NUDGE_STEP
} from '../audioLayoutNudge';

describe('nudgeElement', () => {
  it('moves by one percent per arrow key', () => {
    expect(nudgeElement({ x: 10, y: 10 }, 'ArrowRight', false)).toEqual({ x: 11, y: 10 });
    expect(nudgeElement({ x: 10, y: 10 }, 'ArrowLeft', false)).toEqual({ x: 9, y: 10 });
    expect(nudgeElement({ x: 10, y: 10 }, 'ArrowUp', false)).toEqual({ x: 10, y: 9 });
    expect(nudgeElement({ x: 10, y: 10 }, 'ArrowDown', false)).toEqual({ x: 10, y: 11 });
  });

  it('uses a larger step with Shift', () => {
    expect(KEYBOARD_NUDGE_FAST).toBe(5);
    expect(nudgeElement({ x: 10, y: 10 }, 'ArrowRight', true)).toEqual({ x: 15, y: 10 });
  });

  it('clamps to the same bounds as the mouse drag (0..95)', () => {
    expect(KEYBOARD_NUDGE_MAX).toBe(95);
    expect(nudgeElement({ x: 0, y: 0 }, 'ArrowLeft', false)).toEqual({ x: 0, y: 0 });
    expect(
      nudgeElement({ x: KEYBOARD_NUDGE_MAX, y: KEYBOARD_NUDGE_MAX }, 'ArrowDown', true)
    ).toEqual({ x: KEYBOARD_NUDGE_MAX, y: KEYBOARD_NUDGE_MAX });
  });

  it('ignores non-arrow keys', () => {
    expect(nudgeElement({ x: 5, y: 5 }, 'Enter', false)).toBeNull();
    expect(nudgeElement({ x: 5, y: 5 }, 'a', false)).toBeNull();
  });

  it('documents the base step', () => {
    expect(KEYBOARD_NUDGE_STEP).toBe(1);
  });
});
