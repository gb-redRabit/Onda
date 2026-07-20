import { describe, it, expect } from 'vitest'
import {
  formatDuration,
  formatFileSize,
  formatNumber,
  formatRelativeTime,
  generateId,
  getFileExtension,
  getFileNameWithoutExtension,
  truncate
} from '../formatters'

describe('formatDuration', () => {
  it('returns 0:00 for null/NaN/undefined', () => {
    expect(formatDuration(0 as any)).toBe('0:00')
    expect(formatDuration(NaN)).toBe('0:00')
    expect(formatDuration(null as any)).toBe('0:00')
    expect(formatDuration(undefined as any)).toBe('0:00')
  })

  it('formats seconds only', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(5)).toBe('0:05')
    expect(formatDuration(59)).toBe('0:59')
  })

  it('formats minutes and seconds', () => {
    expect(formatDuration(60)).toBe('1:00')
    expect(formatDuration(61)).toBe('1:01')
    expect(formatDuration(3599)).toBe('59:59')
  })

  it('formats hours, minutes and seconds', () => {
    expect(formatDuration(3600)).toBe('1:00:00')
    expect(formatDuration(3661)).toBe('1:01:01')
    expect(formatDuration(86399)).toBe('23:59:59')
  })
})

describe('formatFileSize', () => {
  it('returns 0 B for zero', () => {
    expect(formatFileSize(0)).toBe('0 B')
  })

  it('formats bytes', () => {
    expect(formatFileSize(100)).toBe('100 B')
  })

  it('formats KB', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB')
    expect(formatFileSize(1536)).toBe('1.5 KB')
  })

  it('formats MB', () => {
    expect(formatFileSize(1048576)).toBe('1.0 MB')
    expect(formatFileSize(1572864)).toBe('1.5 MB')
  })

  it('formats GB', () => {
    expect(formatFileSize(1073741824)).toBe('1.0 GB')
  })
})

describe('formatNumber', () => {
  it('formats numbers below 1000', () => {
    expect(formatNumber(0)).toBe('0')
    expect(formatNumber(999)).toBe('999')
  })

  it('formats thousands', () => {
    expect(formatNumber(1000)).toBe('1.0K')
    expect(formatNumber(1500)).toBe('1.5K')
  })

  it('formats millions', () => {
    expect(formatNumber(1000000)).toBe('1.0M')
    expect(formatNumber(2500000)).toBe('2.5M')
  })

  it('formats billions', () => {
    expect(formatNumber(1000000000)).toBe('1.0B')
  })

  it('handles string input', () => {
    expect(formatNumber('1500')).toBe('1.5K')
    expect(formatNumber('abc')).toBe('0')
  })
})

describe('formatRelativeTime', () => {
  it('returns Just now for recent timestamps', () => {
    expect(formatRelativeTime(Date.now())).toBe('Just now')
    expect(formatRelativeTime(Date.now() - 30000)).toBe('Just now')
  })

  it('returns minutes ago', () => {
    expect(formatRelativeTime(Date.now() - 120000)).toBe('2m ago')
  })

  it('returns hours ago', () => {
    expect(formatRelativeTime(Date.now() - 7200000)).toBe('2h ago')
  })

  it('returns days ago', () => {
    expect(formatRelativeTime(Date.now() - 172800000)).toBe('2d ago')
  })
})

describe('generateId', () => {
  it('returns a string with timestamp prefix', () => {
    const id = generateId()
    expect(id).toContain('-')
    expect(id.length).toBeGreaterThan(10)
  })

  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()))
    expect(ids.size).toBe(100)
  })
})

describe('getFileExtension', () => {
  it('returns extension from filename', () => {
    expect(getFileExtension('song.mp3')).toBe('.mp3')
    expect(getFileExtension('video.mp4')).toBe('.mp4')
  })

  it('returns empty string for files without extension', () => {
    expect(getFileExtension('Makefile')).toBe('')
  })

  it('handles multiple dots', () => {
    expect(getFileExtension('archive.tar.gz')).toBe('.gz')
  })
})

describe('getFileNameWithoutExtension', () => {
  it('strips extension', () => {
    expect(getFileNameWithoutExtension('song.mp3')).toBe('song')
  })

  it('returns full name for files without extension', () => {
    expect(getFileNameWithoutExtension('Makefile')).toBe('Makefile')
  })
})

describe('truncate', () => {
  it('returns string as-is when shorter than max', () => {
    expect(truncate('hello', 10)).toBe('hello')
  })

  it('truncates and adds ellipsis', () => {
    expect(truncate('hello world', 5)).toBe('hello...')
  })
})
