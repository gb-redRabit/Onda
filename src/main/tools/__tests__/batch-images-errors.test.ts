import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type { WebContents } from 'electron';

// Error-path tests with a stubbed encoder: non-Error throws must surface as strings.

const h = vi.hoisted(() => ({
  encodeImageBuffer: vi.fn(),
  warn: vi.fn()
}));

vi.mock('../image-studio', () => ({
  IMAGE_EXTENSIONS: new Set(['.png']),
  encodeImageBuffer: h.encodeImageBuffer
}));
vi.mock('../../../shared/logger', () => ({
  logger: { warn: h.warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import { batchConvertImages } from '../batch-images';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'onda-batch-errors-'));
  h.encodeImageBuffer.mockReset();
  h.warn.mockClear();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

function sender(): WebContents {
  return { isDestroyed: () => false, send: vi.fn() } as unknown as WebContents;
}

describe('batch image conversion failures', () => {
  it('stringifies a thrown non-Error value', async () => {
    const input = join(dir, 'a.png');
    await writeFile(input, 'x');
    h.encodeImageBuffer.mockRejectedValue('encoder exploded');

    const result = await batchConvertImages(sender(), {
      jobId: 'job-string-error',
      inputPaths: [input],
      format: 'png'
    });

    expect(result.success).toBe(true);
    expect(result.results[0]).toMatchObject({ success: false, error: 'encoder exploded' });
    expect(h.warn).toHaveBeenCalledWith(
      'tools',
      expect.stringContaining('batch image failed'),
      'encoder exploded'
    );
  });

  it('reports Error messages from a failed encode', async () => {
    const input = join(dir, 'b.png');
    await writeFile(input, 'x');
    h.encodeImageBuffer.mockRejectedValueOnce(new Error('decode failed'));

    const result = await batchConvertImages(sender(), {
      jobId: 'job-error',
      inputPaths: [input],
      format: 'jpeg'
    });

    expect(result.results[0]).toMatchObject({ success: false, error: 'decode failed' });
    expect(h.encodeImageBuffer).toHaveBeenCalledWith(
      expect.any(Buffer),
      'jpeg',
      85,
      undefined,
      undefined
    );
  });
});
