import { describe, it, expect } from 'vitest';
import { buildSponsorBlockArgs } from '../sponsorblock';

describe('buildSponsorBlockArgs', () => {
  it('returns nothing for off / undefined', () => {
    expect(buildSponsorBlockArgs('off')).toEqual([]);
    expect(buildSponsorBlockArgs(undefined)).toEqual([]);
  });

  it('marks sponsor segments as chapters', () => {
    expect(buildSponsorBlockArgs('mark')).toEqual(['--sponsorblock-mark', 'sponsor']);
  });

  it('removes sponsor segments', () => {
    expect(buildSponsorBlockArgs('remove')).toEqual(['--sponsorblock-remove', 'sponsor']);
  });
});
