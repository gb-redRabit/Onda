import { describe, it, expect } from 'vitest';
import { iconSourcePath, type IconSourceDeps } from '../file-icon';

function deps(overrides: Partial<IconSourceDeps> = {}): IconSourceDeps {
  return {
    platform: 'win32',
    readShortcutLink: () => ({ icon: '', target: '' }),
    exists: () => false,
    ...overrides
  };
}

describe('iconSourcePath', () => {
  it('returns non-shortcut paths unchanged', () => {
    expect(iconSourcePath('C:\\music\\track.mp3', deps())).toBe('C:\\music\\track.mp3');
  });

  it('on non-Windows returns the path unchanged', () => {
    expect(iconSourcePath('/home/u/x.lnk', deps({ platform: 'linux' }))).toBe('/home/u/x.lnk');
  });

  it('prefers the shortcut icon path (quote/index stripped) when it exists', () => {
    const d = deps({
      readShortcutLink: () => ({
        icon: '"C:\\apps\\Blender\\blender.exe",0',
        target: 'C:\\apps\\Blender\\other.exe'
      }),
      exists: (p) => p === 'C:\\apps\\Blender\\blender.exe'
    });
    expect(iconSourcePath('C:\\Users\\u\\Desktop\\Blender.lnk', d)).toBe(
      'C:\\apps\\Blender\\blender.exe'
    );
  });

  it('falls back to the shortcut target', () => {
    const d = deps({
      readShortcutLink: () => ({
        icon: 'C:\\missing\\icon.ico',
        target: 'C:\\apps\\Discord\\Discord.exe'
      }),
      exists: (p) => p === 'C:\\apps\\Discord\\Discord.exe'
    });
    expect(iconSourcePath('C:\\Users\\u\\Desktop\\Discord.lnk', d)).toBe(
      'C:\\apps\\Discord\\Discord.exe'
    );
  });

  it('keeps the shortcut path when nothing resolves or the link is broken', () => {
    const empty = deps({ readShortcutLink: () => ({ icon: '', target: 'C:\\gone.exe' }) });
    expect(iconSourcePath('C:\\Users\\u\\Desktop\\Gone.lnk', empty)).toBe(
      'C:\\Users\\u\\Desktop\\Gone.lnk'
    );

    const broken = deps({
      readShortcutLink: () => {
        throw new Error('invalid shortcut');
      }
    });
    expect(iconSourcePath('C:\\Users\\u\\Desktop\\Bad.lnk', broken)).toBe(
      'C:\\Users\\u\\Desktop\\Bad.lnk'
    );
  });
});
