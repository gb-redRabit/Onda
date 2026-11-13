import { beforeEach, describe, it, expect, vi } from 'vitest';

const h = vi.hoisted(() => ({
  id3Update: vi.fn(),
  writeFile: vi.fn(),
  resolveBin: vi.fn(),
  runCommand: vi.fn(),
  replaceFileAtomic: vi.fn(),
  safeRm: vi.fn()
}));

vi.mock('node-id3', () => ({ default: { Promise: { update: h.id3Update } } }));
vi.mock('fs/promises', () => ({ writeFile: h.writeFile }));
vi.mock('../../binaries', () => ({ resolveBin: h.resolveBin }));
vi.mock('../../utils/exec', () => ({ runCommand: h.runCommand }));
vi.mock('../../utils/fs-atomic', () => ({
  replaceFileAtomic: h.replaceFileAtomic,
  safeRm: h.safeRm
}));

// `cover-embed` importuje `binaries` → `electron`, którego nie ma w jsdom.
vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }));

import { coverEmbedSupported, embedCover } from '../cover-embed';

// Regresja: `writeCoverToAudioFile` wołał NodeID3 bez sprawdzenia formatu i dla
// m4a/flac/opus doklejał blok ID3 na początku pliku, uszkadzając kontener.
describe('coverEmbedSupported', () => {
  it('supports ID3 (mp3) and attached_pic containers (m4a/m4b/flac)', () => {
    for (const p of ['a.mp3', 'A.MP3', 'x.m4a', 'x.m4b', 'x.flac']) {
      expect(coverEmbedSupported(p)).toBe(true);
    }
  });

  it('rejects containers where ID3 would corrupt the file', () => {
    for (const p of ['a.opus', 'a.webm', 'a.ogg', 'a.wav', 'a.aac', 'a.mp4', 'noext']) {
      expect(coverEmbedSupported(p)).toBe(false);
    }
  });
});

describe('embedCover', () => {
  it('throws for unsupported containers before touching the file', async () => {
    await expect(
      embedCover('/nonexistent/file.opus', { buffer: Buffer.from('x'), mime: 'image/jpeg' })
    ).rejects.toThrow(/unsupported/i);
  });

  it('names unknown extensions in the error', async () => {
    await expect(
      embedCover('/nonexistent/file', { buffer: Buffer.from('x'), mime: 'image/jpeg' })
    ).rejects.toThrow(/unknown/);
  });
});

const image = { buffer: Buffer.from('img'), mime: 'image/jpeg' };

beforeEach(() => {
  h.id3Update.mockReset().mockResolvedValue(undefined);
  h.writeFile.mockReset().mockResolvedValue(undefined);
  h.resolveBin.mockReset().mockResolvedValue('/bin/ffmpeg');
  h.runCommand.mockReset().mockResolvedValue('');
  h.replaceFileAtomic.mockReset().mockResolvedValue(undefined);
  h.safeRm.mockReset().mockResolvedValue(undefined);
});

describe('embedCover', () => {
  it('writes an ID3 APIC frame for mp3', async () => {
    await embedCover('D:/Music/a.mp3', image);

    expect(h.id3Update).toHaveBeenCalledWith(
      {
        image: {
          mime: 'image/jpeg',
          type: { id: 3 },
          imageBuffer: image.buffer,
          description: 'Cover'
        }
      },
      'D:/Music/a.mp3'
    );
  });

  it('re-muxes attached_pic containers with ffmpeg', async () => {
    await embedCover('D:/Music/a.m4a', image);

    expect(h.writeFile).toHaveBeenCalledWith(expect.stringContaining('onda-cover-'), image.buffer);
    const [bin, args, opts] = h.runCommand.mock.calls[0];
    expect(bin).toBe('/bin/ffmpeg');
    expect(args).toEqual(
      expect.arrayContaining(['-c', 'copy', '-disposition:v:0', 'attached_pic', '-metadata:s:v:0'])
    );
    expect(args).toContain('D:/Music/a.m4a');
    expect(opts).toEqual({ timeout: 60_000 });
    expect(h.replaceFileAtomic).toHaveBeenCalledWith(
      expect.stringContaining('.a.m4a.cover-'),
      'D:/Music/a.m4a'
    );
    expect(h.safeRm).toHaveBeenCalledTimes(2);
  });

  it('falls back to the ffmpeg command name', async () => {
    h.resolveBin.mockResolvedValue(null);

    await embedCover('D:/Music/a.flac', image);

    expect(h.runCommand.mock.calls[0][0]).toBe('ffmpeg');
  });

  it('cleans temporary files when ffmpeg fails', async () => {
    h.runCommand.mockRejectedValue(new Error('ffmpeg failed'));

    await expect(embedCover('D:/Music/a.flac', image)).rejects.toThrow('ffmpeg failed');
    expect(h.replaceFileAtomic).not.toHaveBeenCalled();
    expect(h.safeRm).toHaveBeenCalledTimes(2);
  });
});
