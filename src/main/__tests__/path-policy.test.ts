import { describe, expect, it } from 'vitest';
import { isFilesystemRoot, isProtectedPath, parentOf, protectedPathReason } from '../path-policy';

describe('isFilesystemRoot', () => {
  it('recognises Windows drive roots and UNC share roots', () => {
    expect(isFilesystemRoot('C:\\', 'win32')).toBe(true);
    expect(isFilesystemRoot('C:', 'win32')).toBe(true);
    expect(isFilesystemRoot('d:\\', 'win32')).toBe(true);
    expect(isFilesystemRoot('\\\\server\\share', 'win32')).toBe(true);
    expect(isFilesystemRoot('\\\\server\\share\\', 'win32')).toBe(true);
  });

  it('recognises POSIX roots and leaves ordinary directories alone', () => {
    expect(isFilesystemRoot('/', 'linux')).toBe(true);
    expect(isFilesystemRoot('/home/user', 'linux')).toBe(false);
    expect(isFilesystemRoot('C:\\Users\\user', 'win32')).toBe(false);
  });
});

describe('protectedPathReason', () => {
  it('refuses a volume root and anything sitting directly in one', () => {
    // `C:\` and `C:\Users` take every user profile with them.
    expect(protectedPathReason('C:\\', 'win32')).toBe('root');
    expect(protectedPathReason('C:\\Users', 'win32')).toBe('system');
    expect(protectedPathReason('D:\\', 'win32')).toBe('root');
    expect(protectedPathReason('\\\\server\\share', 'win32')).toBe('root');
    expect(protectedPathReason('/', 'linux')).toBe('root');
    expect(protectedPathReason('/home', 'linux')).toBe('system');
  });

  it('refuses system directories and the shell homes', () => {
    expect(protectedPathReason('C:\\Windows', 'win32')).toBe('system');
    expect(protectedPathReason('C:\\Windows\\System32', 'win32')).toBe('system');
    expect(protectedPathReason('C:\\Program Files\\Onda', 'win32')).toBe('system');
    expect(protectedPathReason('C:\\$Recycle.Bin', 'win32')).toBe('system');
    expect(protectedPathReason('/etc', 'linux')).toBe('system');
    expect(protectedPathReason('/etc/ssh', 'linux')).toBe('system');
    expect(protectedPathReason('/usr', 'linux')).toBe('system');
    expect(protectedPathReason('/proc', 'linux')).toBe('system');
  });

  it('matches system directories case-insensitively on Windows', () => {
    expect(protectedPathReason('c:\\windows\\system32', 'win32')).toBe('system');
    expect(protectedPathReason('C:\\WINDOWS', 'win32')).toBe('system');
  });

  it('refuses a path that continues into a protected directory', () => {
    expect(protectedPathReason('C:\\Windows.old\\keep', 'win32')).toBeNull();
    expect(protectedPathReason('C:\\Windows\\System32\\drivers\\etc\\hosts', 'win32')).toBe(
      'system'
    );
    expect(protectedPathReason('/etc/ssh/sshd_config', 'linux')).toBe('system');
  });

  it('allows ordinary user content', () => {
    expect(protectedPathReason('C:\\Users\\u\\Music', 'win32')).toBeNull();
    expect(protectedPathReason('C:\\Users\\u\\Windows.old', 'win32')).toBeNull();
    expect(protectedPathReason('/home/u/music', 'linux')).toBeNull();
    expect(protectedPathReason('/home/u/etc/notes.txt', 'linux')).toBeNull();
    expect(protectedPathReason('/Volumes/Media/films.mkv', 'linux')).toBeNull();
    expect(protectedPathReason('C:\\Users\\u\\system', 'win32')).toBeNull();
    expect(protectedPathReason('C:\\Users\\u\\bin\\tool.exe', 'win32')).toBeNull();
  });

  it('evaluates the policy for the requested platform, not the host one', () => {
    // `C:\Windows` is not an absolute POSIX path, so on Linux it is rejected
    // outright rather than matched against the POSIX system list.
    expect(protectedPathReason('C:\\Windows', 'linux')).toBe('invalid');
    // On Windows a leading `/` is absolute (it resolves against the current
    // drive), so the Windows list applies and `/etc` is not special there.
    expect(protectedPathReason('/etc/passwd', 'win32')).toBeNull();
    expect(protectedPathReason('/etc/passwd', 'linux')).toBe('system');
  });

  it('rejects non-strings, empty values, traversal and NUL bytes', () => {
    expect(protectedPathReason(null)).toBe('invalid');
    expect(protectedPathReason(123)).toBe('invalid');
    expect(protectedPathReason('')).toBe('invalid');
    expect(protectedPathReason('relative/path')).toBe('invalid');
    expect(protectedPathReason('C:\\a\0b')).toBe('invalid');
  });

  it('exposes a boolean wrapper for the handlers', () => {
    expect(isProtectedPath('C:\\Windows', 'win32')).toBe(true);
    expect(isProtectedPath('C:\\Users\\u\\Music', 'win32')).toBe(false);
  });
});

describe('parentOf', () => {
  it('returns the containing directory for both separators', () => {
    expect(parentOf('C:\\Users\\u\\file.mp3')).toBe('C:\\Users\\u');
    expect(parentOf('/home/u/file.mp3')).toBe('/home/u');
  });

  it('returns null when there is no usable parent', () => {
    expect(parentOf('file.mp3')).toBeNull();
    expect(parentOf('/file.mp3')).toBeNull();
  });
});
