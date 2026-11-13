import { beforeEach, describe, expect, it, vi } from 'vitest';

type ThumbApi = typeof import('../thumbLoader');

let thumb: ThumbApi;

const PNG = 'data:image/png;base64,AAAA';

beforeEach(async () => {
  vi.resetModules();
  thumb = await import('../thumbLoader');
  thumb.thumbTasks.length = 0;
});

describe('isUsableImageDataUrl', () => {
  it('accepts image data urls with a payload', () => {
    expect(thumb.isUsableImageDataUrl(PNG)).toBe(true);
    expect(thumb.isUsableImageDataUrl('data:image/svg+xml;base64,AAA')).toBe(true);
  });

  it('rejects empty, malformed and non-image values', () => {
    expect(thumb.isUsableImageDataUrl(null)).toBe(false);
    expect(thumb.isUsableImageDataUrl(undefined)).toBe(false);
    expect(thumb.isUsableImageDataUrl('')).toBe(false);
    expect(thumb.isUsableImageDataUrl('data:image/png;base64,')).toBe(false);
    expect(thumb.isUsableImageDataUrl('https://example.com/a.png')).toBe(false);
    expect(thumb.isUsableImageDataUrl({} as never)).toBe(false);
  });
});

describe('thumbnail cache', () => {
  it('stores and reads usable thumbnails', () => {
    thumb.setCachedThumb('D:/a.png', PNG);

    expect(thumb.cachedThumb('D:/a.png')).toBe(PNG);
    expect(thumb.cachedThumb('D:/missing.png')).toBeUndefined();
  });

  it('ignores unusable thumbnails', () => {
    thumb.setCachedThumb('D:/bad.png', 'nope');

    expect(thumb.cachedThumb('D:/bad.png')).toBeUndefined();
  });
});

describe('icon cache', () => {
  it('stores and reads usable icons', () => {
    thumb.setCachedIcon('D:/app.exe', PNG);

    expect(thumb.cachedIcon('D:/app.exe')).toBe(PNG);
    expect(thumb.cachedIcon('D:/other.exe')).toBeUndefined();
  });

  it('ignores unusable icons', () => {
    thumb.setCachedIcon('D:/bad.exe', '');

    expect(thumb.cachedIcon('D:/bad.exe')).toBeUndefined();
  });
});

describe('thumbnail queue', () => {
  it('runs at most three tasks at once', () => {
    const tasks = Array.from({ length: 5 }, (_, i) => vi.fn(() => i));
    thumb.thumbTasks.push(...tasks);

    thumb.processThumbQueue();

    expect(tasks.filter((task) => task.mock.calls.length > 0)).toHaveLength(3);
    expect(thumb.thumbTasks).toHaveLength(2);
  });

  it('starts the next task when one finishes', () => {
    const tasks = Array.from({ length: 4 }, () => vi.fn());
    thumb.thumbTasks.push(...tasks);
    thumb.processThumbQueue();

    thumb.thumbTaskDone();

    expect(tasks[3]).toHaveBeenCalledTimes(1);
  });

  it('drains the queue and stops on an empty queue', () => {
    const tasks = Array.from({ length: 4 }, () => vi.fn());
    thumb.thumbTasks.push(...tasks);
    thumb.processThumbQueue();

    for (let i = 0; i < 4; i++) thumb.thumbTaskDone();

    expect(tasks.every((task) => task.mock.calls.length === 1)).toBe(true);
    expect(thumb.thumbTasks).toHaveLength(0);
    expect(() => thumb.processThumbQueue()).not.toThrow();
  });
});
