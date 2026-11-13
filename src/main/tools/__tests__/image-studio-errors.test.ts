import { beforeEach, describe, expect, it, vi } from 'vitest';

// Error paths of the image studio: sharp and the filesystem are mocked so the
// failure branches (decode errors, write errors, oversized payloads) can be
// exercised deterministically. The happy path runs against real sharp in
// `image-studio.test.ts`.

const h = vi.hoisted(() => ({
  loadSharp: vi.fn(),
  stat: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  isProtectedPath: vi.fn(() => false),
  isSafeAbsolutePath: vi.fn(() => true),
  replaceFileAtomic: vi.fn(),
  safeRm: vi.fn(),
  warn: vi.fn()
}));

vi.mock('../../utils/lazy-sharp', () => ({ loadSharp: h.loadSharp }));
vi.mock('fs/promises', () => ({
  mkdir: h.mkdir,
  readFile: h.readFile,
  stat: h.stat,
  writeFile: h.writeFile
}));
vi.mock('../../path-policy', () => ({ isProtectedPath: h.isProtectedPath }));
vi.mock('../../utils/validate', () => ({ isSafeAbsolutePath: h.isSafeAbsolutePath }));
vi.mock('../../utils/fs-atomic', () => ({
  replaceFileAtomic: h.replaceFileAtomic,
  safeRm: h.safeRm
}));
vi.mock('../../../shared/logger', () => ({
  logger: { warn: h.warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import {
  encodeImageBuffer,
  estimateEditedImage,
  IMAGE_EXTENSIONS,
  readImageForEditing,
  saveEditedImage
} from '../image-studio';

function pipeline() {
  const chain = {
    rotate: vi.fn(),
    resize: vi.fn(),
    flatten: vi.fn(),
    jpeg: vi.fn(),
    webp: vi.fn(),
    avif: vi.fn(),
    png: vi.fn(),
    metadata: vi.fn(async () => ({ width: 800, height: 600, format: 'jpeg' })),
    toBuffer: vi.fn(async () => {
      const buffer = Buffer.from('encoded');
      return Object.assign(buffer, {
        data: buffer,
        info: { width: 640, height: 480 }
      });
    })
  };
  for (const method of ['rotate', 'resize', 'flatten', 'jpeg', 'webp', 'avif', 'png'] as const) {
    chain[method].mockReturnValue(chain);
  }
  return chain;
}

let chain: ReturnType<typeof pipeline>;

beforeEach(() => {
  chain = pipeline();
  h.loadSharp.mockReset().mockResolvedValue(() => chain);
  h.stat.mockReset().mockResolvedValue({ isFile: () => true, size: 1234 });
  h.readFile.mockReset().mockResolvedValue(Buffer.from('image'));
  h.writeFile.mockReset().mockResolvedValue(undefined);
  h.mkdir.mockReset().mockResolvedValue(undefined);
  h.isProtectedPath.mockReset().mockReturnValue(false);
  h.isSafeAbsolutePath.mockReset().mockReturnValue(true);
  h.replaceFileAtomic.mockReset().mockResolvedValue(undefined);
  h.safeRm.mockReset().mockResolvedValue(undefined);
  h.warn.mockClear();
});

describe('encodeImageBuffer', () => {
  it('encodes jpeg with a flattened background', async () => {
    await encodeImageBuffer(Buffer.from('x'), 'jpeg', 80);

    expect(chain.flatten).toHaveBeenCalledWith({ background: '#ffffff' });
    expect(chain.jpeg).toHaveBeenCalledWith({ quality: 80 });
  });

  it('encodes webp, avif and png with their settings', async () => {
    await encodeImageBuffer(Buffer.from('x'), 'webp', 70);
    await encodeImageBuffer(Buffer.from('x'), 'avif', 60);
    await encodeImageBuffer(Buffer.from('x'), 'png', 50);

    expect(chain.webp).toHaveBeenCalledWith({ quality: 70 });
    expect(chain.avif).toHaveBeenCalledWith({ quality: 60 });
    expect(chain.png).toHaveBeenCalledWith({ compressionLevel: 9 });
  });

  it('resizes only when a bound is provided', async () => {
    await encodeImageBuffer(Buffer.from('x'), 'png', 80, 100, 0);

    expect(chain.resize).toHaveBeenCalledWith({
      width: 100,
      height: undefined,
      fit: 'inside',
      withoutEnlargement: true
    });

    await encodeImageBuffer(Buffer.from('x'), 'png', 80, 0, 50);
    expect(chain.resize).toHaveBeenLastCalledWith({
      width: undefined,
      height: 50,
      fit: 'inside',
      withoutEnlargement: true
    });
  });
});

describe('readImageForEditing', () => {
  it('reads and converts an image to a working PNG', async () => {
    const result = await readImageForEditing('D:/pics/a.jpg');

    expect(result).toMatchObject({
      success: true,
      width: 640,
      height: 480,
      sourceWidth: 800,
      sourceHeight: 600,
      bytes: 1234,
      format: 'jpeg'
    });
    expect(result.success && result.dataUrl?.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('falls back to working dimensions when metadata omits them', async () => {
    chain.metadata.mockResolvedValueOnce({
      width: undefined,
      height: undefined,
      format: undefined
    } as never);

    const result = await readImageForEditing('D:/pics/a.png');

    expect(result).toMatchObject({ sourceWidth: 640, sourceHeight: 480, format: 'unknown' });
  });

  it('rejects invalid paths, unsupported formats and non-files', async () => {
    h.isSafeAbsolutePath.mockReturnValueOnce(false);
    await expect(readImageForEditing('relative.jpg')).resolves.toEqual({
      success: false,
      error: 'Invalid path'
    });

    await expect(readImageForEditing('D:/a.txt')).resolves.toEqual({
      success: false,
      error: 'Unsupported image format'
    });

    h.stat.mockResolvedValueOnce({ isFile: () => false, size: 1 });
    await expect(readImageForEditing('D:/a.jpg')).resolves.toMatchObject({ success: false });
  });

  it('reports decoding failures', async () => {
    h.loadSharp.mockRejectedValueOnce(new Error('no libvips'));

    await expect(readImageForEditing('D:/a.jpg')).resolves.toEqual({
      success: false,
      error: 'no libvips'
    });
    expect(h.warn).toHaveBeenCalled();
  });

  it('covers the supported extension list', () => {
    expect(IMAGE_EXTENSIONS.has('.heic')).toBe(true);
    expect(IMAGE_EXTENSIONS.has('.gif')).toBe(true);
  });
});

describe('saveEditedImage', () => {
  it('writes the encoded image atomically', async () => {
    const result = await saveEditedImage({
      outputPath: 'D:/out/a.webp',
      format: 'webp',
      quality: 200,
      png: [1, 2, 3]
    });

    expect(result).toEqual({ success: true, outputPath: 'D:/out/a.webp', bytes: 7 });
    expect(chain.webp).toHaveBeenCalledWith({ quality: 100 });
    expect(h.replaceFileAtomic).toHaveBeenCalled();
    expect(h.safeRm).toHaveBeenCalled();
  });

  it('rejects malformed requests and paths', async () => {
    await expect(saveEditedImage(null)).resolves.toEqual({
      success: false,
      error: 'Invalid request'
    });
    await expect(saveEditedImage([])).resolves.toEqual({
      success: false,
      error: 'Invalid request'
    });

    h.isSafeAbsolutePath.mockReturnValueOnce(false);
    await expect(saveEditedImage({ png: [1], format: 'png' })).resolves.toEqual({
      success: false,
      error: 'Invalid output path'
    });

    h.isProtectedPath.mockReturnValueOnce(true);
    await expect(
      saveEditedImage({ outputPath: 'C:/Windows/x.png', png: [1], format: 'png' })
    ).resolves.toEqual({ success: false, error: 'Protected path' });

    await expect(
      saveEditedImage({ outputPath: 'D:/x.png', png: [1], format: 'gif' })
    ).resolves.toEqual({ success: false, error: 'Invalid format' });
  });

  it('rejects empty, oversized or invalid PNG payloads', async () => {
    await expect(
      saveEditedImage({ outputPath: 'D:/x.png', png: [], format: 'png' })
    ).resolves.toEqual({ success: false, error: 'Invalid image data' });

    const oversized = new Proxy([], {
      get: (target, key) => (key === 'length' ? 200 * 1024 * 1024 + 1 : Reflect.get(target, key))
    });
    await expect(
      saveEditedImage({ outputPath: 'D:/x.png', png: oversized, format: 'png' })
    ).resolves.toEqual({ success: false, error: 'Image data too large' });
  });

  it('reports encoding and write failures', async () => {
    chain.toBuffer.mockRejectedValueOnce(new Error('encode failed'));
    await expect(
      saveEditedImage({ outputPath: 'D:/x.png', png: [1], format: 'png' })
    ).resolves.toEqual({ success: false, error: 'Image encoding failed: encode failed' });

    h.writeFile.mockRejectedValueOnce(new Error('disk full'));
    const result = await saveEditedImage({ outputPath: 'D:/x.png', png: [1], format: 'png' });
    expect(result).toEqual({ success: false, error: 'disk full' });
    expect(h.warn).toHaveBeenCalled();
  });

  it('stringifies non-Error write failures', async () => {
    h.writeFile.mockRejectedValueOnce('plain failure');

    await expect(
      saveEditedImage({ outputPath: 'D:/x.png', png: [1], format: 'png' })
    ).resolves.toEqual({ success: false, error: 'plain failure' });
  });
});

describe('estimateEditedImage', () => {
  it('returns the encoded size', async () => {
    await expect(estimateEditedImage({ format: 'png', png: [1, 2] })).resolves.toEqual({
      success: true,
      bytes: 7
    });
  });

  it('validates the request, format and payload', async () => {
    await expect(estimateEditedImage(null)).resolves.toEqual({
      success: false,
      error: 'Invalid request'
    });
    await expect(estimateEditedImage({ format: 'gif', png: [1] })).resolves.toEqual({
      success: false,
      error: 'Invalid format'
    });
    await expect(estimateEditedImage({ format: 'png', png: [] })).resolves.toEqual({
      success: false,
      error: 'Invalid image data'
    });
  });

  it('reports encoding failures', async () => {
    chain.toBuffer.mockRejectedValueOnce(new Error('boom'));

    await expect(estimateEditedImage({ format: 'png', png: [1] })).resolves.toEqual({
      success: false,
      error: 'Image encoding failed: boom'
    });
  });
});
