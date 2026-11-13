import { beforeEach, describe, expect, it, vi } from 'vitest';
import { depEvents } from '../depEvents';

// Renderer bus used to push dependency status changes to the banner.

beforeEach(() => {
  depEvents.clear();
});

describe('depEvents', () => {
  it('notifies subscribers and returns an unsubscribe function', () => {
    const listener = vi.fn();
    const off = depEvents.on('changed', listener);

    depEvents.emit('changed');
    off();
    depEvents.emit('changed');

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('supports several listeners and explicit off', () => {
    const first = vi.fn();
    const second = vi.fn();
    depEvents.on('changed', first);
    depEvents.on('changed', second);

    depEvents.emit('changed');
    depEvents.off('changed', first);
    depEvents.emit('changed');

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it('clear drops every listener', () => {
    const listener = vi.fn();
    depEvents.on('changed', listener);

    depEvents.clear();
    depEvents.emit('changed');

    expect(listener).not.toHaveBeenCalled();
  });

  it('emitting without listeners is safe', () => {
    expect(() => depEvents.emit('changed')).not.toThrow();
  });
});
