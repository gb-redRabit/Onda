import { describe, it, expect } from 'vitest';
import { windowsRestrictAclArgs } from '../file-permissions';

describe('windowsRestrictAclArgs', () => {
  it('drops inheritance and grants the current user full control', () => {
    expect(windowsRestrictAclArgs('C:\\data\\cookies.txt', 'bejta')).toEqual([
      'C:\\data\\cookies.txt',
      '/inheritance:r',
      '/grant:r',
      'bejta:F'
    ]);
  });
});
