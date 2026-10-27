import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { estimateEditedImage, readImageForEditing, saveEditedImage } from '../image-studio';

let dir: string;

async function makePng(width = 8, height = 6): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 200, g: 40, b: 40, alpha: 1 }
    }
  })
    .png()
    .toBuffer();
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'onda-image-studio-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

describe('readImageForEditing', () => {
  it('rejects unsafe paths and unsupported extensions', async () => {
    await expect(readImageForEditing('relative.png')).resolves.toMatchObject({
      success: false,
      error: 'Invalid path'
    });
    await expect(readImageForEditing(join(dir, 'file.txt'))).resolves.toMatchObject({
      success: false,
      error: 'Unsupported image format'
    });
  });

  it('returns a PNG data URL with the working dimensions', async () => {
    const source = join(dir, 'source.png');
    await writeFile(source, await makePng(40, 20));

    const result = await readImageForEditing(source);
    expect(result.success).toBe(true);
    expect(result.width).toBe(40);
    expect(result.height).toBe(20);
    expect(result.dataUrl?.startsWith('data:image/png;base64,')).toBe(true);
    expect(result.bytes).toBeGreaterThan(0);
  });

  it('reports a missing file instead of throwing', async () => {
    const result = await readImageForEditing(join(dir, 'missing.png'));
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe('saveEditedImage', () => {
  it('encodes the canvas PNG to the requested format', async () => {
    const png = await makePng(20, 10);
    const outputPath = join(dir, 'out.webp');

    const result = await saveEditedImage({
      png: Array.from(png),
      outputPath,
      format: 'webp',
      quality: 80
    });

    expect(result.success).toBe(true);
    expect(result.outputPath).toBe(outputPath);
    expect(result.bytes).toBeGreaterThan(0);
    // Czytamy z bufora, nie ze ścieżki: libvips na Windows trzyma handle pliku
    // do GC, co blokowałoby sprzątanie katalogu w afterEach.
    const meta = await sharp(await readFile(outputPath)).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(20);
    expect(meta.height).toBe(10);
  });

  it('flattens transparency to white for jpeg', async () => {
    const png = await makePng(4, 4);
    const outputPath = join(dir, 'out.jpg');
    const result = await saveEditedImage({
      png: Array.from(png),
      outputPath,
      format: 'jpeg',
      quality: 70
    });
    expect(result.success).toBe(true);
    const { data, info } = await sharp(await readFile(outputPath))
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(3);
    // Piksel (0,0) po spłaszczeniu nie jest czarny (tło #fff, obraz czerwony).
    expect(data[0] + data[1] + data[2]).toBeGreaterThan(20);
  });

  it('rejects invalid requests', async () => {
    await expect(saveEditedImage(null)).resolves.toMatchObject({ success: false });
    await expect(
      saveEditedImage({ png: [], outputPath: join(dir, 'x.png'), format: 'png' })
    ).resolves.toMatchObject({ success: false });
    await expect(
      saveEditedImage({ png: [1, 2, 3], outputPath: join(dir, 'x.gif'), format: 'gif' })
    ).resolves.toMatchObject({ success: false, error: 'Invalid format' });
  });
});

describe('estimateEditedImage', () => {
  it('returns the encoded size for png and webp', async () => {
    const png = await makePng(16, 16);
    const pngEstimate = await estimateEditedImage({ png: Array.from(png), format: 'png' });
    expect(pngEstimate.success).toBe(true);
    expect(pngEstimate.bytes).toBeGreaterThan(0);

    const webpEstimate = await estimateEditedImage({
      png: Array.from(png),
      format: 'webp',
      quality: 60
    });
    expect(webpEstimate.success).toBe(true);
    expect(webpEstimate.bytes).toBeGreaterThan(0);
  });
});
