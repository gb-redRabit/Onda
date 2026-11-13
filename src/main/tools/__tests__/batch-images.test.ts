import { existsSync } from 'fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebContents } from 'electron';
import sharp from 'sharp';
import {
  batchConvertImages,
  cancelBatchImages,
  cancelAllBatchImages,
  resolveBatchOutputPath
} from '../batch-images';

let dir: string;

async function makePng(width: number, height: number): Promise<Buffer> {
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

function fakeSender(): { sender: WebContents; send: ReturnType<typeof vi.fn> } {
  const send = vi.fn();
  return {
    sender: { isDestroyed: () => false, send } as unknown as WebContents,
    send
  };
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'onda-batch-images-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

describe('resolveBatchOutputPath', () => {
  it('avoids overwriting the source in the same folder', async () => {
    const input = join(dir, 'photo.png');
    await writeFile(input, '');
    expect(resolveBatchOutputPath(input, undefined, '.png')).toBe(join(dir, 'photo-converted.png'));
  });

  it('keeps the base name when the output folder differs', () => {
    expect(resolveBatchOutputPath(join(dir, 'photo.png'), join(dir, 'out'), '.webp')).toBe(
      join(dir, 'out', 'photo.webp')
    );
  });

  it('avoids overwriting an existing output', async () => {
    const input = join(dir, 'photo.png');
    const existing = join(dir, 'out', 'photo.webp');
    await writeFile(input, '');
    await mkdir(join(dir, 'out'), { recursive: true });
    await writeFile(existing, '');
    expect(resolveBatchOutputPath(input, join(dir, 'out'), '.webp')).toBe(
      join(dir, 'out', 'photo-converted.webp')
    );
  });

  it('keeps appending an index while converted names are taken', async () => {
    const input = join(dir, 'photo.png');
    const outDir = join(dir, 'out');
    await writeFile(input, '');
    await mkdir(outDir, { recursive: true });
    await writeFile(join(outDir, 'photo.webp'), '');
    await writeFile(join(outDir, 'photo-converted.webp'), '');
    await writeFile(join(outDir, 'photo-converted-2.webp'), '');

    expect(resolveBatchOutputPath(input, outDir, '.webp')).toBe(
      join(outDir, 'photo-converted-3.webp')
    );
  });
});

describe('batchConvertImages', () => {
  it('converts and resizes every image and emits progress', async () => {
    const inputA = join(dir, 'a.png');
    const inputB = join(dir, 'b.png');
    await writeFile(inputA, await makePng(120, 80));
    await writeFile(inputB, await makePng(90, 60));
    const outDir = join(dir, 'out');
    const { sender, send } = fakeSender();

    const result = await batchConvertImages(sender, {
      jobId: 'job-1',
      inputPaths: [inputA, inputB],
      outputDir: outDir,
      format: 'webp',
      quality: 80,
      maxWidth: 40
    });

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(2);
    for (const item of result.results) {
      expect(item.success).toBe(true);
      expect(item.outputPath && existsSync(item.outputPath)).toBe(true);
      const meta = await sharp(await readFile(item.outputPath as string)).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.width).toBeLessThanOrEqual(40);
    }
    const progress = send.mock.calls.filter(([channel]) => channel === 'tools:batchImagesProgress');
    expect(progress.length).toBeGreaterThanOrEqual(4);
  });

  it('reports unsupported files per item without failing the job', async () => {
    const textPath = join(dir, 'notes.txt');
    await writeFile(textPath, 'hello');
    const { sender } = fakeSender();

    const result = await batchConvertImages(sender, {
      jobId: 'job-2',
      inputPaths: [textPath],
      format: 'png'
    });

    expect(result.success).toBe(true);
    expect(result.results[0]).toMatchObject({ success: false, error: 'Unsupported image format' });
  });

  it('rejects invalid requests', async () => {
    const { sender } = fakeSender();
    await expect(batchConvertImages(sender, null)).resolves.toMatchObject({
      success: false,
      error: 'Invalid request'
    });
    await expect(
      batchConvertImages(sender, { jobId: 'x', inputPaths: [], format: 'png' })
    ).resolves.toMatchObject({ success: false, error: 'No input files' });
    await expect(
      batchConvertImages(sender, { jobId: 'x', inputPaths: [join(dir, 'a.png')], format: 'gif' })
    ).resolves.toMatchObject({ success: false, error: 'Invalid format' });
  });

  it('returns false when cancelling an unknown job', () => {
    expect(cancelBatchImages('missing')).toBe(false);
  });

  it('reports per-item failures for directories and invalid requests', async () => {
    const { sender } = fakeSender();
    const folder = join(dir, 'folder.png');
    await mkdir(folder);

    const dirResult = await batchConvertImages(sender, {
      jobId: 'job-dir',
      inputPaths: [folder],
      format: 'png'
    });
    expect(dirResult.results[0]).toMatchObject({ success: false, error: 'Not a file' });

    await expect(
      batchConvertImages(sender, { jobId: '', inputPaths: [folder], format: 'png' })
    ).resolves.toMatchObject({ success: false, error: 'Invalid job id' });

    const relative = await batchConvertImages(sender, {
      jobId: 'job-rel',
      inputPaths: ['relative.png'],
      format: 'png'
    });
    expect(relative.success).toBe(true);
    expect(relative.results[0]).toMatchObject({ success: false, error: 'Invalid path' });

    await expect(
      batchConvertImages(sender, {
        jobId: 'job-out',
        inputPaths: [folder],
        format: 'png',
        outputDir: 'relative-dir'
      })
    ).resolves.toMatchObject({ success: false, error: 'Invalid output folder' });

    const protectedDir = process.platform === 'win32' ? 'C:\\Windows' : '/etc';
    await expect(
      batchConvertImages(sender, {
        jobId: 'job-protected',
        inputPaths: [folder],
        format: 'png',
        outputDir: protectedDir
      })
    ).resolves.toMatchObject({ success: false, error: 'Invalid output folder' });
  });

  it('writes JPEG output and clamps non-positive dimensions', async () => {
    const input = join(dir, 'jpeg.png');
    await writeFile(input, await makePng(120, 80));
    const { sender } = fakeSender();

    const result = await batchConvertImages(sender, {
      jobId: 'job-jpeg',
      inputPaths: [input],
      format: 'jpeg',
      maxWidth: 0,
      maxHeight: -10
    });

    const outputPath = result.results[0]!.outputPath as string;
    expect(outputPath.endsWith('.jpg')).toBe(true);
    const meta = await sharp(await readFile(outputPath)).metadata();
    expect(meta.format).toBe('jpeg');
  });

  it('does not send progress to a destroyed sender', async () => {
    const input = join(dir, 'destroyed.png');
    await writeFile(input, await makePng(20, 20));
    const send = vi.fn();
    const sender = { isDestroyed: () => true, send } as unknown as WebContents;

    const result = await batchConvertImages(sender, {
      jobId: 'job-destroyed',
      inputPaths: [input],
      format: 'png'
    });

    expect(result.success).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });

  it('stops a running job when cancelled', async () => {
    const inputA = join(dir, 'cancel-a.png');
    const inputB = join(dir, 'cancel-b.png');
    await writeFile(inputA, await makePng(20, 20));
    await writeFile(inputB, await makePng(20, 20));
    const send = vi.fn((channel: string, payload: { status: string }) => {
      if (channel === 'tools:batchImagesProgress' && payload.status === 'done') {
        cancelBatchImages('job-cancel');
      }
    });
    const sender = { isDestroyed: () => false, send } as unknown as WebContents;

    const result = await batchConvertImages(sender, {
      jobId: 'job-cancel',
      inputPaths: [inputA, inputB],
      format: 'png'
    });

    expect(result.canceled).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(cancelBatchImages('job-cancel')).toBe(false);
  });

  it('cancels every active job at shutdown', async () => {
    const input = join(dir, 'all.png');
    await writeFile(input, await makePng(20, 20));
    const send = vi.fn((channel: string, payload: { status: string }) => {
      if (channel === 'tools:batchImagesProgress' && payload.status === 'done') {
        cancelAllBatchImages();
      }
    });
    const sender = { isDestroyed: () => false, send } as unknown as WebContents;

    const result = await batchConvertImages(sender, {
      jobId: 'job-all',
      inputPaths: [input, input],
      format: 'png'
    });

    expect(result.canceled).toBe(true);
  });
});
