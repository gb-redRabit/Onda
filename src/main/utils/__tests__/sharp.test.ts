import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  loadSharp: vi.fn(),
  mkdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  access: vi.fn(),
  warn: vi.fn(),
  resize: vi.fn(),
  jpeg: vi.fn(),
  toBuffer: vi.fn()
}));

vi.mock('../lazy-sharp', () => ({ loadSharp: h.loadSharp }));
vi.mock('fs/promises', () => ({
  mkdir: h.mkdir,
  readFile: h.readFile,
  writeFile: h.writeFile,
  access: h.access
}));
vi.mock('../../../shared/logger', () => ({
  logger: { warn: h.warn, info: vi.fn(), error: vi.fn() }
}));

import { SharpService } from '../sharp';

function fakeSharp() {
  const chain = {
    resize: h.resize.mockReturnThis(),
    jpeg: h.jpeg.mockReturnThis(),
    toBuffer: h.toBuffer
  };
  h.resize.mockReturnValue(chain);
  h.jpeg.mockReturnValue(chain);
  return vi.fn(() => chain);
}

const buf = Buffer.from('thumb');

beforeEach(() => {
  h.mkdir.mockReset().mockResolvedValue(undefined);
  h.readFile.mockReset().mockResolvedValue(buf);
  h.writeFile.mockReset().mockResolvedValue(undefined);
  h.access.mockReset().mockRejectedValue(new Error('ENOENT'));
  h.warn.mockClear();
  h.resize.mockReset();
  h.jpeg.mockReset();
  h.toBuffer.mockReset().mockResolvedValue(buf);
  h.loadSharp.mockReset().mockResolvedValue(fakeSharp());
});

describe('SharpService.getThumbnail', () => {
  it('returns a cached thumbnail without decoding', async () => {
    h.access.mockResolvedValue(undefined);

    await expect(SharpService.getThumbnail('D:/a.jpg', 200)).resolves.toBe(buf);
    expect(h.readFile).toHaveBeenCalledWith(expect.stringContaining('.jpg'));
    expect(h.loadSharp).not.toHaveBeenCalled();
  });

  it('generates and caches an image thumbnail', async () => {
    await expect(SharpService.getThumbnail('D:/a.JPG', 120)).resolves.toBe(buf);

    expect(h.resize).toHaveBeenCalledWith(120, 120, { fit: 'outside', withoutEnlargement: true });
    expect(h.jpeg).toHaveBeenCalledWith({ quality: 85, mozjpeg: true });
    expect(h.writeFile).toHaveBeenCalledWith(expect.stringContaining('.jpg'), buf);
  });

  it('ignores unsupported extensions', async () => {
    await expect(SharpService.getThumbnail('D:/a.txt')).resolves.toBeNull();
    expect(h.loadSharp).not.toHaveBeenCalled();
  });

  it('returns null and logs on failure', async () => {
    h.loadSharp.mockRejectedValue(new Error('missing libvips'));

    await expect(SharpService.getThumbnail('D:/a.png')).resolves.toBeNull();
    expect(h.warn).toHaveBeenCalledWith(
      'sharp',
      expect.stringContaining('thumbnail failed for D:/a.png')
    );
  });

  it('limits concurrent sharp work to two', async () => {
    const pending: Array<(value: Buffer) => void> = [];
    h.toBuffer.mockImplementation(() => new Promise<Buffer>((resolve) => pending.push(resolve)));
    const promises = [
      SharpService.getThumbnail('D:/a.jpg'),
      SharpService.getThumbnail('D:/b.jpg'),
      SharpService.getThumbnail('D:/c.jpg')
    ];

    try {
      await vi.waitFor(() => expect(h.toBuffer).toHaveBeenCalledTimes(2));
      pending.shift()!(buf);
      await promises[0];
      await vi.waitFor(() => expect(h.toBuffer).toHaveBeenCalledTimes(3));
      pending.shift()!(buf);
      pending.shift()!(buf);
      await Promise.all(promises);
    } finally {
      while (pending.length) pending.shift()!(buf);
      await Promise.allSettled(promises);
    }
  });
});

describe('SharpService.resize', () => {
  it('resizes supported images', async () => {
    await expect(SharpService.resize('D:/a.webp', 800, 80)).resolves.toBe(buf);

    expect(h.resize).toHaveBeenCalledWith(800, undefined, {
      fit: 'inside',
      withoutEnlargement: true
    });
    expect(h.jpeg).toHaveBeenCalledWith({ quality: 80, mozjpeg: true });
  });

  it('returns null for unsupported files', async () => {
    await expect(SharpService.resize('D:/a.mp4', 800)).resolves.toBeNull();
    expect(h.loadSharp).not.toHaveBeenCalled();
  });

  it('returns null and logs on failure', async () => {
    h.toBuffer.mockRejectedValue(new Error('decode failed'));

    await expect(SharpService.resize('D:/a.png', 100)).resolves.toBeNull();
    expect(h.warn).toHaveBeenCalledWith(
      'sharp',
      expect.stringContaining('resize failed for D:/a.png')
    );
  });
});
