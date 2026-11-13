import { describe, expect, it } from 'vitest';

import { computeEnterStart, computeOldExit } from '../imageTransitions';

const transitions = ['fade', 'zoom', 'swirl', 'slideUp', 'slideDown', 'zoomOut'] as const;

describe('computeEnterStart', () => {
  it('defines the fade start', () => {
    expect(computeEnterStart('fade', 'next')).toEqual({
      opacity: 0,
      transform: 'translateX(0) scale3d(1,1,1)',
      filter: 'blur(0px)'
    });
  });

  it.each(transitions)('defines a start style for %s', (transition) => {
    const style = computeEnterStart(transition, 'next');

    expect(style.opacity).toBeGreaterThanOrEqual(0);
    expect(style.transform).toContain('scale3d');
    expect(style.filter).toMatch(/^blur/);
  });

  it('slides from the matching side', () => {
    expect(computeEnterStart('slide', 'next').transform).toContain('15%');
    expect(computeEnterStart('slide', 'prev').transform).toContain('-15%');
  });

  it('falls back to an identity transform for unknown transitions', () => {
    expect(computeEnterStart('unknown', 'next')).toEqual({
      opacity: 1,
      transform: 'translateX(0) scale3d(1,1,1)',
      filter: 'blur(0px)'
    });
  });
});

describe('computeOldExit', () => {
  it('always fades out', () => {
    for (const transition of [...transitions, 'slide', 'unknown']) {
      expect(computeOldExit(transition, 'next').opacity).toBe(0);
    }
  });

  it('slides out to the matching side', () => {
    expect(computeOldExit('slide', 'next').transform).toContain('-15%');
    expect(computeOldExit('slide', 'prev').transform).toContain('15%');
  });

  it('defines zoom and swirl exits', () => {
    expect(computeOldExit('zoom', 'next').transform).toContain('1.2');
    expect(computeOldExit('swirl', 'prev').transform).toContain('rotate(15deg)');
    expect(computeOldExit('swirl', 'prev').filter).toBe('blur(6px)');
  });

  it('defines vertical exits', () => {
    expect(computeOldExit('slideUp', 'next').transform).toContain('translateY(-15%)');
    expect(computeOldExit('slideDown', 'next').transform).toContain('translateY(15%)');
  });

  it('falls back to a flat exit', () => {
    expect(computeOldExit('unknown', 'next')).toEqual({
      opacity: 0,
      transform: 'translateX(0) scale3d(1,1,1)',
      filter: 'blur(0px)'
    });
  });
});
