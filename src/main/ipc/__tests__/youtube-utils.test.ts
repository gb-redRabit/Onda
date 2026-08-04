import { describe, it, expect } from 'vitest';
import { formatDuration, formatUploadDate, pickThumbnail } from '../youtube-utils';

describe('formatDuration', () => {
  it('returns undefined for missing/zero/negative duration', () => {
    expect(formatDuration(undefined)).toBeUndefined();
    expect(formatDuration(0)).toBeUndefined();
    expect(formatDuration(-5)).toBeUndefined();
  });

  it('formats under one hour as m:ss', () => {
    expect(formatDuration(5)).toBe('0:05');
    expect(formatDuration(59)).toBe('0:59');
    expect(formatDuration(60)).toBe('1:00');
    expect(formatDuration(3599)).toBe('59:59');
  });

  it('formats over one hour as h:mm:ss', () => {
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(3661)).toBe('1:01:01');
    expect(formatDuration(3723)).toBe('1:02:03');
  });
});

describe('formatUploadDate', () => {
  it('converts YYYYMMDD to YYYY-MM-DD', () => {
    expect(formatUploadDate('20240315')).toBe('2024-03-15');
    expect(formatUploadDate('20260101')).toBe('2026-01-01');
  });

  it('returns empty string for invalid input', () => {
    expect(formatUploadDate(undefined)).toBe('');
    expect(formatUploadDate('')).toBe('');
    expect(formatUploadDate('2024-03-15')).toBe('');
    expect(formatUploadDate('2024315')).toBe('');
  });
});

describe('pickThumbnail', () => {
  it('picks the largest width thumbnail', () => {
    const entry = {
      id: 'abc123',
      thumbnails: [
        { url: 'https://img/small', width: 100 },
        { url: 'https://img/large', width: 1280 },
        { url: 'https://img/medium', width: 480 }
      ]
    };
    expect(pickThumbnail(entry)).toBe('https://img/large');
  });

  it('falls back to i.ytimg.com when no thumbnails present', () => {
    expect(pickThumbnail({ id: 'abc123' })).toBe('https://i.ytimg.com/vi/abc123/hqdefault.jpg');
  });

  it('returns empty string when no id and no thumbnails', () => {
    expect(pickThumbnail({})).toBe('');
  });

  it('ignores thumbnails without url', () => {
    const entry = { id: 'abc', thumbnails: [{ width: 720 }, { url: '', width: 1280 }] };
    expect(pickThumbnail(entry)).toBe('https://i.ytimg.com/vi/abc/hqdefault.jpg');
  });
});
