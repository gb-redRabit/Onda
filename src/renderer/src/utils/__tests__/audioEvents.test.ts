import { beforeEach, describe, expect, it, vi } from 'vitest';
import { audioEvents } from '../audioEvents';

// Small typed event bus between the audio engine and UI/composables.

beforeEach(() => {
  audioEvents.clear();
});

describe('audioEvents', () => {
  it('delivers payloads to subscribers of the same event', () => {
    const position = vi.fn();
    const state = vi.fn();
    audioEvents.on('timeUpdate', position);
    audioEvents.on('playStateChange', state);

    audioEvents.emit('timeUpdate', 42);

    expect(position).toHaveBeenCalledWith(42);
    expect(state).not.toHaveBeenCalled();
  });

  it('supports several listeners per event', () => {
    const first = vi.fn();
    const second = vi.fn();
    audioEvents.on('trackEnd', first);
    audioEvents.on('trackEnd', second);

    audioEvents.emit('trackEnd', undefined);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('returns an unsubscribe function', () => {
    const listener = vi.fn();
    const off = audioEvents.on('durationChange', listener);

    off();
    audioEvents.emit('durationChange', 100);

    expect(listener).not.toHaveBeenCalled();
  });

  it('can unregister with off and tolerates unknown listeners', () => {
    const listener = vi.fn();
    audioEvents.on('bufferChange', listener);

    audioEvents.off('bufferChange', listener);
    audioEvents.off('bufferChange', () => {});
    audioEvents.emit('bufferChange', 0.5);

    expect(listener).not.toHaveBeenCalled();
  });

  it('clear removes every listener', () => {
    const listener = vi.fn();
    audioEvents.on('trackLoaded', listener);

    audioEvents.clear();

    audioEvents.emit('trackLoaded', undefined);
    expect(listener).not.toHaveBeenCalled();
  });

  it('emitting an event with no listeners is safe', () => {
    expect(() => audioEvents.emit('streamError', 'boom')).not.toThrow();
  });
});
