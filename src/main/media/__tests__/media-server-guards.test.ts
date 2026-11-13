import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  isAllowedRadioHost,
  isAllowedStreamHost,
  isWithinRoot,
  setAllowedRadioHostPredicate,
  sleep,
  timingSafeEqualString,
  validateStreamUrl
} from '../media-server-guards';

const PLATFORM = process.platform;

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value, configurable: true });
}

afterEach(() => {
  setPlatform(PLATFORM);
  setAllowedRadioHostPredicate(() => false);
  vi.useRealTimers();
});

describe('isWithinRoot', () => {
  it('compares Windows paths case-insensitively with separators', () => {
    setPlatform('win32');
    expect(isAllowedRadioHost('radio.example')).toBe(false);

    expect(isWithinRoot('C:\\Music', 'c:\\music')).toBe(true);
    expect(isWithinRoot('C:\\Music\\a.mp3', 'C:\\Music')).toBe(true);
    expect(isWithinRoot('C:/Music/a.mp3', 'C:/Music')).toBe(true);
    expect(isWithinRoot('C:/Music/a.mp3', 'C:\\Music')).toBe(false);
    expect(isWithinRoot('C:\\Music2\\a.mp3', 'C:\\Music')).toBe(false);
    expect(isWithinRoot('D:\\Music\\a.mp3', 'C:\\Music')).toBe(false);
  });

  it('compares POSIX paths with exact separators', () => {
    setPlatform('linux');

    expect(isWithinRoot('/music', '/music')).toBe(true);
    expect(isWithinRoot('/music/a.mp3', '/music')).toBe(true);
    expect(isWithinRoot('/music2/a.mp3', '/music')).toBe(false);
    expect(isWithinRoot('/other/a.mp3', '/music')).toBe(false);
  });
});

describe('timingSafeEqualString', () => {
  it('compares equal strings and rejects different ones', () => {
    expect(timingSafeEqualString('token', 'token')).toBe(true);
    expect(timingSafeEqualString('token', 'other')).toBe(false);
    expect(timingSafeEqualString('short', 'longer-value')).toBe(false);
  });
});

describe('radio host allowlist', () => {
  it('denies by default and follows the injected predicate', () => {
    expect(isAllowedRadioHost('radio.example')).toBe(false);

    setAllowedRadioHostPredicate((host) => host === 'radio.example');

    expect(isAllowedRadioHost('radio.example')).toBe(true);
    expect(isAllowedRadioHost('other.example')).toBe(false);
  });
});

describe('isAllowedStreamHost', () => {
  it('accepts media hosts and their subdomains', () => {
    expect(isAllowedStreamHost('youtube.com')).toBe(true);
    expect(isAllowedStreamHost('rr1.googlevideo.com')).toBe(true);
    expect(isAllowedStreamHost('I1.SNDCDN.COM')).toBe(true);
    expect(isAllowedStreamHost('evil.example')).toBe(false);
  });

  it('accepts user radio hosts', () => {
    setAllowedRadioHostPredicate((host) => host === 'radio.example');

    expect(isAllowedStreamHost('radio.example')).toBe(true);
  });
});

describe('validateStreamUrl', () => {
  it('accepts https media hosts', () => {
    expect(validateStreamUrl('https://rr1.googlevideo.com/videoplayback')?.hostname).toBe(
      'rr1.googlevideo.com'
    );
  });

  it('rejects invalid URLs and unsupported schemes', () => {
    expect(validateStreamUrl('not a url')).toBeNull();
    expect(validateStreamUrl('ftp://youtube.com/x')).toBeNull();
  });

  it('rejects http media hosts unless they are radio stations', () => {
    expect(validateStreamUrl('http://youtube.com/x')).toBeNull();

    setAllowedRadioHostPredicate((host) => host === 'radio.example');
    expect(validateStreamUrl('http://radio.example/stream')?.hostname).toBe('radio.example');
  });

  it('allows https radio hosts and rejects unknown hosts', () => {
    setAllowedRadioHostPredicate((host) => host === 'radio.example');

    expect(validateStreamUrl('https://radio.example/stream')).not.toBeNull();
    expect(validateStreamUrl('https://evil.example/stream')).toBeNull();
  });
});

describe('sleep', () => {
  it('resolves after the requested delay', async () => {
    vi.useFakeTimers();
    let done = false;

    const promise = sleep(400).then(() => {
      done = true;
    });
    vi.advanceTimersByTime(399);
    await Promise.resolve();
    expect(done).toBe(false);

    vi.advanceTimersByTime(1);
    await promise;
    expect(done).toBe(true);
  });
});
