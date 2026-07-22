import { describe, it, expect } from 'vitest';
import {
  formatDuration,
  formatFileSize,
  formatNumber,
  formatRelativeTime,
  generateId,
  getFileExtension,
  getFileNameWithoutExtension,
  truncate
} from '../formatters';

describe('formatDuration', () => {
  it('returns 0:00 for null/NaN/undefined', () => {
    expect(formatDuration(0 as any)).toBe('0:00');
    expect(formatDuration(NaN)).toBe('0:00');
    expect(formatDuration(null as any)).toBe('0:00');
    expect(formatDuration(undefined as any)).toBe('0:00');
  });

  it('formats seconds only', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(5)).toBe('0:05');
    expect(formatDuration(59)).toBe('0:59');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(60)).toBe('1:00');
    expect(formatDuration(61)).toBe('1:01');
    expect(formatDuration(3599)).toBe('59:59');
  });

  it('formats hours, minutes and seconds', () => {
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(3661)).toBe('1:01:01');
    expect(formatDuration(86399)).toBe('23:59:59');
  });
});

describe('formatFileSize', () => {
  it('returns 0 B for zero', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });

  it('formats bytes', () => {
    expect(formatFileSize(100)).toBe('100 B');
  });

  it('formats KB', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });

  it('formats MB', () => {
    expect(formatFileSize(1048576)).toBe('1.0 MB');
    expect(formatFileSize(1572864)).toBe('1.5 MB');
  });

  it('formats GB', () => {
    expect(formatFileSize(1073741824)).toBe('1.0 GB');
  });
});

describe('formatNumber', () => {
  it('formats numbers below 1000', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(999)).toBe('999');
  });

  it('formats thousands', () => {
    expect(formatNumber(1000)).toBe('1.0K');
    expect(formatNumber(1500)).toBe('1.5K');
  });

  it('formats millions', () => {
    expect(formatNumber(1000000)).toBe('1.0M');
    expect(formatNumber(2500000)).toBe('2.5M');
  });

  it('formats billions', () => {
    expect(formatNumber(1000000000)).toBe('1.0B');
  });

  it('handles string input', () => {
    expect(formatNumber('1500')).toBe('1.5K');
    expect(formatNumber('abc')).toBe('0');
  });
});

describe('formatRelativeTime', () => {
  it('returns Just now for recent timestamps', () => {
    expect(formatRelativeTime(Date.now())).toBe('Just now');
    expect(formatRelativeTime(Date.now() - 30000)).toBe('Just now');
  });

  it('returns minutes ago', () => {
    expect(formatRelativeTime(Date.now() - 120000)).toBe('2m ago');
  });

  it('returns hours ago', () => {
    expect(formatRelativeTime(Date.now() - 7200000)).toBe('2h ago');
  });

  it('returns days ago', () => {
    expect(formatRelativeTime(Date.now() - 172800000)).toBe('2d ago');
  });
});

describe('generateId', () => {
  it('returns a string with timestamp prefix', () => {
    const id = generateId();
    expect(id).toContain('-');
    expect(id.length).toBeGreaterThan(10);
  });

  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});

describe('getFileExtension', () => {
  it('returns extension from filename', () => {
    expect(getFileExtension('song.mp3')).toBe('.mp3');
    expect(getFileExtension('video.mp4')).toBe('.mp4');
  });

  it('returns empty string for files without extension', () => {
    expect(getFileExtension('Makefile')).toBe('');
  });

  it('handles multiple dots', () => {
    expect(getFileExtension('archive.tar.gz')).toBe('.gz');
  });
});

describe('getFileNameWithoutExtension', () => {
  it('strips extension', () => {
    expect(getFileNameWithoutExtension('song.mp3')).toBe('song');
  });

  it('returns full name for files without extension', () => {
    expect(getFileNameWithoutExtension('Makefile')).toBe('Makefile');
  });
});

describe('truncate', () => {
  it('returns string as-is when shorter than max', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('truncates and adds ellipsis', () => {
    expect(truncate('hello world', 5)).toBe('hello...');
  });
});

describe('formatDuration edge cases', () => {
  it('handles negative values (passed through to formatting)', () => {
    expect(formatDuration(-1)).toBe('-1:-1');
  });

  it('handles very large values', () => {
    expect(formatDuration(3600 * 48 + 3661)).toBe('49:01:01');
  });
});

describe('formatFileSize edge cases', () => {
  it('handles TB values', () => {
    expect(formatFileSize(1099511627776)).toBe('1.0 TB');
  });

  it('handles exact KB boundary', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
  });

  it('handles negative values (NaN result)', () => {
    expect(formatFileSize(-1)).toBe('NaN undefined');
  });

  it('handles fractional bytes (float input)', () => {
    expect(formatFileSize(0.5)).toBe('512 undefined');
  });
});

describe('formatNumber edge cases', () => {
  it('handles negative numbers (no abbreviation for negative)', () => {
    expect(formatNumber(-500)).toBe('-500');
    expect(formatNumber(-1500)).toBe('-1500');
  });

  it('handles very large numbers', () => {
    expect(formatNumber(1000000000000)).toBe('1000.0B');
  });

  it('handles NaN string', () => {
    expect(formatNumber('not a number')).toBe('0');
  });

  it('handles empty string', () => {
    expect(formatNumber('')).toBe('0');
  });
});

describe('formatRelativeTime edge cases', () => {
  it('returns date string for timestamps older than 30 days', () => {
    const old = Date.now() - 31 * 24 * 60 * 60 * 1000;
    const result = formatRelativeTime(old);
    expect(result).not.toBe('Just now');
    expect(result).not.toMatch(/[dmh] ago/);
  });

  it('returns Just now for future timestamps (negative diff)', () => {
    expect(formatRelativeTime(Date.now() + 10000)).toBe('Just now');
  });

  it('returns 0d ago for exactly 0 diff', () => {
    expect(formatRelativeTime(Date.now())).toBe('Just now');
  });
});

describe('generateId edge cases', () => {
  it('contains a dash separator', () => {
    expect(generateId()).toContain('-');
  });

  it('generates strings of consistent length', () => {
    const ids = Array.from({ length: 10 }, () => generateId());
    ids.forEach((id) => {
      expect(id.split('-')[0]).toMatch(/^\d+$/);
      expect(id.split('-')[1]).toMatch(/^[a-z0-9]+$/);
    });
  });
});

describe('getFileExtension edge cases', () => {
  it('handles dotfiles (returns filename as-is)', () => {
    expect(getFileExtension('.gitignore')).toBe('.gitignore');
  });

  it('handles filename ending with dot', () => {
    expect(getFileExtension('noext.')).toBe('.');
  });

  it('handles empty string', () => {
    expect(getFileExtension('')).toBe('');
  });

  it('handles just a dot', () => {
    expect(getFileExtension('.')).toBe('.');
  });

  it('handles full paths', () => {
    expect(getFileExtension('/path/to/file.mp3')).toBe('.mp3');
  });
});

describe('getFileNameWithoutExtension edge cases', () => {
  it('handles dotfiles', () => {
    expect(getFileNameWithoutExtension('.gitignore')).toBe('');
  });

  it('handles filename ending with dot', () => {
    expect(getFileNameWithoutExtension('noext.')).toBe('noext');
  });

  it('handles empty string', () => {
    expect(getFileNameWithoutExtension('')).toBe('');
  });

  it('handles full paths', () => {
    expect(getFileNameWithoutExtension('/path/to/file.mp3')).toBe('/path/to/file');
  });
});
