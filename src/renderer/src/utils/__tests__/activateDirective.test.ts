import { describe, expect, it, vi } from 'vitest';
import { vActivate } from '../activateDirective';

// `v-activate` nadaje rolę/klawiaturowość elementom, które nie mogą być `<button>`.
// Regresja: Spacja aktywowała na `keydown` (przytrzymanie klikało wielokrotnie) —
// teraz Enter na `keydown`, Spacja na `keyup`, jak natywny przycisk.

type DirectiveLike = {
  mounted: (el: HTMLElement) => void;
  beforeUnmount: (el: HTMLElement) => void;
};

function setup(): { el: HTMLDivElement; click: ReturnType<typeof vi.fn> } {
  const el = document.createElement('div');
  const click = vi.fn();
  el.addEventListener('click', click);
  (vActivate as unknown as DirectiveLike).mounted(el);
  document.body.appendChild(el);
  return { el, click };
}

function key(el: HTMLElement, type: 'keydown' | 'keyup', k: string): void {
  el.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true, cancelable: true }));
}

describe('v-activate', () => {
  it('adds role and tabindex', () => {
    const { el } = setup();
    expect(el.getAttribute('role')).toBe('button');
    expect(el.getAttribute('tabindex')).toBe('0');
  });

  it('activates on Enter keydown', () => {
    const { el, click } = setup();
    key(el, 'keydown', 'Enter');
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('activates Space on keyup, not keydown', () => {
    const { el, click } = setup();
    key(el, 'keydown', ' ');
    expect(click).not.toHaveBeenCalled();
    key(el, 'keyup', ' ');
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('ignores events bubbling from a nested control', () => {
    const { el, click } = setup();
    const child = document.createElement('button');
    el.appendChild(child);
    child.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(click).not.toHaveBeenCalled();
    expect(el.getAttribute('role')).toBe('button');
  });

  it('stops responding after beforeUnmount', () => {
    const { el, click } = setup();
    (vActivate as unknown as DirectiveLike).beforeUnmount(el);
    key(el, 'keydown', 'Enter');
    key(el, 'keyup', ' ');
    expect(click).not.toHaveBeenCalled();
  });
});
