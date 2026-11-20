import { afterEach, describe, expect, it } from 'vitest';
import { isCoreShell, isStandaloneWindowRoute, setCoreShellMode } from '../runtimeMode';

describe('runtime mode', () => {
  afterEach(() => {
    setCoreShellMode(false);
    window.location.hash = '';
  });

  it('tracks the core shell flag', () => {
    expect(isCoreShell()).toBe(false);
    setCoreShellMode(true);
    expect(isCoreShell()).toBe(true);
  });

  it('recognizes standalone window hashes', () => {
    for (const hash of ['#/tools/converter', '#/explorer/window', '#/image-viewer']) {
      window.location.hash = hash;
      expect(isStandaloneWindowRoute()).toBe(true);
    }

    window.location.hash = '#/library';
    expect(isStandaloneWindowRoute()).toBe(false);
  });
});
