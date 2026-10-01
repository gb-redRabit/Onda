import { describe, it, expect } from 'vitest';
import { createRateLimiter } from '../rate-limit';

function limiter(maxCalls = 3, windowMs = 1000) {
  let clock = 0;
  const limiter = createRateLimiter({ maxCalls, windowMs, now: () => clock });
  return { limiter, advance: (ms: number) => (clock += ms) };
}

describe('createRateLimiter', () => {
  it('allows up to maxCalls inside the window', () => {
    const { limiter: rl } = limiter();
    expect(rl.tryAcquire('a')).toBe(true);
    expect(rl.tryAcquire('a')).toBe(true);
    expect(rl.tryAcquire('a')).toBe(true);
  });

  it('blocks the call over the cap', () => {
    const { limiter: rl } = limiter();
    rl.tryAcquire('a');
    rl.tryAcquire('a');
    rl.tryAcquire('a');
    expect(rl.tryAcquire('a')).toBe(false);
  });

  it('frees the slot once the window slides', () => {
    const { limiter: rl, advance } = limiter();
    for (let i = 0; i < 3; i++) rl.tryAcquire('a');
    expect(rl.tryAcquire('a')).toBe(false);
    advance(1001);
    expect(rl.tryAcquire('a')).toBe(true);
  });

  it('keeps counters independent per key', () => {
    const { limiter: rl } = limiter();
    for (let i = 0; i < 3; i++) rl.tryAcquire('a');
    expect(rl.tryAcquire('a')).toBe(false);
    expect(rl.tryAcquire('b')).toBe(true);
  });

  it('reset clears one key or all keys', () => {
    const { limiter: rl } = limiter();
    for (let i = 0; i < 3; i++) rl.tryAcquire('a');
    rl.reset('a');
    expect(rl.tryAcquire('a')).toBe(true);

    for (let i = 0; i < 3; i++) rl.tryAcquire('b');
    rl.reset();
    expect(rl.tryAcquire('b')).toBe(true);
  });
});
