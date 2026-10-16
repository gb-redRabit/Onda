import { describe, expect, it } from 'vitest';
import { shuffled } from '../shuffle';

describe('shuffled', () => {
  it('does not mutate the input array', () => {
    const input = [1, 2, 3, 4, 5];
    const copy = [...input];
    shuffled(input);
    expect(input).toEqual(copy);
  });

  it('returns a permutation with the same elements (deterministic rng)', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    // Stały rng: i=7 ->0, i=6 ->0, ... deterministyczne, ale wciąż permutacja.
    const rng = () => 0;
    const out = shuffled(input, rng);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
    expect(out).not.toEqual(input);
  });

  it('handles empty and single-element arrays', () => {
    expect(shuffled([])).toEqual([]);
    expect(shuffled([1])).toEqual([1]);
  });
});
