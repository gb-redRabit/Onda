import { describe, expect, it } from 'vitest';
import {
  FRAME_STRIP_MAX,
  MAX_THUMBNAILS,
  MIN_THUMBNAILS,
  buildTimelineTicks,
  computeFrameStripWindow,
  desiredThumbnailCount,
  extensionOf,
  fileNameOf,
  formatClipTime,
  formatRulerTime,
  formatTimecode,
  frameStripCovers,
  percentageOf,
  snapTimeToTargets,
  timeAtPercent,
  timeAtPx,
  trackPctOf
} from '../videoClipper';

describe('videoClipper — formatowanie', () => {
  it('formats clip time and timecode', () => {
    expect(formatClipTime(0)).toBe('00:00');
    expect(formatClipTime(65)).toBe('01:05');
    expect(formatClipTime(3725)).toBe('1:02:05');
    expect(formatClipTime(Number.NaN)).toBe('00:00');
    expect(formatTimecode(0, 30)).toBe('00:00:00:00');
    expect(formatTimecode(61.5, 30)).toBe('00:01:01:15');
  });

  it('formats ruler labels for fractional steps', () => {
    expect(formatRulerTime(1.23, 0.05)).toBe('00:01.23');
    expect(formatRulerTime(1.2, 0.5)).toBe('00:01.2');
    expect(formatRulerTime(75, 5)).toBe('01:15');
  });

  it('extracts names and extensions from both separators', () => {
    expect(fileNameOf('C:\\media\\clip.mp4')).toBe('clip.mp4');
    expect(fileNameOf('/media/clip.mp4')).toBe('clip.mp4');
    expect(extensionOf('C:\\media\\clip.MP4')).toBe('mp4');
    expect(extensionOf('no-extension')).toBe('');
  });
});

describe('videoClipper — geometria', () => {
  it('maps seconds and pixels to percentages', () => {
    expect(percentageOf(30, 120)).toBe(25);
    expect(percentageOf(-1, 120)).toBe(0);
    expect(percentageOf(500, 120)).toBe(100);
    expect(percentageOf(1, 0)).toBe(0);
    expect(trackPctOf(50)).toBeCloseTo(8 + 42);
  });

  it('maps the padded track back to time', () => {
    expect(timeAtPercent(8, 100)).toBe(0);
    expect(timeAtPercent(92, 100)).toBeCloseTo(100);
    expect(timeAtPercent(50, 100)).toBeCloseTo(50);
    expect(timeAtPx(0, 0, 100)).toBe(0);
  });

  it('snaps to frame boundaries and nearby targets', () => {
    const base = {
      duration: 10,
      fps: 30,
      enabled: true,
      pixelsPerSecond: 100,
      targets: { start: 1, end: 5, playhead: 2 }
    };
    expect(snapTimeToTargets(1.02, base)).toBe(1);
    expect(snapTimeToTargets(2.02, base)).toBe(2);
    expect(snapTimeToTargets(1.02, { ...base, exclude: 'start' })).toBeCloseTo(1.0333, 3);
    expect(snapTimeToTargets(1.02, { ...base, enabled: false })).toBeCloseTo(1.0333, 3);
  });

  it('builds major, minor and frame ticks within the duration', () => {
    const ticks = buildTimelineTicks({
      duration: 60,
      widthPx: 1000,
      pixelsPerSecond: 100 / 60,
      zoom: 2,
      frameWidthPx: 1,
      frameDuration: 1 / 30,
      scrollLeft: 0,
      viewportWidth: 1000
    });
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.some((tick) => tick.kind === 'major' && tick.label)).toBe(true);
    expect(ticks.some((tick) => tick.kind === 'minor')).toBe(true);
    expect(ticks.every((tick) => tick.left >= 0 && tick.left <= 100)).toBe(true);
    expect(
      buildTimelineTicks({
        duration: 0,
        widthPx: 0,
        pixelsPerSecond: 0,
        zoom: 1,
        frameWidthPx: 0,
        frameDuration: 0.03,
        scrollLeft: 0,
        viewportWidth: 0
      })
    ).toEqual([]);
  });

  it('computes the thumbnail count within limits', () => {
    expect(desiredThumbnailCount(0, 1)).toBe(MIN_THUMBNAILS);
    expect(desiredThumbnailCount(100000, 256)).toBe(MAX_THUMBNAILS);
  });

  it('computes a padded frame-strip window', () => {
    const window = computeFrameStripWindow({
      duration: 120,
      widthPx: 1000,
      scrollLeft: 0,
      viewportWidth: 500,
      fps: 30
    });
    expect(window).not.toBeNull();
    expect(window!.count).toBeLessThanOrEqual(FRAME_STRIP_MAX);
    expect(window!.start).toBeGreaterThanOrEqual(0);
    expect(window!.end).toBeLessThanOrEqual(120);
    expect(
      computeFrameStripWindow({ duration: 0, widthPx: 0, scrollLeft: 0, viewportWidth: 0, fps: 30 })
    ).toBeNull();
  });

  it('checks whether a strip covers the viewport', () => {
    const strip = { startSec: 0, stepSec: 0.5, frames: Array<string>(200).fill('a') };
    expect(
      frameStripCovers({ strip, duration: 10, widthPx: 1000, scrollLeft: 0, viewportWidth: 300 })
    ).toBe(true);
    expect(
      frameStripCovers({
        strip: { ...strip, startSec: 90 },
        duration: 100,
        widthPx: 1000,
        scrollLeft: 0,
        viewportWidth: 300
      })
    ).toBe(false);
    expect(
      frameStripCovers({
        strip: null,
        duration: 10,
        widthPx: 1000,
        scrollLeft: 0,
        viewportWidth: 300
      })
    ).toBe(false);
  });
});
