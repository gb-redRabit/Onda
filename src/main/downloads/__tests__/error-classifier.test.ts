import { describe, it, expect } from 'vitest';
import { classifyYtDlpError, describeError, redactSecrets } from '../error-classifier';

describe('classifyYtDlpError', () => {
  it('classifies private videos', () => {
    expect(classifyYtDlpError('ERROR: This video is private')).toBe('private');
    expect(classifyYtDlpError('Video is private')).toBe('private');
  });

  it('classifies bot protection', () => {
    expect(classifyYtDlpError('ERROR: Sign in to confirm you are not a bot')).toBe('bot-block');
    expect(classifyYtDlpError('HTTP Error 429: Too Many Requests')).toBe('bot-block');
    expect(classifyYtDlpError('Please confirm you are not a bot')).toBe('bot-block');
  });

  it('classifies missing/removed videos', () => {
    expect(classifyYtDlpError('ERROR: Video unavailable')).toBe('not-found');
    expect(classifyYtDlpError('This video is not available')).toBe('not-found');
    expect(classifyYtDlpError('HTTP Error 404: Not Found')).toBe('not-found');
  });

  it('classifies auth-required content', () => {
    expect(classifyYtDlpError('Sign in to confirm your age')).toBe('auth-required');
    expect(classifyYtDlpError('This video is age-restricted')).toBe('auth-required');
    expect(classifyYtDlpError('This video is available to members only')).toBe('auth-required');
  });

  it('classifies missing dependencies', () => {
    expect(classifyYtDlpError('ffmpeg not found')).toBe('dependency');
    expect(classifyYtDlpError('ERROR: unable to run ffprobe')).toBe('dependency');
  });

  it('classifies proxy errors', () => {
    expect(classifyYtDlpError('ERROR: Unable to connect to proxy')).toBe('proxy');
    expect(classifyYtDlpError('Proxy error: connection refused')).toBe('proxy');
  });

  it('classifies network errors', () => {
    expect(classifyYtDlpError('ERROR: Unable to download webpage')).toBe('network');
    expect(classifyYtDlpError('getaddrinfo ENOTFOUND youtube.com')).toBe('network');
    expect(classifyYtDlpError('Connection reset by peer')).toBe('network');
  });

  it('falls back to unknown', () => {
    expect(classifyYtDlpError('some unexpected message')).toBe('unknown');
    expect(classifyYtDlpError('')).toBe('unknown');
  });
});

describe('describeError', () => {
  it('returns a message for every category', () => {
    for (const code of [
      'auth-required',
      'bot-block',
      'private',
      'not-found',
      'network',
      'proxy',
      'dependency',
      'unknown'
    ] as const) {
      expect(describeError(code)).toBeTruthy();
    }
  });
});

describe('redactSecrets', () => {
  it('strips cookie file paths', () => {
    expect(redactSecrets('--cookies /home/me/youtube-cookies.txt')).toBe('--cookies [REDACTED]');
    expect(redactSecrets('--cookies-from-browser chrome')).toBe('--cookies [REDACTED]');
  });

  it('redacts key/value secrets', () => {
    expect(redactSecrets('cookie=abc123')).toBe('cookie=[REDACTED]');
    expect(redactSecrets('password=hunter2')).toBe('password=[REDACTED]');
    expect(redactSecrets('token=sekret')).toBe('token=[REDACTED]');
  });

  it('leaves ordinary text untouched', () => {
    expect(redactSecrets('ERROR: Video unavailable')).toBe('ERROR: Video unavailable');
  });
});
