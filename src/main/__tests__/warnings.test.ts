import { describe, it, expect, beforeEach } from 'vitest';
import { recordWarning, getRecentWarnings, clearWarnings } from '../warnings';

describe('warning ring buffer', () => {
  beforeEach(() => clearWarnings());

  it('caps at 20 entries, dropping the oldest', () => {
    for (let i = 0; i < 25; i++) recordWarning(`w${i}`, 1000 + i * 1000);
    const entries = getRecentWarnings();
    expect(entries).toHaveLength(20);
    expect(entries[0].text).toBe('w5');
    expect(entries[19].text).toBe('w24');
  });

  it('collapses identical warnings inside the rate window into one counted entry', () => {
    recordWarning('same', 1000);
    recordWarning('same', 2000);
    recordWarning('same', 3000);
    const entries = getRecentWarnings();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ text: 'same', count: 3, at: 3000 });
  });

  it('keeps identical messages that arrive outside the rate window separate', () => {
    recordWarning('same', 1000);
    recordWarning('same', 12_000);
    expect(getRecentWarnings()).toHaveLength(2);
  });

  it('never merges different messages', () => {
    recordWarning('a', 1000);
    recordWarning('b', 1000);
    expect(getRecentWarnings()).toHaveLength(2);
  });
});
