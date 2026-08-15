import { describe, it, expect } from 'vitest';
import { resolveFinalOutputPath, findNewestOutput } from '../output-path';

describe('resolveFinalOutputPath', () => {
  const exists = new Set([
    'C:/Music/Move Your Body - Öwnboss ｜ Animated Video (NA).mp3'
  ]);

  it('returns the last destination that exists on disk', () => {
    const destinations = [
      'C:/Music/Move Your Body - Öwnboss ｜ Animated Video (NA).webm',
      'C:/Music/Move Your Body - Öwnboss ｜ Animated Video (NA).mp3'
    ];
    expect(resolveFinalOutputPath(destinations, (p) => exists.has(p))).toBe(
      'C:/Music/Move Your Body - Öwnboss ｜ Animated Video (NA).mp3'
    );
  });

  it('skips mangled destinations that do not exist on disk', () => {
    const destinations = [
      'C:/Music/Move Your Body - �wnboss  Animated Video (NA).webm',
      'C:/Music/Move Your Body - Öwnboss ｜ Animated Video (NA).mp3'
    ];
    expect(resolveFinalOutputPath(destinations, (p) => exists.has(p))).toBe(
      'C:/Music/Move Your Body - Öwnboss ｜ Animated Video (NA).mp3'
    );
  });

  it('returns undefined when no destination exists', () => {
    expect(
      resolveFinalOutputPath(['C:/Music/gone.webm', 'C:/Music/gone.mp3'], () => false)
    ).toBeUndefined();
  });

  it('ignores empty destination strings', () => {
    expect(resolveFinalOutputPath(['', 'C:/Music/real.mp3'], (p) => p === 'C:/Music/real.mp3')).toBe(
      'C:/Music/real.mp3'
    );
  });
});

describe('findNewestOutput', () => {
  const entries = [
    { name: 'Old track.mp3', mtimeMs: 100 },
    { name: 'New track.mp3', mtimeMs: 500 },
    { name: 'thumb.jpg', mtimeMs: 600 },
    { name: 'subs.srt', mtimeMs: 700 },
    { name: 'New track.mp3.part', mtimeMs: 800 },
    { name: 'video.webm', mtimeMs: 900 }
  ];

  it('picks the newest file with a matching extension', () => {
    expect(findNewestOutput(entries, ['.mp3'], 0)).toBe('New track.mp3');
  });

  it('excludes .part files and non-matching extensions', () => {
    expect(findNewestOutput(entries, ['.mp3'], 0)).not.toBe('New track.mp3.part');
    expect(findNewestOutput(entries, ['.jpg'], 0)).toBe('thumb.jpg');
    expect(findNewestOutput(entries, ['.mkv'], 0)).toBeUndefined();
  });

  it('respects the newerThan threshold', () => {
    expect(findNewestOutput(entries, ['.mp3'], 600)).toBeUndefined();
    expect(findNewestOutput(entries, ['.webm'], 800)).toBe('video.webm');
  });

  it('matches extensions case-insensitively', () => {
    expect(findNewestOutput([{ name: 'Track.MP3', mtimeMs: 10 }], ['.mp3'], 0)).toBe('Track.MP3');
  });
});