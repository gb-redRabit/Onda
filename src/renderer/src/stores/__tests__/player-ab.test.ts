import { describe, it, expect } from 'vitest';
import { usePlayerAb } from '../player-ab';

describe('player A-B repeat', () => {
  it('sets A and B, activating the loop once both are set', () => {
    const ab = usePlayerAb();
    ab.setA(10);
    expect(ab.abA.value).toBe(10);
    expect(ab.abActive.value).toBe(false);
    ab.setB(20);
    expect(ab.abB.value).toBe(20);
    expect(ab.abActive.value).toBe(true);
  });

  it('ignores B without A, or B not after A', () => {
    const ab = usePlayerAb();
    ab.setB(20);
    expect(ab.abB.value).toBeNull();
    ab.setA(30);
    ab.setB(10);
    expect(ab.abB.value).toBeNull();
  });

  it('clears B when A moves at or after B', () => {
    const ab = usePlayerAb();
    ab.setA(10);
    ab.setB(20);
    ab.setA(25);
    expect(ab.abA.value).toBe(25);
    expect(ab.abB.value).toBeNull();
    expect(ab.abActive.value).toBe(false);
  });

  it('toggle flips active only when both points are set', () => {
    const ab = usePlayerAb();
    ab.toggle();
    expect(ab.abActive.value).toBe(false);
    ab.setA(1);
    ab.setB(2);
    ab.toggle();
    expect(ab.abActive.value).toBe(false);
    ab.toggle();
    expect(ab.abActive.value).toBe(true);
  });

  it('loopTarget returns A once past B, else null', () => {
    const ab = usePlayerAb();
    ab.setA(10);
    ab.setB(20);
    expect(ab.loopTarget(15)).toBeNull();
    expect(ab.loopTarget(20)).toBe(10);
    expect(ab.loopTarget(25)).toBe(10);
  });

  it('loopTarget is null when the loop is off', () => {
    const ab = usePlayerAb();
    ab.setA(10);
    ab.setB(20);
    ab.toggle();
    expect(ab.loopTarget(25)).toBeNull();
  });

  it('clear resets everything', () => {
    const ab = usePlayerAb();
    ab.setA(1);
    ab.setB(2);
    ab.clear();
    expect(ab.abA.value).toBeNull();
    expect(ab.abB.value).toBeNull();
    expect(ab.abActive.value).toBe(false);
  });

  it('moveA/moveB clamp against the other point', () => {
    const ab = usePlayerAb();
    ab.setA(10);
    ab.setB(20);
    ab.moveA(25);
    expect(ab.abA.value).toBe(10);
    ab.moveB(5);
    expect(ab.abB.value).toBe(20);
    ab.moveA(12);
    expect(ab.abA.value).toBe(12);
    ab.moveB(18);
    expect(ab.abB.value).toBe(18);
  });
});
