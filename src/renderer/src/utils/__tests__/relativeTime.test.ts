import { describe, expect, it } from 'vitest';
import { relativeTime } from '../relativeTime';

const NOW = new Date('2026-10-30T12:00:00Z').getTime();
const ago = (seconds: number) => NOW - seconds * 1000;

describe('relativeTime', () => {
  it('describes recent moments in seconds and minutes', () => {
    expect(relativeTime(ago(5), 'en', NOW)).toBe('5 sec. ago');
    expect(relativeTime(ago(120), 'en', NOW)).toBe('2 min. ago');
  });

  it('uses hours and days for older timestamps', () => {
    expect(relativeTime(ago(3 * 3600), 'en', NOW)).toBe('3 hr. ago');
    expect(relativeTime(ago(3 * 86400), 'en', NOW)).toBe('3 days ago');
  });

  it('falls back to a date after a week', () => {
    const label = relativeTime(ago(30 * 86400), 'en', NOW);
    expect(label).not.toMatch(/ago/i);
    expect(new Date(ago(30 * 86400)).toLocaleDateString('en')).toBe(label);
  });

  it('uses the given locale for inflection', () => {
    expect(relativeTime(ago(2 * 86400), 'pl', NOW)).toBe('przedwczoraj');
    expect(relativeTime(ago(3 * 86400), 'pl', NOW)).toMatch(/3 dni/);
  });
});
