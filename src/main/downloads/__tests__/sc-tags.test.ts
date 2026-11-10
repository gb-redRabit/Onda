import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  update: vi.fn(),
  writeCover: vi.fn(),
  fetchImage: vi.fn(),
  loggerWarn: vi.fn()
}));

vi.mock('node-id3', () => ({ default: { Promise: { update: h.update } } }));
vi.mock('../../../shared/logger', () => ({
  logger: { warn: h.loggerWarn, info: vi.fn(), error: vi.fn() }
}));
vi.mock('../../ipc/media/media-handlers', () => ({
  writeCoverToAudioFile: h.writeCover
}));
vi.mock('../../ipc/remote-image', () => ({ fetchRemoteImageBytes: h.fetchImage }));

import { embedScMp3Tags } from '../sc-tags';

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(8)]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff]);

beforeEach(() => {
  h.update.mockReset();
  h.update.mockResolvedValue(undefined);
  h.writeCover.mockReset();
  h.writeCover.mockResolvedValue({ success: true });
  h.fetchImage.mockReset();
  h.fetchImage.mockResolvedValue(png);
  h.loggerWarn.mockReset();
});

describe('file gating', () => {
  it('ignores non-mp3 files', async () => {
    await expect(
      embedScMp3Tags('D:/a.flac', { title: 'Song', thumbnailUrl: 'https://img/a.jpg' })
    ).resolves.toBe(false);
    expect(h.update).not.toHaveBeenCalled();
    expect(h.fetchImage).not.toHaveBeenCalled();
  });

  it('accepts mp3 case-insensitively', async () => {
    await expect(embedScMp3Tags('D:/A.MP3', { title: 'Song' })).resolves.toBe(true);
    expect(h.update).toHaveBeenCalledWith({ title: 'Song' }, 'D:/A.MP3');
  });
});

describe('tags', () => {
  it('writes every provided tag', async () => {
    await embedScMp3Tags('D:/a.mp3', {
      title: 'Song',
      artist: 'Artist',
      album: 'Album',
      year: '2024'
    });

    expect(h.update).toHaveBeenCalledWith(
      { title: 'Song', artist: 'Artist', album: 'Album', year: '2024' },
      'D:/a.mp3'
    );
  });

  it('skips the ID3 update when no tags are provided', async () => {
    await embedScMp3Tags('D:/a.mp3', { title: '' });
    expect(h.update).not.toHaveBeenCalled();
  });

  it('reports update failures', async () => {
    h.update.mockRejectedValueOnce(new Error('id3'));

    await expect(embedScMp3Tags('D:/a.mp3', { title: 'Song' })).resolves.toBe(false);
    expect(h.loggerWarn).toHaveBeenCalledWith(
      'downloads',
      'sc tags embed failed for D:/a.mp3',
      'Error: id3'
    );
  });
});

describe('artwork', () => {
  it.each([
    [png, 'image/png'],
    [webp, 'image/webp'],
    [jpeg, 'image/jpeg'],
    [Buffer.from([1, 2, 3]), 'image/jpeg']
  ])('detects the artwork mime and embeds it', async (buffer, mime) => {
    h.fetchImage.mockResolvedValue(buffer);

    await embedScMp3Tags('D:/a.mp3', {
      title: 'Song',
      thumbnailUrl: 'https://img/a.jpg'
    });

    expect(h.fetchImage).toHaveBeenCalledWith('https://img/a.jpg');
    expect(h.writeCover).toHaveBeenCalledWith('D:/a.mp3', [...buffer], mime);
    expect(h.loggerWarn).not.toHaveBeenCalled();
  });

  it('skips the cover when no thumbnail is provided', async () => {
    await embedScMp3Tags('D:/a.mp3', { title: 'Song' });
    expect(h.fetchImage).not.toHaveBeenCalled();
    expect(h.writeCover).not.toHaveBeenCalled();
  });

  it('skips empty downloads', async () => {
    h.fetchImage.mockResolvedValueOnce(null);
    await embedScMp3Tags('D:/a.mp3', { title: 'Song', thumbnailUrl: 'https://img/a.jpg' });
    expect(h.writeCover).not.toHaveBeenCalled();

    h.fetchImage.mockResolvedValueOnce(Buffer.alloc(0));
    await embedScMp3Tags('D:/a.mp3', { title: 'Song', thumbnailUrl: 'https://img/a.jpg' });
    expect(h.writeCover).not.toHaveBeenCalled();
  });

  it('logs unsuccessful cover writes', async () => {
    h.writeCover.mockResolvedValueOnce({ success: false, error: 'no support' });

    await expect(
      embedScMp3Tags('D:/a.mp3', { title: 'Song', thumbnailUrl: 'https://img/a.jpg' })
    ).resolves.toBe(true);
    expect(h.loggerWarn).toHaveBeenCalledWith(
      'downloads',
      'sc cover embed failed for D:/a.mp3',
      'no support'
    );
  });

  it('handles artwork fetch failures', async () => {
    h.fetchImage.mockRejectedValueOnce(new Error('429'));

    await expect(
      embedScMp3Tags('D:/a.mp3', { title: 'Song', thumbnailUrl: 'https://img/a.jpg' })
    ).resolves.toBe(false);
    expect(h.loggerWarn).toHaveBeenCalledWith(
      'downloads',
      'sc tags embed failed for D:/a.mp3',
      'Error: 429'
    );
  });

  it('handles cover write exceptions', async () => {
    h.writeCover.mockRejectedValueOnce(new Error('disk'));

    await expect(
      embedScMp3Tags('D:/a.mp3', { title: 'Song', thumbnailUrl: 'https://img/a.jpg' })
    ).resolves.toBe(false);
    expect(h.loggerWarn).toHaveBeenCalledWith(
      'downloads',
      'sc tags embed failed for D:/a.mp3',
      'Error: disk'
    );
  });
});
